import { Feather } from '@expo/vector-icons';
import { Camera, CameraView, type CameraType, type FlashMode } from 'expo-camera';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, interpolate, interpolateColor, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import type { Locale } from '../design/theme';
import { canCapture, canDismissFromOutside, cameraFlowReducer, initialCameraFlow, isCameraMounted, type CameraFlowState, type CapturedPhoto } from './cameraFlow';

export type CameraSheetRect = { x: number; y: number; width: number; height: number };
export type CameraSheetHandle = { handleBack: () => boolean };

type Props = {
  open: boolean;
  /** Attachment menu card the sheet grows out of; null slides the sheet up from the bottom edge. */
  origin: CameraSheetRect | null;
  locale: Locale;
  /** Colour of the menu card the sheet morphs from, and of the chat canvas behind the rounded corners. */
  palette: { surface: string; canvas: string };
  reducedMotion: boolean;
  bottomInset: number;
  /** Height kept free above the sheet so the chat header stays visible. */
  topReserve: number;
  onRequestClose: () => void;
  onExited: () => void;
  onAccept: (photo: CapturedPhoto) => Promise<void>;
};

// Geometry measured from the ChatGPT reference capture on a 360×792 dp OnePlus viewport (dp).
const SHEET_RADIUS = 38;
const MENU_RADIUS = 22;
const SHUTTER_SIZE = 72;
const SHUTTER_FILL = 60;
const SIDE_BUTTON = 44;
const SIDE_INSET = 30;
const MIN_CONTROL_CENTER = 52;
// CameraX's default capture ratio is 4:3, so a 3:4 viewfinder shows exactly the photo that will be taken.
const VIEWFINDER_RATIO = 4 / 3;
// Enough for MAX_IMAGE_DIMENSION after rotation without decoding a full sensor frame on the JS-facing path.
const PICTURE_SIZE = '2048x1536';
const READY_TIMEOUT_MS = 6000;
const ENTER = { duration: 380, easing: Easing.bezier(0.2, 0, 0, 1) };
const EXIT = { duration: 240, easing: Easing.bezier(0.3, 0, 0.8, 0.15) };
const HUD = { chip: 'rgba(18,18,18,0.5)', ring: 'rgba(18,18,18,0.42)', fillIdle: '#CFCFCF', menu: 'rgba(36,36,36,0.97)', text: '#FFFFFF', muted: '#B4B4B4' };
const FLASH_ORDER: FlashMode[] = ['off', 'auto', 'on'];

const deleteCapture = (uri: string) => { void LegacyFileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined); };

/** Covers the square outside a rounded corner. The native preview is a SurfaceView, which ignores ancestor corner clipping. */
function CornerMask({ side, color }: { side: 'left' | 'right'; color: string }) {
  const ring = SHEET_RADIUS;
  const size = (SHEET_RADIUS + ring) * 2;
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, [side]: 0, width: SHEET_RADIUS, height: SHEET_RADIUS, overflow: 'hidden' }}>
    <View style={{ position: 'absolute', top: -ring, [side]: -ring, width: size, height: size, borderRadius: size / 2, borderWidth: ring, borderColor: color }} />
  </View>;
}

export const CameraSheet = forwardRef<CameraSheetHandle, Props>(function CameraSheet({ open, origin, locale, palette, reducedMotion, bottomInset, topReserve, onRequestClose, onExited, onAccept }, ref) {
  const de = locale === 'de';
  const [state, dispatch] = useReducer(cameraFlowReducer, initialCameraFlow);
  const stateRef = useRef<CameraFlowState>(state); stateRef.current = state;
  const openRef = useRef(open); openRef.current = open;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [menuOpen, setMenuOpen] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const capturesRef = useRef(new Set<string>());
  // Reducer state lags a render behind; this blocks a second shutter tap landing in the same frame.
  const captureInFlightRef = useRef(false);
  const lastPhotoRef = useRef<CapturedPhoto | undefined>(undefined);
  const permissionRequestRef = useRef<ReturnType<typeof Camera.requestCameraPermissionsAsync> | null>(null);

  const width = size?.width ?? 0; const height = size?.height ?? 0;
  const sheetHeight = Math.round(Math.max(0, Math.min(width * VIEWFINDER_RATIO, height - topReserve)));
  const sheetTop = height - sheetHeight;
  const controlCenter = Math.max(MIN_CONTROL_CENTER, bottomInset + 30);

  const progress = useSharedValue(0); const live = useSharedValue(0); const flashOverlay = useSharedValue(0);
  const fromX = useSharedValue(0); const fromY = useSharedValue(0); const fromWidth = useSharedValue(0); const fromHeight = useSharedValue(0); const fromRadius = useSharedValue(SHEET_RADIUS); const morph = useSharedValue(0);
  const target = useSharedValue({ top: 0, width: 0, height: 0 });
  useEffect(() => { target.value = { top: sheetTop, width, height: sheetHeight }; }, [sheetTop, width, sheetHeight, target]);

  const checkPermission = useCallback(async (session: number, ask: boolean) => {
    try {
      let result = await Camera.getCameraPermissionsAsync();
      if (!result.granted && result.canAskAgain && ask) {
        // A reopen while the system dialog is still up joins that request instead of stacking a second dialog.
        permissionRequestRef.current ??= Camera.requestCameraPermissionsAsync().finally(() => { permissionRequestRef.current = null; });
        result = await permissionRequestRef.current;
      }
      dispatch({ type: 'permission', session, permission: result.granted ? 'granted' : result.canAskAgain ? 'denied' : 'blocked' });
    } catch {
      dispatch({ type: 'permission', session, permission: 'denied' });
    }
  }, []);

  useEffect(() => { dispatch({ type: open ? 'open' : 'close' }); if (!open) setMenuOpen(false); }, [open]);

  const markExpanded = useCallback((session: number) => dispatch({ type: 'expanded', session }), []);
  const hasSize = size !== null;
  // Entrance: runs once per opened session, after the layer has been measured.
  useEffect(() => {
    if (state.phase === 'closed' || !hasSize) return;
    const session = state.session;
    const resumingExit = progress.value > 0.001;
    if (!resumingExit) {
      const start = origin ?? { x: 0, y: height, width, height: sheetHeight };
      fromX.value = start.x; fromY.value = start.y; fromWidth.value = start.width; fromHeight.value = start.height;
      fromRadius.value = origin ? MENU_RADIUS : SHEET_RADIUS; morph.value = origin ? 1 : 0;
    }
    progress.value = withTiming(1, reducedMotion ? { duration: 1 } : ENTER, finished => { if (finished) runOnJS(markExpanded)(session); });
    void checkPermission(session, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.session, hasSize]);

  // Exit always slides straight down so the composer is revealed in place.
  useEffect(() => {
    if (open || !hasSize) return;
    fromX.value = 0; fromY.value = height; fromWidth.value = width; fromHeight.value = sheetHeight; fromRadius.value = SHEET_RADIUS; morph.value = 0;
    live.value = withTiming(0, { duration: reducedMotion ? 1 : 90 });
    progress.value = withTiming(0, reducedMotion ? { duration: 1 } : EXIT, finished => { if (finished) runOnJS(onExited)(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasSize]);

  // Warm the preview in only once frames are flowing; CameraX reports "open" slightly before the first frame lands.
  useEffect(() => {
    if (state.ready) live.value = withDelay(reducedMotion ? 0 : 160, withTiming(1, { duration: reducedMotion ? 1 : 280, easing: Easing.out(Easing.quad) }));
    else live.value = 0;
  }, [state.ready, live, reducedMotion]);

  const mounted = isCameraMounted(state);
  useEffect(() => {
    if (!mounted || state.ready) return;
    const { session, mountKey } = state;
    const timer = setTimeout(() => dispatch({ type: 'mountError', session, mountKey }), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [mounted, state.ready, state.session, state.mountKey]);

  useEffect(() => {
    if (!state.notice) return;
    const timer = setTimeout(() => dispatch({ type: 'clearNotice' }), 2600);
    return () => clearTimeout(timer);
  }, [state.notice]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        dispatch({ type: 'foreground' });
        const current = stateRef.current;
        if (current.phase === 'denied' || current.phase === 'camera') void checkPermission(current.session, false);
      } else if (next === 'background') {
        setMenuOpen(false);
        dispatch({ type: 'background' });
      }
    });
    return () => sub.remove();
  }, [checkPermission]);

  // Raw captures live in the cache; the accepted photo is re-encoded into app storage, so every raw file is disposable.
  useEffect(() => {
    if (state.photo) lastPhotoRef.current = state.photo;
    if (state.phase === 'camera') for (const uri of capturesRef.current) { if (uri !== state.photo?.uri) { deleteCapture(uri); capturesRef.current.delete(uri); } }
  }, [state.phase, state.photo]);
  useEffect(() => () => { for (const uri of capturesRef.current) deleteCapture(uri); capturesRef.current.clear(); }, []);
  useEffect(() => { if (open) lastPhotoRef.current = undefined; }, [open]);

  const close = useCallback(() => { setMenuOpen(false); onRequestClose(); }, [onRequestClose]);
  const retake = useCallback(() => dispatch({ type: 'retake' }), []);

  const capture = useCallback(async () => {
    const current = stateRef.current;
    if (captureInFlightRef.current || !canCapture(current) || !cameraRef.current) return;
    captureInFlightRef.current = true;
    setMenuOpen(false);
    dispatch({ type: 'captureStart' });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (!reducedMotion) flashOverlay.value = withSequence(withTiming(0.5, { duration: 45 }), withTiming(0, { duration: 230 }));
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.92, exif: false });
      if (!picture?.uri || !picture.width || !picture.height) throw new Error('Empty capture');
      capturesRef.current.add(picture.uri);
      if (stateRef.current.session !== current.session) return;
      dispatch({ type: 'captured', session: current.session, photo: { uri: picture.uri, width: picture.width, height: picture.height } });
    } catch {
      dispatch({ type: 'captureFailed', session: current.session });
    } finally { captureInFlightRef.current = false; }
  }, [flashOverlay, reducedMotion]);

  const accept = useCallback(async () => {
    const current = stateRef.current;
    if (current.phase !== 'review' || !current.photo) return;
    dispatch({ type: 'saveStart' });
    try {
      await onAccept(current.photo);
      if (stateRef.current.session === current.session && openRef.current) onRequestClose();
    } catch {
      dispatch({ type: 'saveFailed', session: current.session });
    }
  }, [onAccept, onRequestClose]);

  const switchCamera = useCallback(() => {
    setMenuOpen(false);
    const apply = () => { setFacing(value => value === 'back' ? 'front' : 'back'); dispatch({ type: 'remount' }); };
    if (reducedMotion) { apply(); return; }
    live.value = withTiming(0, { duration: 120 }, finished => { if (finished) runOnJS(apply)(); });
  }, [live, reducedMotion]);

  useImperativeHandle(ref, () => ({
    handleBack: () => {
      if (!openRef.current) return false;
      if (menuOpen) { setMenuOpen(false); return true; }
      const current = stateRef.current;
      if (current.capturing || current.phase === 'saving') return true;
      if (current.phase === 'review') { retake(); return true; }
      close();
      return true;
    },
  }), [close, menuOpen, retake]);

  const sheetStyle = useAnimatedStyle(() => {
    const p = progress.value; const to = target.value;
    return {
      left: interpolate(p, [0, 1], [fromX.value, 0]),
      top: interpolate(p, [0, 1], [fromY.value, to.top]),
      width: interpolate(p, [0, 1], [fromWidth.value, to.width]),
      height: interpolate(p, [0, 1], [fromHeight.value, to.height]),
      borderTopLeftRadius: interpolate(p, [0, 1], [fromRadius.value, SHEET_RADIUS]),
      borderTopRightRadius: interpolate(p, [0, 1], [fromRadius.value, SHEET_RADIUS]),
      borderBottomLeftRadius: interpolate(p, [0, 1], [fromRadius.value, 0]),
      borderBottomRightRadius: interpolate(p, [0, 1], [fromRadius.value, 0]),
      // Grown from the menu card: start in its colour, translucent, so the menu reads as expanding into the camera.
      backgroundColor: morph.value ? interpolateColor(p, [0, 0.62], [palette.surface, '#000000']) : '#000000',
      opacity: morph.value ? interpolate(p, [0, 0.2], [0, 1], 'clamp') : 1,
    };
  });
  const controlsStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.45, 1], [0, 1], 'clamp') }));
  const coverStyle = useAnimatedStyle(() => ({ opacity: 1 - live.value }));
  const chipStyle = useAnimatedStyle(() => ({ opacity: live.value }));
  const shutterFillStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(live.value, [0, 1], [HUD.fillIdle, '#FFFFFF']) }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOverlay.value }));

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setSize(current => current && current.width === w && current.height === h ? current : { width: w, height: h });
  }, []);

  const shownPhoto = state.photo ?? (!open ? lastPhotoRef.current : undefined);
  const reviewing = state.phase === 'review' || state.phase === 'saving';
  const showCameraControls = state.phase !== 'review' && state.phase !== 'saving';
  const flashLabel = flash === 'on' ? (de ? 'An' : 'On') : flash === 'auto' ? 'Auto' : (de ? 'Aus' : 'Off');
  const noticeText = state.notice === 'capture' ? (de ? 'Foto konnte nicht aufgenommen werden. Versuche es erneut.' : 'Couldn’t take the photo. Try again.')
    : state.notice === 'save' ? (de ? 'Foto konnte nicht angehängt werden. Versuche es erneut.' : 'Couldn’t attach the photo. Try again.') : '';
  const sideButton = (icon: 'chevron-left' | 'more-vertical', label: string, onPress: () => void, extra?: { expanded?: boolean }) => <Pressable onPress={onPress} disabled={!open} accessibilityRole="button" accessibilityLabel={label} accessibilityState={extra?.expanded !== undefined ? { expanded: extra.expanded } : undefined} hitSlop={6} style={({ pressed }) => ({ width: SIDE_BUTTON, height: SIDE_BUTTON, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: SIDE_BUTTON / 2, backgroundColor: HUD.chip }, chipStyle]} />
    <Feather name={icon} size={icon === 'chevron-left' ? 26 : 21} color={HUD.text} style={icon === 'chevron-left' ? { marginLeft: -2 } : undefined} />
  </Pressable>;
  const pill = (label: string, onPress: () => void, primary: boolean, busy = false, disabled = false) => <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} style={({ pressed }) => ({ minWidth: 120, height: 48, paddingHorizontal: 20, borderRadius: 24, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? '#FFFFFF' : HUD.chip, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
    {busy ? <ActivityIndicator color="#111111" /> : <>
      {primary ? <Feather name="check" size={18} color="#111111" /> : null}
      <Text style={{ color: primary ? '#111111' : HUD.text, fontFamily: primary ? 'Inter_600SemiBold' : 'Inter_500Medium', fontSize: 15 }}>{label}</Text>
    </>}
  </Pressable>;

  return <View pointerEvents={open ? 'box-none' : 'none'} onLayout={onLayout} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
    {size ? <>
      <Pressable onPress={() => { if (canDismissFromOutside(stateRef.current)) close(); }} accessible={false} importantForAccessibility="no" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: sheetTop }} />
      <Animated.View accessibilityViewIsModal={open} style={[{ position: 'absolute', overflow: 'hidden' }, sheetStyle]}>
        {mounted ? <CameraView key={state.mountKey} ref={cameraRef} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} facing={facing} flash={flash} mode="picture" pictureSize={PICTURE_SIZE} animateShutter={false} mirror={false}
          onCameraReady={() => dispatch({ type: 'ready', session: state.session, mountKey: state.mountKey })}
          onMountError={() => dispatch({ type: 'mountError', session: state.session, mountKey: state.mountKey })} /> : null}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#000000' }, coverStyle]} />
        {shownPhoto ? <Image source={{ uri: shownPhoto.uri }} fadeDuration={0} resizeMode="cover" accessibilityLabel={de ? 'Aufgenommenes Foto' : 'Captured photo'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#FFFFFF' }, flashStyle]} />
        {state.expanded || !open ? <><CornerMask side="left" color={palette.canvas} /><CornerMask side="right" color={palette.canvas} /></> : null}

        {state.phase === 'denied' || state.phase === 'error' ? <View accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 32, right: 32, top: 0, bottom: controlCenter + SHUTTER_SIZE / 2, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={state.phase === 'denied' ? 'camera-off' : 'alert-circle'} size={26} color={HUD.muted} />
          <Text style={{ marginTop: 14, color: HUD.text, fontFamily: 'Inter_600SemiBold', fontSize: 17, lineHeight: 23, textAlign: 'center' }}>{state.phase === 'denied' ? (de ? 'Kamerazugriff ist aus' : 'Camera access is off') : (de ? 'Die Kamera konnte nicht starten' : 'The camera couldn’t start')}</Text>
          <Text style={{ marginTop: 6, color: HUD.muted, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>{state.phase === 'denied'
            ? (state.permission === 'blocked' ? (de ? 'Erlaube den Kamerazugriff in den Einstellungen, um ein Foto an Daimon zu senden.' : 'Allow camera access in Settings to send Daimon a photo.') : (de ? 'Daimon braucht Zugriff auf die Kamera, um ein Foto aufzunehmen.' : 'Daimon needs camera access to take a photo.'))
            : (de ? 'Eine andere App nutzt sie vielleicht gerade.' : 'Another app may be using it.')}</Text>
          <View style={{ marginTop: 18 }}>{pill(state.phase === 'error' ? (de ? 'Erneut versuchen' : 'Try again') : state.permission === 'blocked' ? (de ? 'Einstellungen öffnen' : 'Open Settings') : (de ? 'Kamera erlauben' : 'Allow camera'), () => {
            if (state.phase === 'error') dispatch({ type: 'retry' });
            else if (state.permission === 'blocked') void Linking.openSettings().catch(() => undefined);
            else void checkPermission(state.session, true);
          }, true)}</View>
        </View> : null}

        {noticeText ? <View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: 'absolute', top: 18, left: 24, right: 24, alignItems: 'center' }}><View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, backgroundColor: 'rgba(24,24,24,0.86)' }}><Text style={{ color: HUD.text, fontFamily: 'Inter_500Medium', fontSize: 13, textAlign: 'center' }}>{noticeText}</Text></View></View> : null}

        <Animated.View pointerEvents={open ? 'box-none' : 'none'} style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, controlsStyle]}>
          {menuOpen ? <Pressable onPress={() => setMenuOpen(false)} accessible={false} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
          {showCameraControls ? <>
            <View style={{ position: 'absolute', left: SIDE_INSET, bottom: controlCenter - SIDE_BUTTON / 2 }}>{sideButton('chevron-left', de ? 'Kamera schließen' : 'Close camera', close)}</View>
            {state.phase !== 'denied' && state.phase !== 'error' ? <Pressable onPress={() => void capture()} disabled={!canCapture(state)} accessibilityRole="button" accessibilityLabel={de ? 'Foto aufnehmen' : 'Take photo'} accessibilityState={{ disabled: !canCapture(state), busy: state.capturing }} style={{ position: 'absolute', left: (width - SHUTTER_SIZE) / 2, bottom: controlCenter - SHUTTER_SIZE / 2, width: SHUTTER_SIZE, height: SHUTTER_SIZE, alignItems: 'center', justifyContent: 'center' }}>
              {({ pressed }) => <>
                <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: SHUTTER_SIZE, height: SHUTTER_SIZE, borderRadius: SHUTTER_SIZE / 2, borderWidth: (SHUTTER_SIZE - SHUTTER_FILL) / 2, borderColor: HUD.ring }, chipStyle]} />
                <Animated.View style={[{ width: SHUTTER_FILL, height: SHUTTER_FILL, borderRadius: SHUTTER_FILL / 2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed || state.capturing ? 0.9 : 1 }] }, shutterFillStyle]}>
                  {state.capturing ? <ActivityIndicator color="#111111" /> : null}
                </Animated.View>
              </>}
            </Pressable> : null}
            {state.phase === 'camera' ? <View style={{ position: 'absolute', right: SIDE_INSET, bottom: controlCenter - SIDE_BUTTON / 2 }}>{sideButton('more-vertical', de ? 'Kameraoptionen' : 'Camera options', () => setMenuOpen(value => !value), { expanded: menuOpen })}</View> : null}
          </> : null}
          {reviewing ? <View style={{ position: 'absolute', left: 20, right: 20, bottom: controlCenter - 24, flexDirection: 'row', justifyContent: 'space-between' }}>
            {pill(de ? 'Neu aufnehmen' : 'Retake', retake, false, false, state.phase === 'saving')}
            {pill(de ? 'Foto verwenden' : 'Use photo', () => void accept(), true, state.phase === 'saving')}
          </View> : null}
          {menuOpen && state.phase === 'camera' ? <View accessibilityViewIsModal style={{ position: 'absolute', right: SIDE_INSET - 6, bottom: controlCenter + SIDE_BUTTON / 2 + 10, minWidth: 200, padding: 6, borderRadius: 18, backgroundColor: HUD.menu }}>
            <Pressable onPress={switchCamera} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 46, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'transparent' })}>
              <Feather name="refresh-cw" size={17} color={HUD.text} /><Text style={{ color: HUD.text, fontFamily: 'Inter_500Medium', fontSize: 15 }}>{de ? 'Kamera wechseln' : 'Switch camera'}</Text>
            </Pressable>
            {facing === 'back' ? <Pressable onPress={() => setFlash(value => FLASH_ORDER[(FLASH_ORDER.indexOf(value) + 1) % FLASH_ORDER.length])} accessibilityRole="button" accessibilityLabel={`${de ? 'Blitz' : 'Flash'}: ${flashLabel}`} style={({ pressed }) => ({ minHeight: 46, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'transparent' })}>
              <Feather name={flash === 'off' ? 'zap-off' : 'zap'} size={17} color={HUD.text} /><Text style={{ flex: 1, color: HUD.text, fontFamily: 'Inter_500Medium', fontSize: 15 }}>{de ? 'Blitz' : 'Flash'}</Text><Text style={{ color: HUD.muted, fontFamily: 'Inter_400Regular', fontSize: 14 }}>{flashLabel}</Text>
            </Pressable> : null}
          </View> : null}
        </Animated.View>
      </Animated.View>
    </> : null}
  </View>;
});
