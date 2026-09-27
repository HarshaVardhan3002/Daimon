import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Image, Keyboard, NativeModules, Platform, Pressable, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { KeyboardChatScrollView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown, runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraSheet, type CameraSheetHandle, type CameraSheetRect } from '../src/chat/CameraSheet';
import type { CapturedPhoto } from '../src/chat/cameraFlow';
import { cameraAccess } from '../src/chat/cameraPermission';
import { ChatDrawer } from '../src/chat/ChatDrawer';
import { ChatHeader, HEADER_HEIGHT } from '../src/chat/ChatHeader';
import { cancelEdit, chatUi, currentRequest, drawerCloseSignal, dismissRequestError, retryRequest, stopSpeech, syncRequestWithActiveChat, useChatUi } from '../src/chat/chatController';
import { Composer, type ComposerHandle } from '../src/chat/Composer';
import { DocumentAttachmentError, persistDocumentAttachment, supportedDocumentMimeType } from '../src/chat/documentAttachment';
import { errorText } from '../src/chat/errorText';
import { isSupportedImage, persistImageAttachment } from '../src/chat/imageAttachment';
import { PLUS_MENU_HEIGHT, PLUS_MENU_LEFT, PLUS_MENU_WIDTH, PlusMenu, PlusMenuRows, type PlusAction } from '../src/chat/PlusMenu';
import { ReasoningEffortDial } from '../src/chat/ReasoningEffortDial';
import { TurnView } from '../src/chat/TurnView';
import { motion, type } from '../src/design/tokens';
import { usePalette, useThemeMode } from '../src/design/useTheme';
import { useStrings } from '../src/i18n/strings';
import { appStore, setDocumentAttachment, setImageAttachment, setReasoningMode, setThinkHarder, startNewChat, useApp } from '../src/state/appStore';
import { useStore } from '../src/state/store';
import { shouldShowGlobalChatError } from '../src/state/chatRequestFlow';
import { Icon } from '../src/ui/icons';
import { IconButton } from '../src/ui/IconButton';
import { toast } from '../src/ui/overlays';
import { PressableScale, haptic } from '../src/ui/PressableScale';

// Shades only the keyboard while the reasoning dial is open: an app-attached window over the IME
// (android/.../KeyboardScrimModule.kt). iOS draws its keyboard outside the app's windows, so nothing can cover it.
const keyboardScrim = Platform.OS === 'android' ? NativeModules.KeyboardScrim as { show: (top: number, height: number, opacity: number) => void; hide: () => void } | undefined : undefined;
const DIAL_SCRIM = 0.22;

export default function ChatScreen() {
  const c = usePalette(); const t = useStrings(); const mode = useThemeMode();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const locale = useApp(state => state.locale);
  const activeChatId = useApp(state => state.activeChatId);
  const isEmpty = useApp(state => state.conversation.length === 0);
  const reasoningMode = useApp(state => state.reasoningMode);
  const legacyPending = useApp(state => Boolean(state.activeSession.pendingLiveRequest));
  const hasAttachment = useApp(state => Boolean(state.imageAttachment || state.documentAttachment));
  const requestStatus = useChatUi(state => state.requestStatus);
  const requestError = useChatUi(state => state.requestError);

  const composerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const plusRef = useRef<View>(null);
  const boundsRef = useRef<View>(null);
  const composerHeight = useSharedValue(120);
  const blankSpace = useSharedValue(0);
  const atEnd = useSharedValue(true);
  const keyboard = useReanimatedKeyboardAnimation();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardBounds = useRef<{ top: number; height: number } | null>(null);

  // ---- Drawer: the chat slides right and dims; the drawer follows the finger and settles by velocity.
  const drawerWidth = Math.min(Math.round(width * 0.8), 340);
  const drawer = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const settleDrawer = useCallback((open: boolean) => {
    setDrawerOpen(open);
    drawer.value = withSpring(open ? 1 : 0, motion.settle);
  }, [drawer]);
  const openDrawer = useCallback(() => { Keyboard.dismiss(); haptic('selection'); settleDrawer(true); }, [settleDrawer]);
  const closeDrawer = useCallback(() => settleDrawer(false), [settleDrawer]);
  const drawerCloseCount = useStore(drawerCloseSignal, state => state.count);
  useEffect(() => {
    if (!drawerCloseCount) return;
    // Snap shut: the chat is revealed as the screen above fades away, so there is nothing to animate.
    setDrawerOpen(false); drawer.value = 0;
  }, [drawer, drawerCloseCount]);

  // ---- Plus menu and camera (the camera sheet grows out of the menu card and shrinks back into it).
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuSheetOpen, setMenuSheetOpen] = useState(false);
  const [menuInteractive, setMenuInteractive] = useState(false);
  const menuProgress = useSharedValue(0); const originLeft = useSharedValue(30); const originTop = useSharedValue(0); const targetTop = useSharedValue(0);
  const handoff = useSharedValue(0); const covering = useSharedValue(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraOrigin, setCameraOrigin] = useState<CameraSheetRect | null>(null);
  const [cameraExitTo, setCameraExitTo] = useState<CameraSheetRect | null>(null);
  const cameraSheetRef = useRef<CameraSheetHandle>(null);
  const cameraOpenRef = useRef(false); const cameraAskingRef = useRef(false); const cameraRestoresKeyboard = useRef(false);
  const [dialOpen, setDialOpen] = useState(false);
  const thinkHarder = reasoningMode !== 'default';

  const closeMenu = useCallback(() => {
    setMenuSheetOpen(false); setMenuInteractive(false);
    if (!menuVisible) return;
    menuProgress.value = withTiming(0, { duration: reducedMotion ? 1 : 190, easing: Easing.in(Easing.cubic) }, done => { if (done) runOnJS(setMenuVisible)(false); });
  }, [menuProgress, menuVisible, reducedMotion]);
  const openMenu = useCallback(() => {
    const plus = plusRef.current; const bounds = boundsRef.current;
    if (!plus || !bounds) return;
    plus.measureInWindow((plusX, plusY, plusW, plusH) => {
      bounds.measureInWindow((rootX, rootY, _rootW, rootH) => {
        if (rootH < PLUS_MENU_HEIGHT || plusW < 20) return;
        const left = plusX - rootX + (plusW - 44) / 2; const top = plusY - rootY + (plusH - 44) / 2;
        originLeft.value = left; originTop.value = top;
        targetTop.value = Math.max(insets.top + 8, Math.min(rootH - PLUS_MENU_HEIGHT, top + 44 - PLUS_MENU_HEIGHT));
        setMenuInteractive(false); setMenuVisible(true); setMenuSheetOpen(true);
        haptic('selection');
        menuProgress.value = withTiming(1, { duration: reducedMotion ? 1 : 270, easing: Easing.out(Easing.cubic) }, done => { if (done) runOnJS(setMenuInteractive)(true); });
      });
    });
  }, [insets.top, menuProgress, originLeft, originTop, reducedMotion, targetTop]);

  const finishHandoff = useCallback(() => { menuProgress.value = 0; handoff.value = 0; setMenuVisible(false); }, [handoff, menuProgress]);
  const openCamera = useCallback(async () => {
    if (cameraOpenRef.current || cameraAskingRef.current) return;
    const fromMenu = menuVisible;
    const restoreKeyboard = keyboardVisible;
    // Ask before the sheet opens. Android pauses the app behind its permission dialog, and a sheet that finished growing
    // during that pause came back open but invisible (still catching taps) once the app resumed.
    cameraAskingRef.current = true;
    try { await cameraAccess(true); } catch { /* the sheet reads access again and shows its denied state */ } finally { cameraAskingRef.current = false; }
    cameraRestoresKeyboard.current = restoreKeyboard;
    // Blur explicitly: a still-focused input would ignore the next tap and the keyboard would not come back after the camera.
    composerRef.current?.blur(); Keyboard.dismiss(); keyboardScrim?.hide(); setDialOpen(false);
    setCameraOrigin(fromMenu ? { x: PLUS_MENU_LEFT, y: targetTop.value, width: PLUS_MENU_WIDTH, height: PLUS_MENU_HEIGHT } : null);
    cameraOpenRef.current = true; setCameraOpen(true);
    if (fromMenu) { setMenuSheetOpen(false); setMenuInteractive(false); }
  }, [keyboardVisible, menuVisible, targetTop]);
  const onCameraEnterStart = useCallback(() => {
    if (!menuVisible) return;
    covering.value = 1;
    handoff.value = withTiming(1, { duration: reducedMotion ? 1 : 220 }, done => { if (done) runOnJS(finishHandoff)(); });
  }, [covering, finishHandoff, handoff, menuVisible, reducedMotion]);
  const onCameraExited = useCallback((to: 'menu' | 'chat') => { covering.value = 0; if (to === 'menu') setMenuInteractive(true); }, [covering]);
  const closeCamera = useCallback((to: 'menu' | 'chat') => {
    cameraOpenRef.current = false;
    const backToMenu = to === 'menu' && cameraOrigin !== null;
    setCameraExitTo(backToMenu ? cameraOrigin : null);
    setCameraOpen(false);
    // Every exit gives the draft its keyboard back if the camera took it.
    if (cameraRestoresKeyboard.current) {
      cameraRestoresKeyboard.current = false;
      composerRef.current?.blur();
      setTimeout(() => { if (!cameraOpenRef.current) composerRef.current?.focus(); }, 60);
    }
    if (!backToMenu) return;
    // Backing out returns to the menu the camera grew from; the sheet shrinks into the card and hands over on landing.
    menuProgress.value = 1; covering.value = 1; handoff.value = 1;
    setMenuVisible(true); setMenuSheetOpen(true); setMenuInteractive(false);
    handoff.value = withTiming(0, { duration: reducedMotion ? 1 : 220, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  }, [cameraOrigin, covering, handoff, menuProgress, reducedMotion]);

  const chooseAttachment = useCallback(async (kind: 'photos' | 'files') => {
    closeMenu();
    const de = appStore.get().locale === 'de';
    try {
      let uri = ''; let name = ''; let mimeType: string | null | undefined; let imageWidth = 0; let imageHeight = 0; let sizeBytes: number | null | undefined;
      if (kind === 'photos') {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0]; uri = asset.uri; name = asset.fileName || 'photo'; mimeType = asset.mimeType; imageWidth = asset.width; imageHeight = asset.height;
      } else {
        const result = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'application/pdf', 'text/plain', 'text/markdown'], copyToCacheDirectory: true, multiple: false });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0]; uri = asset.uri; name = asset.name; mimeType = asset.mimeType; sizeBytes = asset.size;
      }
      const documentMime = kind === 'files' ? supportedDocumentMimeType(mimeType, name) : undefined;
      if (documentMime) { const attachment = await persistDocumentAttachment(uri, name, documentMime, sizeBytes); setImageAttachment(undefined); setDocumentAttachment(attachment); return; }
      if (!isSupportedImage(mimeType, name)) { toast(de ? 'Bitte eine PNG- oder JPEG-Datei auswählen' : 'Choose a PNG or JPEG image'); return; }
      if (!imageWidth || !imageHeight) {
        const size = await new Promise<{ width: number; height: number }>((resolve, reject) => Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject));
        imageWidth = size.width; imageHeight = size.height;
      }
      const attachment = await persistImageAttachment(uri, name, imageWidth, imageHeight);
      setDocumentAttachment(undefined); setImageAttachment(attachment);
    } catch (error) {
      if (error instanceof DocumentAttachmentError && error.code === 'DOCUMENT_TOO_LARGE') { toast(errorText(appStore.get().locale, 'document_too_large')); return; }
      toast(kind === 'files' ? (de ? 'Datei konnte nicht hinzugefügt werden. Erlaubt sind PDF, TXT und Markdown bis 8 MiB.' : 'Could not attach that file. PDF, TXT, and Markdown up to 8 MiB are supported.') : (de ? 'Bild konnte nicht hinzugefügt werden' : 'Could not attach that image'));
    }
  }, [closeMenu]);
  /** Throws so the camera sheet can keep the photo in review and offer another try. */
  const attachCapturedPhoto = useCallback(async (photo: CapturedPhoto) => {
    const attachment = await persistImageAttachment(photo.uri, 'camera.jpg', photo.width, photo.height);
    setDocumentAttachment(undefined); setImageAttachment(attachment);
  }, []);
  const onMenuSelect = useCallback((action: PlusAction) => {
    if (action === 'camera') void openCamera();
    else if (action === 'think') {
      setThinkHarder(appStore.get().reasoningMode === 'default'); haptic('selection');
      setTimeout(closeMenu, 180);
    } else void chooseAttachment(action);
  }, [chooseAttachment, closeMenu, openCamera]);
  const cameraGhost = useMemo(() => <View style={{ width: PLUS_MENU_WIDTH }}><PlusMenuRows live={false} interactive={false} thinkHarder={thinkHarder} /></View>, [thinkHarder]);
  const cameraPalette = useMemo(() => ({ surface: c.surface }), [c.surface]);

  // ---- Keyboard, app state and the back button.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardVisible(true);
      keyboardBounds.current = { top: event.endCoordinates.screenY, height: event.endCoordinates.height };
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardBounds.current = null; keyboardScrim?.hide(); setKeyboardVisible(false); composerRef.current?.blur(); });
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    if (dialOpen && keyboardVisible && keyboardBounds.current) keyboardScrim?.show(keyboardBounds.current.top, keyboardBounds.current.height, DIAL_SCRIM);
    else keyboardScrim?.hide();
    return () => keyboardScrim?.hide();
  }, [dialOpen, keyboardVisible]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') { keyboardScrim?.hide(); return; }
      if (!menuSheetOpen) { menuProgress.value = 0; setMenuVisible(false); setMenuInteractive(false); }
      if (dialOpen && keyboardVisible && keyboardBounds.current) keyboardScrim?.show(keyboardBounds.current.top, keyboardBounds.current.height, DIAL_SCRIM);
    });
    return () => sub.remove();
  }, [dialOpen, keyboardVisible, menuProgress, menuSheetOpen]);
  useEffect(() => () => { keyboardScrim?.hide(); stopSpeech(); }, []);
  const firstScroll = useRef(true);
  useEffect(() => { syncRequestWithActiveChat(); blankSpace.value = 0; firstScroll.current = true; }, [activeChatId, blankSpace]);
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cameraOpen) return cameraSheetRef.current?.handleBack() ?? true;
      if (dialOpen) { setDialOpen(false); return true; }
      if (menuSheetOpen || menuVisible) { closeMenu(); return true; }
      if (drawerOpen) { closeDrawer(); return true; }
      if (chatUi.get().editingTurnId) { cancelEdit(); return true; }
      if (keyboardVisible) { Keyboard.dismiss(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [cameraOpen, closeDrawer, closeMenu, dialOpen, drawerOpen, keyboardVisible, menuSheetOpen, menuVisible]));

  const newChat = useCallback(() => { startNewChat(); closeDrawer(); Keyboard.dismiss(); haptic('light'); }, [closeDrawer]);

  // ---- Scrolling: chats open at the end; a sent message is lifted under the header with room below for the answer.
  const viewport = useRef(0);
  const onScrollLayout = useCallback((event: LayoutChangeEvent) => { viewport.current = event.nativeEvent.layout.height; }, []);
  const topPadding = insets.top + HEADER_HEIGHT + 4;
  const onContentSize = useCallback(() => {
    if (!firstScroll.current) return;
    firstScroll.current = false;
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, []);

  // Plain JS callback: a worklet must not capture RN's Keyboard object (Worklets can't copy it and the app crashes).
  const settledByDrag = useCallback((open: boolean) => { setDrawerOpen(open); if (open) Keyboard.dismiss(); }, []);
  const drawerGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX(drawerOpen ? -14 : 14).failOffsetY([-12, 12])
    .enabled(!cameraOpen && !dialOpen && !menuVisible)
    .onStart(() => { dragStart.value = drawer.value; })
    .onUpdate(event => { drawer.value = Math.min(1, Math.max(0, dragStart.value + event.translationX / drawerWidth)); })
    .onEnd(event => {
      const open = event.velocityX > 450 ? true : event.velocityX < -450 ? false : drawer.value > 0.5;
      drawer.value = withSpring(open ? 1 : 0, { ...motion.settle, velocity: event.velocityX / drawerWidth });
      runOnJS(settledByDrag)(open);
    }), [cameraOpen, dialOpen, drawer, drawerOpen, drawerWidth, dragStart, menuVisible, settledByDrag]);
  const chatStyle = useAnimatedStyle(() => ({ transform: [{ translateX: drawer.value * drawerWidth }] }));
  const drawerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (drawer.value - 1) * drawerWidth * 0.25 }], opacity: 0.4 + drawer.value * 0.6 }));
  // A shut drawer leaves the view tree (display none): otherwise its buttons still take keyboard focus, and a Space
  // typed while nothing is focused "clicked" the hidden Search button.
  const [drawerShown, setDrawerShown] = useState(false);
  useAnimatedReaction(() => drawer.value > 0.001, (shown, previous) => { if (shown !== previous) runOnJS(setDrawerShown)(shown); });
  const dimStyle = useAnimatedStyle(() => ({ opacity: drawer.value * (mode === 'dark' ? 0.55 : 0.3) }), [mode]);

  const fabStyle = useAnimatedStyle(() => {
    const shown = atEnd.value ? 0 : 1;
    return {
      opacity: withTiming(shown, { duration: 160 }),
      transform: [{ scale: withSpring(shown ? 1 : 0.6, motion.snappy) }],
      bottom: composerHeight.value - keyboard.height.value - keyboard.progress.value * insets.bottom + 12,
    };
  }, [insets.bottom]);
  const greetingStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (keyboard.height.value + keyboard.progress.value * insets.bottom) / 2 }] }), [insets.bottom]);
  const dialPosition = useAnimatedStyle(() => ({ bottom: composerHeight.value - keyboard.height.value - keyboard.progress.value * insets.bottom + 6 }), [insets.bottom]);

  const showGlobalError = shouldShowGlobalChatError(currentRequest(), requestStatus === 'error' && Boolean(requestError));
  const effortLabels = useMemo(() => ({ instant: t.effortLabel.instant, medium: locale === 'de' ? 'Mittlerer' : 'Medium', high: locale === 'de' ? 'Hoher' : 'High', effort: t.effortWord, chooseEffort: t.chooseEffort }), [locale, t]);

  // The drawer gesture covers both panels, so an open drawer can also be swiped shut from the drawer itself.
  return <GestureDetector gesture={drawerGesture}><View style={{ flex: 1, backgroundColor: c.drawer }}>
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, width: drawerWidth, display: drawerShown ? 'flex' : 'none' }, drawerStyle]} accessibilityElementsHidden={!drawerOpen} importantForAccessibility={drawerOpen ? 'auto' : 'no-hide-descendants'}>
      <ChatDrawer width={drawerWidth} topInset={insets.top} bottomInset={insets.bottom} onClose={closeDrawer} onNewChat={newChat} busy={requestStatus === 'loading'} />
    </Animated.View>
    <Animated.View style={[{ flex: 1, backgroundColor: c.canvas, overflow: 'hidden' }, chatStyle]}>
      <View ref={boundsRef} style={{ flex: 1 }} accessibilityElementsHidden={drawerOpen || cameraOpen} importantForAccessibility={drawerOpen || cameraOpen ? 'no-hide-descendants' : 'auto'}>
        {isEmpty ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 24, right: 24, top: topPadding, bottom: 140, alignItems: 'center', justifyContent: 'center' }, greetingStyle]}>
          <Animated.Text key={activeChatId} entering={reducedMotion ? undefined : FadeIn.duration(360).delay(60)} style={{ ...type.display, color: c.text, textAlign: 'center' }}>{t.greeting}</Animated.Text>
        </Animated.View> : null}
        <KeyboardChatScrollView ref={scrollRef} keyboardLiftBehavior="whenAtEnd" offset={insets.bottom} extraContentPadding={composerHeight} blankSpace={blankSpace}
          onEndVisible={visible => { 'worklet'; atEnd.value = visible; }} onLayout={onScrollLayout} onContentSizeChange={onContentSize}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <Turns topPadding={topPadding} viewport={viewport} blankSpace={blankSpace} scrollRef={scrollRef} />
        </KeyboardChatScrollView>
        <ChatHeader topInset={insets.top} onMenu={openDrawer} onNewChat={newChat} />
        <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', alignSelf: 'center', zIndex: 5 }, fabStyle]}>
          <IconButton label={t.scrollToBottom} size={38} variant="surface" onPress={() => scrollRef.current?.scrollToEnd({ animated: true })} style={{ borderWidth: 1, borderColor: c.line }}>
            <Icon name="arrow-down" size={19} color={c.text} />
          </IconButton>
        </Animated.View>
        <StickyComposer bottomInset={insets.bottom} height={composerHeight}>
          {showGlobalError && requestError ? <Animated.View entering={FadeIn} exiting={FadeOut} accessibilityLiveRegion="polite" style={{ marginHorizontal: 16, marginBottom: 8, minHeight: 44, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ ...type.helper, flex: 1, color: c.muted }}>{errorText(locale, requestError)}</Text>
            {!requestError.startsWith('document_') ? <PressableScale onPress={() => retryRequest()} accessibilityRole="button" style={{ minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' }}><Text style={{ ...type.label, fontSize: 13, color: c.accent }}>{t.retry}</Text></PressableScale> : null}
            <IconButton label={t.cancel} size={30} onPress={dismissRequestError}><Icon name="x" size={16} color={c.muted} /></IconButton>
          </Animated.View> : null}
          {legacyPending && requestStatus === 'idle' ? <View style={{ marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 16, backgroundColor: c.surface }}><Text style={{ ...type.helper, color: c.muted }}>{locale === 'de' ? 'Eine Anfrage aus einer früheren Version kann hier nicht wiederholt werden. Der Entwurf bleibt gespeichert.' : 'A request from an earlier version can’t be retried here. Its draft is still saved.'}</Text></View> : null}
          <Composer ref={composerRef} plusRef={plusRef} onPlus={openMenu} onOpenDial={() => { haptic('selection'); setDialOpen(true); }} plusOpen={menuSheetOpen} dialOpen={dialOpen} bottomInset={insets.bottom} />
        </StickyComposer>
        {menuVisible ? <PlusMenu sheetOpen={menuSheetOpen} interactive={menuInteractive} thinkHarder={thinkHarder} progress={menuProgress} originLeft={originLeft} originTop={originTop} targetTop={targetTop} handoff={handoff} covering={covering} onClose={closeMenu} onSelect={onMenuSelect} /> : null}
      </View>
      {/* Kept mounted (camera off while closed) so its first growing frame lands together with the menu hand-off. */}
      <CameraSheet ref={cameraSheetRef} open={cameraOpen} origin={cameraOrigin} exitTo={cameraExitTo} ghost={cameraGhost} locale={locale} palette={cameraPalette} reducedMotion={reducedMotion} bottomInset={insets.bottom} topReserve={insets.top + HEADER_HEIGHT + 8} onRequestClose={closeCamera} onEnterStart={onCameraEnterStart} onExited={onCameraExited} onAccept={attachCapturedPhoto} />
      {dialOpen && !menuVisible ? <Animated.View entering={FadeIn.duration(reducedMotion ? 1 : 170)} exiting={FadeOut.duration(reducedMotion ? 1 : 130)} pointerEvents="box-none" accessibilityViewIsModal onAccessibilityEscape={() => setDialOpen(false)} style={{ position: 'absolute', zIndex: 110, elevation: 26, inset: 0 }}>
        <Pressable onPress={() => setDialOpen(false)} accessibilityRole="button" accessibilityLabel={t.closeDial} style={{ position: 'absolute', inset: 0, backgroundColor: '#00000073' }} />
        <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }, dialPosition]}>
          <Animated.View entering={reducedMotion ? undefined : SlideInDown.duration(220).easing(Easing.out(Easing.cubic))} exiting={reducedMotion ? undefined : SlideOutDown.duration(150)} style={{ alignItems: 'center', width: '100%' }}>
            <ReasoningEffortDial value={reasoningMode} onChange={setReasoningMode} reducedMotion={reducedMotion} labels={effortLabels} colors={{ text: c.text, muted: c.muted, faint: c.faint, accent: '#A25BFF', line: c.line, selected: c.selected }} />
            {hasAttachment && reasoningMode !== 'default' ? <Text style={{ ...type.helper, width: '84%', color: '#D0D0D0', marginTop: 8, textAlign: 'center' }}>{errorText(locale, 'reasoning_image_unsupported')}</Text> : null}
          </Animated.View>
        </Animated.View>
      </Animated.View> : null}
      <Animated.View pointerEvents={drawerOpen ? 'auto' : 'none'} style={[{ position: 'absolute', inset: 0, backgroundColor: c.scrim, zIndex: 200 }, dimStyle]}>
        <Pressable style={{ flex: 1 }} onPress={closeDrawer} accessibilityRole="button" accessibilityLabel={t.cancel} />
      </Animated.View>
    </Animated.View>
  </View></GestureDetector>;
}

/** The composer rides the keyboard; its bottom padding (the gesture bar) is given back while the keyboard is up. */
function StickyComposer({ bottomInset, height, children }: { bottomInset: number; height: SharedValue<number>; children: React.ReactNode }) {
  const c = usePalette();
  const keyboard = useReanimatedKeyboardAnimation();
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: keyboard.height.value + keyboard.progress.value * bottomInset }] }), [bottomInset]);
  return <Animated.View onLayout={event => { height.value = event.nativeEvent.layout.height; }} pointerEvents="box-none" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20 }, style]}>
    {/* Answers fade out behind the composer instead of showing through the gap below it. */}
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: -COMPOSER_FADE, bottom: 0 }}>
      <View style={{ height: COMPOSER_FADE + 6, experimental_backgroundImage: `linear-gradient(180deg, ${c.canvas}00 0%, ${c.canvas} 100%)` }} />
      <View style={{ flex: 1, backgroundColor: c.canvas }} />
    </View>
    {children}
  </Animated.View>;
}
const COMPOSER_FADE = 20;

/**
 * The turns, plus the ChatGPT "lift": a sent message scrolls up to sit under the header and the space below it is
 * reserved (blankSpace) so the answer appears in view. The reservation shrinks as the answer grows.
 */
const Turns = React.memo(function Turns({ topPadding, viewport, blankSpace, scrollRef }: {
  topPadding: number; viewport: React.RefObject<number>; blankSpace: SharedValue<number>; scrollRef: React.RefObject<Animated.ScrollView | null>;
}) {
  const conversation = useApp(state => state.conversation);
  const pinnedTurnId = useChatUi(state => state.pinnedTurnId);
  const fresh = useRef(new Set<string>());
  const scrolledFor = useRef<string | null>(null);
  if (pinnedTurnId) fresh.current.add(pinnedTurnId);
  const last = conversation.at(-1);
  const onLastLayout = (event: LayoutChangeEvent) => {
    if (!pinnedTurnId || last?.id !== pinnedTurnId) return;
    const { y, height } = event.nativeEvent.layout;
    blankSpace.value = Math.max(0, (viewport.current ?? 0) - topPadding - height - 8);
    if (scrolledFor.current === pinnedTurnId) return;
    scrolledFor.current = pinnedTurnId;
    requestAnimationFrame(() => requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - topPadding), animated: true })));
  };
  return <View style={{ paddingTop: topPadding, paddingBottom: 8 }}>
    {conversation.map(turn => <View key={turn.id} onLayout={turn.id === last?.id ? onLastLayout : undefined}>
      <TurnView turn={turn} fresh={fresh.current.has(turn.id)} />
    </View>)}
  </View>;
});
