import { Feather } from '@expo/vector-icons';
import { CameraView, type CameraType } from 'expo-camera';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Platform, Pressable, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, interpolate, interpolateColor, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { focusCameraAt, preferTexturePreview } from '../../modules/daimon-camera';
import type { Locale } from '../design/tokens';
import { cameraAccess } from './cameraPermission';
import { canCapture, canDismissFromOutside, cameraFlowReducer, initialCameraFlow, isCameraMounted, isPreviewRevealed, textureAttemptReducer, initialTextureAttempt, type CameraFlowState, type CapturedPhoto, type TextureAttempt, type TextureEvent } from './cameraFlow';

export type CameraSheetRect = { x: number; y: number; width: number; height: number };
export type CameraSheetHandle = { handleBack: () => boolean };
export type CameraExit = 'menu' | 'chat';

type Props = {
  open: boolean;
  /** Attachment menu card the sheet grows out of; null slides the sheet up from the bottom edge. */
  origin: CameraSheetRect | null;
  /** The menu card's contents, drawn inside the sheet so they fade within the growing (and shrinking) card. */
  ghost?: React.ReactNode;
  locale: Locale;
  /** Colour of the menu card the sheet grows out of and shrinks back into. */
  palette: { surface: string };
  reducedMotion: boolean;
  bottomInset: number;
  /** Height kept free above the sheet so the chat header stays visible. */
  topReserve: number;
  /** Where a closing sheet shrinks back to (the reopened menu card); null slides it down into the composer. Read when `open` turns false. */
  exitTo: CameraSheetRect | null;
  /** 'menu' when the person backs out of the camera (it returns to the attachment menu), 'chat' after dismissing or keeping a photo. */
  onRequestClose: (to: CameraExit) => void;
  /** Same frame the sheet first covers the menu card, so the card underneath can hide without a gap. */
  onEnterStart?: () => void;
  /** Same frame the sheet disappears, so a card it shrank into can take over without a gap. */
  onExited?: (to: CameraExit) => void;
  onAccept: (photo: CapturedPhoto) => Promise<void>;
};

// Geometry measured from the ChatGPT reference capture on a 360×792 dp OnePlus viewport (dp).
// Fitted to the reference frame's corner arc (100 px at 3 px/dp); the reference rounds the bottom corners the same way.
const SHEET_RADIUS = 33;
const MENU_RADIUS = 22;
const SHUTTER_SIZE = 72;
const SHUTTER_FILL = 60;
const SIDE_BUTTON = 44;
const SIDE_INSET = 30;
const STACK_GAP = 52;
const MIN_CONTROL_CENTER = 52;
// CameraX's default capture ratio is 4:3, so a 3:4 viewfinder shows exactly the photo that will be taken.
const VIEWFINDER_RATIO = 4 / 3;
// Enough for MAX_IMAGE_DIMENSION after rotation without decoding a full sensor frame. Android sizes only; iOS uses presets.
const PICTURE_SIZE = Platform.OS === 'android' ? '2048x1536' : undefined;
const READY_TIMEOUT_MS = 6000;
// Timed against the ChatGPT recording: the card fills out in under 200 ms, then its grey dissolves; backing out
// shrinks the live preview into the card while the menu rows fade back in, all within ~250 ms.
const GROW = { duration: 200, easing: Easing.bezier(0.25, 0.8, 0.25, 1) };
const SLIDE_IN = { duration: 260, easing: Easing.bezier(0.2, 0, 0, 1) };
const SHRINK = { duration: 220, easing: Easing.bezier(0.3, 0, 0.2, 1) };
const SLIDE_OUT = { duration: 240, easing: Easing.bezier(0.3, 0, 0.8, 0.15) };
const HUD = { chip: 'rgba(18,18,18,0.5)', ring: 'rgba(18,18,18,0.42)', fillIdle: '#CFCFCF', text: '#FFFFFF', muted: '#B4B4B4' };
// Same order as the reference: off → auto (fires at capture when needed) → on (a steady light, so it visibly works).
type LightMode = 'off' | 'auto' | 'on';
const LIGHT_ORDER: LightMode[] = ['off', 'auto', 'on'];
const FOCUS_RING = 68;

const deleteCapture = (uri: string) => { void LegacyFileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined); };

// Memoised: it stays mounted under the chat, which re-renders on every keystroke and streamed update.
export const CameraSheet = memo(forwardRef<CameraSheetHandle, Props>(function CameraSheet({ open, origin, ghost, locale, palette, reducedMotion, bottomInset, topReserve, exitTo, onRequestClose, onEnterStart, onExited, onAccept }, ref) {
  const de = locale === 'de';
  const [state, dispatch] = useReducer(cameraFlowReducer, initialCameraFlow);
  const stateRef = useRef<CameraFlowState>(state); stateRef.current = state;
  const openRef = useRef(open); openRef.current = open;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [light, setLight] = useState<LightMode>('off');
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Keeps the live preview mounted while the sheet shrinks away after closing.
  const [keepPreview, setKeepPreview] = useState(false);
  const [ghostSize, setGhostSize] = useState<{ width: number; height: number } | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const capturesRef = useRef(new Set<string>());
  // Reducer state lags a render behind; this blocks a second shutter tap landing in the same frame.
  const captureInFlightRef = useRef(false);
  const lastPhotoRef = useRef<CapturedPhoto | undefined>(undefined);

  const width = size?.width ?? 0; const height = size?.height ?? 0;
  const sheetHeight = Math.round(Math.max(0, Math.min(width * VIEWFINDER_RATIO, height - topReserve)));
  const sheetTop = height - sheetHeight;
  const controlCenter = Math.max(MIN_CONTROL_CENTER, bottomInset + 30);

  const progress = useSharedValue(0); const shown = useSharedValue(0); const veil = useSharedValue(0); const ghostOpacity = useSharedValue(0);
  const live = useSharedValue(0); const flashOverlay = useSharedValue(0); const ringScale = useSharedValue(1); const ringOpacity = useSharedValue(0);
  const options = useSharedValue(0); const flipTurn = useSharedValue(0);
  const fromX = useSharedValue(0); const fromY = useSharedValue(0); const fromWidth = useSharedValue(0); const fromHeight = useSharedValue(0); const fromRadius = useSharedValue(SHEET_RADIUS); const morph = useSharedValue(0);
  const target = useSharedValue({ top: 0, width: 0, height: 0 });
  useEffect(() => { target.value = { top: sheetTop, width, height: sheetHeight }; }, [sheetTop, width, sheetHeight, target]);

  const checkPermission = useCallback(async (session: number, ask: boolean) => {
    try {
      dispatch({ type: 'permission', session, permission: await cameraAccess(ask) });
    } catch {
      dispatch({ type: 'permission', session, permission: 'denied' });
    }
  }, []);

  const mounted = isCameraMounted(state);
  const renderCamera = mounted || keepPreview;
  useEffect(() => {
    dispatch({ type: open ? 'open' : 'close' });
    if (!open) {
      setOptionsOpen(false);
      if (isCameraMounted(stateRef.current)) setKeepPreview(true);
    } else {
      setKeepPreview(false);
      // Auto flash carries over between opens like a camera app; a steady light never switches itself back on.
      setLight(value => value === 'on' ? 'off' : value);
    }
  }, [open]);

  const markExpanded = useCallback((session: number) => dispatch({ type: 'expanded', session }), []);
  const hasSize = size !== null;
  // Entrance: runs once per opened session, after the layer has been measured.
  useEffect(() => {
    if (state.phase === 'closed' || !hasSize) return;
    const session = state.session;
    const resumingExit = shown.value > 0 && progress.value > 0.001;
    if (!resumingExit) {
      const start = origin ?? { x: 0, y: height, width, height: sheetHeight };
      fromX.value = start.x; fromY.value = start.y; fromWidth.value = start.width; fromHeight.value = start.height;
      fromRadius.value = origin ? MENU_RADIUS : SHEET_RADIUS; morph.value = origin ? 1 : 0;
      progress.value = 0;
      if (origin) setGhostSize({ width: origin.width, height: origin.height });
    }
    const fromMenu = morph.value === 1;
    const instant = { duration: 1 };
    shown.value = 1;
    // Starts as the menu card: its colour and rows, which fade as it grows, then the grey dissolves.
    veil.value = fromMenu ? 1 : 0;
    ghostOpacity.value = fromMenu ? 1 : 0;
    if (fromMenu) {
      ghostOpacity.value = withTiming(0, reducedMotion ? instant : { duration: 120 });
      veil.value = withDelay(reducedMotion ? 0 : 170, withTiming(0, reducedMotion ? instant : { duration: 130 }));
    }
    progress.value = withTiming(1, reducedMotion ? instant : fromMenu ? GROW : SLIDE_IN, finished => { if (finished) runOnJS(markExpanded)(session); });
    onEnterStart?.();
    // Only reads access: the parent asks before opening, so no system dialog pauses the app while the sheet grows.
    void checkPermission(session, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.session, hasSize]);

  const finishExit = useCallback((to: CameraExit) => {
    // Hand over in one JS tick: the parent's card appears and the sheet disappears in the same frame.
    onExited?.(to);
    shown.value = 0;
    live.value = 0;
    setKeepPreview(false);
  }, [live, onExited, shown]);
  // Backing out shrinks the sheet (live preview included) into the reopened menu card; dismissing or keeping a photo slides it away.
  useEffect(() => {
    if (open || !hasSize || shown.value === 0) return;
    const to: CameraExit = exitTo ? 'menu' : 'chat';
    const end = exitTo ?? { x: 0, y: height, width, height: sheetHeight };
    fromX.value = end.x; fromY.value = end.y; fromWidth.value = end.width; fromHeight.value = end.height;
    fromRadius.value = exitTo ? MENU_RADIUS : SHEET_RADIUS; morph.value = exitTo ? 1 : 0;
    const instant = { duration: 1 };
    if (exitTo) {
      setGhostSize({ width: exitTo.width, height: exitTo.height });
      ghostOpacity.value = withDelay(reducedMotion ? 0 : 60, withTiming(1, reducedMotion ? instant : { duration: 150 }));
      veil.value = withDelay(reducedMotion ? 0 : 40, withTiming(1, reducedMotion ? instant : { duration: 160 }));
    }
    progress.value = withTiming(0, reducedMotion ? instant : exitTo ? SHRINK : SLIDE_OUT, finished => { if (finished) runOnJS(finishExit)(to); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasSize]);

  // The camera starts while the sheet is still growing; frames are revealed once it has settled.
  const revealed = isPreviewRevealed(state);
  useEffect(() => {
    if (revealed) live.value = withTiming(1, { duration: reducedMotion ? 1 : 140, easing: Easing.out(Easing.quad) });
    else if (open) live.value = 0;
  }, [revealed, open, live, reducedMotion]);

  // A TextureView-backed preview clips to the sheet's corners and can scale with it while it shrinks.
  // The native preview may not be attached yet when this runs ('missing'); textureAttemptReducer then asks exactly once
  // more after the camera reports ready. Ready can also arrive first for a warm camera; both orders converge.
  const textureRef = useRef<TextureAttempt>(initialTextureAttempt);
  const onTextureEvent = useCallback((event: TextureEvent) => {
    const { state: next, retry } = textureAttemptReducer(textureRef.current, event);
    textureRef.current = next;
    if (retry) void preferTexturePreview().then(result => onTextureEvent({ type: 'result', mountKey: event.mountKey, result }));
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const mountKey = state.mountKey;
    void preferTexturePreview().then(result => onTextureEvent({ type: 'result', mountKey, result }));
  }, [mounted, state.mountKey, onTextureEvent]);
  const onCameraReady = useCallback((session: number, mountKey: number) => {
    dispatch({ type: 'ready', session, mountKey });
    onTextureEvent({ type: 'ready', mountKey });
  }, [onTextureEvent]);

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
        setOptionsOpen(false);
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

  useEffect(() => {
    options.value = withTiming(optionsOpen ? 1 : 0, { duration: reducedMotion ? 1 : optionsOpen ? 170 : 110, easing: optionsOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.quad) });
  }, [optionsOpen, options, reducedMotion]);

  const close = useCallback((to: CameraExit) => { setOptionsOpen(false); onRequestClose(to); }, [onRequestClose]);
  const backOut = useCallback(() => close('menu'), [close]);
  const retake = useCallback(() => dispatch({ type: 'retake' }), []);

  const capture = useCallback(async () => {
    const current = stateRef.current;
    if (captureInFlightRef.current || !canCapture(current) || !cameraRef.current) return;
    captureInFlightRef.current = true;
    setOptionsOpen(false);
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
      if (stateRef.current.session === current.session && openRef.current) onRequestClose('chat');
    } catch {
      dispatch({ type: 'saveFailed', session: current.session });
    }
  }, [onAccept, onRequestClose]);

  const switchCamera = useCallback(() => {
    flipTurn.value = withTiming(flipTurn.value + 180, { duration: reducedMotion ? 1 : 320, easing: Easing.inOut(Easing.cubic) });
    const apply = () => { setFacing(value => value === 'back' ? 'front' : 'back'); dispatch({ type: 'remount' }); };
    if (reducedMotion) { apply(); return; }
    live.value = withTiming(0, { duration: 110 }, finished => { if (finished) runOnJS(apply)(); });
  }, [flipTurn, live, reducedMotion]);

  const cycleLight = useCallback(() => setLight(value => LIGHT_ORDER[(LIGHT_ORDER.indexOf(value) + 1) % LIGHT_ORDER.length]), []);

  const onPreviewPress = useCallback((event: GestureResponderEvent) => {
    if (optionsOpen) { setOptionsOpen(false); return; }
    if (!canCapture(stateRef.current) || sheetHeight <= 0 || width <= 0) return;
    const { locationX, locationY } = event.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    ringOpacity.value = 1;
    ringScale.value = reducedMotion ? 1 : 1.35;
    if (!reducedMotion) ringScale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    ringOpacity.value = withDelay(reducedMotion ? 600 : 900, withTiming(0, { duration: 220 }));
    void Haptics.selectionAsync().catch(() => undefined);
    void focusCameraAt(locationX / width, locationY / sheetHeight, facing);
  }, [facing, optionsOpen, reducedMotion, ringOpacity, ringScale, sheetHeight, width]);
  useEffect(() => { ringOpacity.value = 0; setFocusPoint(null); }, [state.mountKey, ringOpacity]);

  useImperativeHandle(ref, () => ({
    handleBack: () => {
      if (!openRef.current) return false;
      if (optionsOpen) { setOptionsOpen(false); return true; }
      const current = stateRef.current;
      if (current.capturing || current.phase === 'saving') return true;
      if (current.phase === 'review') { retake(); return true; }
      backOut();
      return true;
    },
  }), [backOut, optionsOpen, retake]);

  const sheetStyle = useAnimatedStyle(() => {
    const p = progress.value; const to = target.value;
    // Grown from the menu card, the top edge holds (like the reference) while the card fills out sideways and down;
    // it only settles onto the viewfinder once the card has turned black.
    const top = morph.value
      ? interpolate(p, [0, 0.75, 1], [fromY.value, Math.min(fromY.value, to.top), to.top])
      : interpolate(p, [0, 1], [fromY.value, to.top]);
    const bottom = interpolate(p, [0, 1], [fromY.value + fromHeight.value, to.top + to.height]);
    return {
      opacity: shown.value,
      left: interpolate(p, [0, 1], [fromX.value, 0]),
      top,
      width: interpolate(p, [0, 1], [fromWidth.value, to.width]),
      height: Math.max(0, bottom - top),
      borderRadius: interpolate(p, [0, 1], [fromRadius.value, SHEET_RADIUS]),
    };
  });
  // The preview keeps the viewfinder's size and is scaled to cover whatever card shape the sheet has, so it shrinks
  // with the card instead of being re-laid out every frame.
  const previewStyle = useAnimatedStyle(() => {
    const p = progress.value; const to = target.value;
    const top = morph.value
      ? interpolate(p, [0, 0.75, 1], [fromY.value, Math.min(fromY.value, to.top), to.top])
      : interpolate(p, [0, 1], [fromY.value, to.top]);
    const sheetWidth = interpolate(p, [0, 1], [fromWidth.value, to.width]);
    const sheetHeightNow = Math.max(1, interpolate(p, [0, 1], [fromY.value + fromHeight.value, to.top + to.height]) - top);
    const scale = to.width > 0 && to.height > 0 ? Math.max(sheetWidth / to.width, sheetHeightNow / to.height) : 1;
    return { transform: [{ translateX: (sheetWidth - to.width) / 2 }, { translateY: (sheetHeightNow - to.height) / 2 }, { scale }] };
  });
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const ghostStyle = useAnimatedStyle(() => ({ opacity: ghostOpacity.value }));
  // Controls ride inside the growing card from the start, as in the reference.
  const controlsStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.15, 0.55], [0, 1], 'clamp') }));
  const coverStyle = useAnimatedStyle(() => ({ opacity: 1 - live.value }));
  const chipStyle = useAnimatedStyle(() => ({ opacity: live.value }));
  const shutterFillStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(live.value, [0, 1], [HUD.fillIdle, '#FFFFFF']) }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOverlay.value }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.value, transform: [{ scale: ringScale.value }] }));
  // Options slide up out of the ⋮ button, which turns into ×.
  // Each style reads `options` itself: Reanimated only re-runs a style for shared values read directly in its worklet.
  const stackStyle = (value: number, slot: number) => { 'worklet'; return { opacity: value, transform: [{ translateY: (1 - value) * STACK_GAP * slot }, { scale: 0.7 + value * 0.3 }] }; };
  // Collapsed options sit transparent behind the X; keep them out of VoiceOver/TalkBack until the stack is open.
  const stackA11y = { accessibilityElementsHidden: !optionsOpen, importantForAccessibility: optionsOpen ? 'auto' as const : 'no-hide-descendants' as const };
  const lightStyle = useAnimatedStyle(() => stackStyle(options.value, 2));
  const flipStyle = useAnimatedStyle(() => stackStyle(options.value, 1));
  const flipIconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${flipTurn.value}deg` }] }));
  const moreIconStyle = useAnimatedStyle(() => ({ opacity: 1 - options.value, transform: [{ rotate: `${options.value * 90}deg` }] }));
  const closeIconStyle = useAnimatedStyle(() => ({ opacity: options.value, transform: [{ rotate: `${(options.value - 1) * 90}deg` }] }));

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setSize(current => current && current.width === w && current.height === h ? current : { width: w, height: h });
  }, []);

  const shownPhoto = state.photo ?? (!open ? lastPhotoRef.current : undefined);
  // The reducer closes instantly, but the sheet is still animating out: keep drawing the controls it had so they fade
  // with it instead of blinking away.
  const lastPhaseRef = useRef<CameraFlowState['phase']>('closed');
  if (state.phase !== 'closed') lastPhaseRef.current = state.phase;
  const phase = state.phase === 'closed' ? lastPhaseRef.current : state.phase;
  const reviewing = phase === 'review' || phase === 'saving';
  const showCameraControls = phase !== 'review' && phase !== 'saving';
  const lightAvailable = facing === 'back';
  const lightLabel = light === 'on' ? (de ? 'An' : 'On') : light === 'auto' ? 'Auto' : (de ? 'Aus' : 'Off');
  const noticeText = state.notice === 'capture' ? (de ? 'Foto konnte nicht aufgenommen werden. Versuche es erneut.' : 'Couldn’t take the photo. Try again.')
    : state.notice === 'save' ? (de ? 'Foto konnte nicht angehängt werden. Versuche es erneut.' : 'Couldn’t attach the photo. Try again.') : '';
  const chip = <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: SIDE_BUTTON / 2, backgroundColor: HUD.chip }, chipStyle]} />;
  const roundButton = (label: string, onPress: () => void, children: React.ReactNode, extra?: { expanded?: boolean; disabled?: boolean }) => <Pressable onPress={onPress} disabled={!open || extra?.disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={extra?.expanded !== undefined ? { expanded: extra.expanded } : undefined} hitSlop={6} style={({ pressed }) => ({ width: SIDE_BUTTON, height: SIDE_BUTTON, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.92 : 1 }] })}>
    {chip}{children}
  </Pressable>;
  const pill = (label: string, onPress: () => void, primary: boolean, busy = false, disabled = false) => <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} style={({ pressed }) => ({ minWidth: 120, height: 48, paddingHorizontal: 20, borderRadius: 24, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? '#FFFFFF' : HUD.chip, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
    {busy ? <ActivityIndicator color="#111111" /> : <>
      {primary ? <Feather name="check" size={18} color="#111111" /> : null}
      <Text style={{ color: primary ? '#111111' : HUD.text, fontFamily: primary ? 'Inter_600SemiBold' : 'Inter_500Medium', fontSize: 15 }}>{label}</Text>
    </>}
  </Pressable>;

  return <View pointerEvents={open ? 'box-none' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} onLayout={onLayout} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
    {size ? <>
      <Pressable onPress={() => { if (canDismissFromOutside(stateRef.current)) close('chat'); }} accessible={false} importantForAccessibility="no" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: sheetTop }} />
      <Animated.View accessibilityViewIsModal={open} style={[{ position: 'absolute', overflow: 'hidden', backgroundColor: '#000000' }, sheetStyle]}>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width, height: sheetHeight, overflow: 'hidden' }, previewStyle]}>
          {renderCamera ? <CameraView key={state.mountKey} ref={cameraRef} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} facing={facing} flash={lightAvailable && light === 'auto' ? 'auto' : 'off'} enableTorch={lightAvailable && light === 'on'} mode="picture" pictureSize={PICTURE_SIZE} animateShutter={false} mirror={false}
            onCameraReady={() => onCameraReady(state.session, state.mountKey)}
            onMountError={() => dispatch({ type: 'mountError', session: state.session, mountKey: state.mountKey })} /> : null}
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#000000' }, coverStyle]} />
          {shownPhoto ? <Image source={{ uri: shownPhoto.uri }} fadeDuration={0} resizeMode="cover" accessibilityLabel={de ? 'Aufgenommenes Foto' : 'Captured photo'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
        </Animated.View>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: palette.surface }, veilStyle]} />
        {ghost && ghostSize ? <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', left: 0, top: 0, width: ghostSize.width, height: ghostSize.height }, ghostStyle]}>{ghost}</Animated.View> : null}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#FFFFFF' }, flashStyle]} />

        {phase === 'denied' || phase === 'error' ? <View accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 32, right: 32, top: 0, bottom: controlCenter + SHUTTER_SIZE / 2, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={phase === 'denied' ? 'camera-off' : 'alert-circle'} size={26} color={HUD.muted} />
          <Text style={{ marginTop: 14, color: HUD.text, fontFamily: 'Inter_600SemiBold', fontSize: 17, lineHeight: 23, textAlign: 'center' }}>{phase === 'denied' ? (de ? 'Kamerazugriff ist aus' : 'Camera access is off') : (de ? 'Die Kamera konnte nicht starten' : 'The camera couldn’t start')}</Text>
          <Text style={{ marginTop: 6, color: HUD.muted, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>{phase === 'denied'
            ? (state.permission === 'blocked' ? (de ? 'Erlaube den Kamerazugriff in den Einstellungen, um ein Foto an Daimon zu senden.' : 'Allow camera access in Settings to send Daimon a photo.') : (de ? 'Daimon braucht Zugriff auf die Kamera, um ein Foto aufzunehmen.' : 'Daimon needs camera access to take a photo.'))
            : (de ? 'Eine andere App nutzt sie vielleicht gerade.' : 'Another app may be using it.')}</Text>
          <View style={{ marginTop: 18 }}>{pill(phase === 'error' ? (de ? 'Erneut versuchen' : 'Try again') : state.permission === 'blocked' ? (de ? 'Einstellungen öffnen' : 'Open Settings') : (de ? 'Kamera erlauben' : 'Allow camera'), () => {
            if (phase === 'error') dispatch({ type: 'retry' });
            else if (state.permission === 'blocked') void Linking.openSettings().catch(() => undefined);
            else void checkPermission(state.session, true);
          }, true)}</View>
        </View> : null}

        {noticeText ? <View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: 'absolute', top: 18, left: 24, right: 24, alignItems: 'center' }}><View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, backgroundColor: 'rgba(24,24,24,0.86)' }}><Text style={{ color: HUD.text, fontFamily: 'Inter_500Medium', fontSize: 13, textAlign: 'center' }}>{noticeText}</Text></View></View> : null}

        <Animated.View pointerEvents={open ? 'box-none' : 'none'} style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, controlsStyle]}>
          {phase === 'camera' ? <Pressable onPress={onPreviewPress} accessible={false} importantForAccessibility="no" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
          {focusPoint && phase === 'camera' ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: focusPoint.x - FOCUS_RING / 2, top: focusPoint.y - FOCUS_RING / 2, width: FOCUS_RING, height: FOCUS_RING, borderRadius: FOCUS_RING / 2, borderWidth: 1.5, borderColor: '#FFFFFF' }, ringStyle]} /> : null}
          {showCameraControls ? <>
            <View style={{ position: 'absolute', left: SIDE_INSET, bottom: controlCenter - SIDE_BUTTON / 2 }}>{roundButton(de ? 'Kamera schließen' : 'Close camera', backOut, <Feather name="chevron-left" size={26} color={HUD.text} style={{ marginLeft: -2 }} />)}</View>
            {phase !== 'denied' && phase !== 'error' ? <Pressable onPress={() => void capture()} disabled={!canCapture(state)} accessibilityRole="button" accessibilityLabel={de ? 'Foto aufnehmen' : 'Take photo'} accessibilityState={{ disabled: !canCapture(state), busy: state.capturing }} style={{ position: 'absolute', left: '50%', marginLeft: -SHUTTER_SIZE / 2, bottom: controlCenter - SHUTTER_SIZE / 2, width: SHUTTER_SIZE, height: SHUTTER_SIZE, alignItems: 'center', justifyContent: 'center' }}>
              {({ pressed }) => <>
                <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: SHUTTER_SIZE, height: SHUTTER_SIZE, borderRadius: SHUTTER_SIZE / 2, borderWidth: (SHUTTER_SIZE - SHUTTER_FILL) / 2, borderColor: HUD.ring }, chipStyle]} />
                <Animated.View style={[{ width: SHUTTER_FILL, height: SHUTTER_FILL, borderRadius: SHUTTER_FILL / 2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed || state.capturing ? 0.9 : 1 }] }, shutterFillStyle]}>
                  {state.capturing ? <ActivityIndicator color="#111111" /> : null}
                </Animated.View>
              </>}
            </Pressable> : null}
            {phase === 'camera' ? <>
              <Animated.View pointerEvents={optionsOpen ? 'auto' : 'none'} {...stackA11y} style={[{ position: 'absolute', right: SIDE_INSET, bottom: controlCenter - SIDE_BUTTON / 2 + STACK_GAP * 2 }, lightStyle]}>
                {roundButton(`${de ? 'Blitz' : 'Flash'}: ${lightLabel}`, cycleLight, <>
                  <Feather name={light === 'off' ? 'zap-off' : 'zap'} size={19} color={HUD.text} />
                  {light === 'auto' ? <Text style={{ position: 'absolute', right: 9, bottom: 8, color: HUD.text, fontFamily: 'Inter_600SemiBold', fontSize: 9 }}>A</Text> : null}
                </>, { disabled: !lightAvailable })}
              </Animated.View>
              <Animated.View pointerEvents={optionsOpen ? 'auto' : 'none'} {...stackA11y} style={[{ position: 'absolute', right: SIDE_INSET, bottom: controlCenter - SIDE_BUTTON / 2 + STACK_GAP }, flipStyle]}>
                {roundButton(de ? 'Kamera wechseln' : 'Switch camera', switchCamera, <Animated.View style={flipIconStyle}><Feather name="refresh-cw" size={19} color={HUD.text} /></Animated.View>)}
              </Animated.View>
              <View style={{ position: 'absolute', right: SIDE_INSET, bottom: controlCenter - SIDE_BUTTON / 2 }}>
                {roundButton(optionsOpen ? (de ? 'Kameraoptionen ausblenden' : 'Hide camera options') : (de ? 'Kameraoptionen' : 'Camera options'), () => setOptionsOpen(value => !value), <>
                  <Animated.View style={[{ position: 'absolute' }, moreIconStyle]}><Feather name="more-vertical" size={21} color={HUD.text} /></Animated.View>
                  <Animated.View style={[{ position: 'absolute' }, closeIconStyle]}><Feather name="x" size={20} color={HUD.text} /></Animated.View>
                </>, { expanded: optionsOpen })}
              </View>
            </> : null}
          </> : null}
          {reviewing ? <View style={{ position: 'absolute', left: 20, right: 20, bottom: controlCenter - 24, flexDirection: 'row', justifyContent: 'space-between' }}>
            {pill(de ? 'Neu aufnehmen' : 'Retake', retake, false, false, phase === 'saving')}
            {pill(de ? 'Foto verwenden' : 'Use photo', () => void accept(), true, phase === 'saving')}
          </View> : null}
        </Animated.View>
      </Animated.View>
    </> : null}
  </View>;
}));
