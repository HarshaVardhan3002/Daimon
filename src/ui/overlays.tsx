import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, motion, radius, type } from '../design/tokens';
import { usePalette, useThemeMode } from '../design/useTheme';
import { createStore, useStore } from '../state/store';
import { Icon, type FeatherName } from './icons';
import { PressableScale, haptic } from './PressableScale';

// ------------------------------------------------------------------------------------------------------------------
// Stores. Any component can open an overlay without owning it; one host at the root draws all of them above the
// navigation stack, so menus are never clipped by a scroll view.

export type Rect = { x: number; y: number; width: number; height: number };
export type MenuItem =
  | { kind?: 'item'; key: string; label: string; icon?: FeatherName; iconNode?: React.ReactNode; danger?: boolean; disabled?: boolean; checked?: boolean; onPress: () => void }
  | { kind: 'divider'; key: string }
  | { kind: 'note'; key: string; label: string };
export type MenuSpec = { anchor: Rect; items: MenuItem[]; header?: string; align?: 'left' | 'right'; minWidth?: number };
export type SheetSpec = { title?: string; render: (close: () => void) => React.ReactNode };
type DialogSpec =
  | { kind: 'confirm'; title: string; message?: string; confirmLabel: string; cancelLabel: string; destructive?: boolean; resolve: (value: boolean) => void }
  | { kind: 'prompt'; title: string; initial: string; placeholder?: string; confirmLabel: string; cancelLabel: string; resolve: (value: string | null) => void };

type OverlayShape = { menu: (MenuSpec & { id: number }) | null; sheet: (SheetSpec & { id: number }) | null; dialog: (DialogSpec & { id: number }) | null; toast: { id: number; message: string } | null };
const overlayStore = createStore<OverlayShape>({ menu: null, sheet: null, dialog: null, toast: null });
let sequence = 0;
const closers: { menu?: () => void; sheet?: () => void; dialog?: () => void } = {};

export function openMenu(spec: MenuSpec): void { Keyboard.dismiss(); overlayStore.set({ menu: { ...spec, id: ++sequence } }); }
export function closeMenu(): void { closers.menu ? closers.menu() : overlayStore.set({ menu: null }); }
export function openSheet(spec: SheetSpec): void { Keyboard.dismiss(); overlayStore.set({ sheet: { ...spec, id: ++sequence }, menu: null }); }
export function closeSheet(): void { closers.sheet ? closers.sheet() : overlayStore.set({ sheet: null }); }
export function confirm(spec: Omit<Extract<DialogSpec, { kind: 'confirm' }>, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise(resolve => overlayStore.set({ dialog: { ...spec, kind: 'confirm', resolve, id: ++sequence }, menu: null }));
}
export function prompt(spec: Omit<Extract<DialogSpec, { kind: 'prompt' }>, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise(resolve => overlayStore.set({ dialog: { ...spec, kind: 'prompt', resolve, id: ++sequence }, menu: null }));
}
let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(message: string): void {
  if (toastTimer) clearTimeout(toastTimer);
  overlayStore.set({ toast: { id: ++sequence, message } });
  toastTimer = setTimeout(() => overlayStore.set({ toast: null }), 2200);
}
/** Measure a view and open a menu anchored to it. */
export function openMenuFrom(view: View | null, spec: Omit<MenuSpec, 'anchor'>): void {
  if (!view) return;
  view.measureInWindow((x, y, width, height) => openMenu({ ...spec, anchor: { x, y, width, height } }));
}

// ------------------------------------------------------------------------------------------------------------------

export function OverlayHost() {
  const menu = useStore(overlayStore, state => state.menu);
  const sheet = useStore(overlayStore, state => state.sheet);
  const dialog = useStore(overlayStore, state => state.dialog);
  const toastState = useStore(overlayStore, state => state.toast);
  useEffect(() => {
    if (!menu && !sheet && !dialog) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dialog) closers.dialog?.();
      else if (menu) closeMenu();
      else if (sheet) closeSheet();
      return true;
    });
    return () => sub.remove();
  }, [menu, sheet, dialog]);
  return <>
    {sheet ? <SheetView key={sheet.id} spec={sheet} /> : null}
    {menu ? <MenuView key={menu.id} spec={menu} /> : null}
    {dialog ? <DialogView key={dialog.id} spec={dialog} /> : null}
    <ToastView toast={toastState} />
  </>;
}

// ------------------------------------------------------------------------------------------------------------------
// Anchored menu (answer ⋮, header ⋮, long-press, settings dropdowns).

const MENU_MARGIN = 12;
function MenuView({ spec }: { spec: MenuSpec & { id: number } }) {
  const c = usePalette();
  const mode = useThemeMode();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const progress = useSharedValue(0);
  const closing = useRef(false);
  const finish = useCallback(() => overlayStore.set(state => state.menu?.id === spec.id ? { menu: null } : {}), [spec.id]);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    progress.value = withTiming(0, { duration: 120, easing: Easing.in(Easing.quad) }, done => { if (done) runOnJS(finish)(); });
  }, [finish, progress]);
  useEffect(() => { closers.menu = close; return () => { if (closers.menu === close) closers.menu = undefined; }; }, [close]);
  useEffect(() => { if (size) progress.value = withTiming(1, { duration: 210, easing: motion.enter }); }, [size, progress]);

  const { anchor } = spec;
  const width = size?.width ?? 0; const height = size?.height ?? 0;
  const spaceBelow = screenH - insets.bottom - (anchor.y + anchor.height) - MENU_MARGIN;
  const below = spaceBelow >= height || spaceBelow > anchor.y - insets.top - MENU_MARGIN;
  const top = below ? Math.min(anchor.y + anchor.height + 6, screenH - insets.bottom - height - MENU_MARGIN) : Math.max(insets.top + MENU_MARGIN, anchor.y - height - 6);
  const alignRight = spec.align ? spec.align === 'right' : anchor.x + anchor.width / 2 > screenW / 2;
  const left = Math.max(MENU_MARGIN, Math.min(screenW - width - MENU_MARGIN, alignRight ? anchor.x + anchor.width - width : anchor.x));
  const origin = `${below ? 'top' : 'bottom'} ${alignRight ? 'right' : 'left'}`;
  const panelStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.86 + 0.14 * progress.value }, { translateY: (below ? -6 : 6) * (1 - progress.value) }] }), [below]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value * (mode === 'dark' ? 0.45 : 0.2) }), [mode]);
  const onLayout = (event: LayoutChangeEvent) => { if (!size) setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height }); };

  return <View style={{ position: 'absolute', inset: 0, zIndex: 900, elevation: 30 }} accessibilityViewIsModal>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, backgroundColor: c.scrim }, scrimStyle]} />
    <Pressable style={{ position: 'absolute', inset: 0 }} onPress={close} accessibilityRole="button" accessibilityLabel="Close menu" />
    <Animated.View onLayout={onLayout} style={[{ position: 'absolute', top: size ? top : -9999, left: size ? left : 0, minWidth: spec.minWidth ?? 216, maxWidth: Math.min(320, screenW - MENU_MARGIN * 2), borderRadius: radius.card, backgroundColor: c.surface, paddingVertical: 6, transformOrigin: origin, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 }, panelStyle]}>
      {spec.header ? <Text style={{ ...type.labelRegular, color: c.muted, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6 }}>{spec.header}</Text> : null}
      {spec.items.map(item => {
        if (item.kind === 'divider') return <View key={item.key} style={{ height: 1, marginVertical: 5, marginHorizontal: 16, backgroundColor: c.line }} />;
        if (item.kind === 'note') return <Text key={item.key} style={{ ...type.labelRegular, color: c.muted, paddingHorizontal: 18, paddingVertical: 10 }}>{item.label}</Text>;
        const color = item.danger ? c.danger : c.text;
        return <PressableScale key={item.key} disabled={item.disabled} scaleTo={0.98} highlight={c.raised} accessibilityRole="menuitem" accessibilityLabel={item.label} accessibilityState={{ disabled: Boolean(item.disabled), checked: item.checked }}
          onPress={() => { close(); item.onPress(); }}
          style={{ minHeight: 48, marginHorizontal: 6, borderRadius: radius.row, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: item.disabled ? 0.4 : 1 }}>
          {item.iconNode ?? (item.icon ? <Icon name={item.icon} size={19} color={color} /> : null)}
          <Text numberOfLines={1} style={{ ...type.body, flexShrink: 1, color }}>{item.label}</Text>
          {item.checked ? <View style={{ marginLeft: 'auto', paddingLeft: 12 }}><Icon name="check" size={18} color={c.accent} /></View> : null}
        </PressableScale>;
      })}
    </Animated.View>
  </View>;
}

// ------------------------------------------------------------------------------------------------------------------
// Bottom sheet with drag-to-dismiss.

function SheetView({ spec }: { spec: SheetSpec & { id: number } }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const offset = useSharedValue(screenH);
  const panelHeight = useSharedValue(screenH);
  const closing = useRef(false);
  const finish = useCallback(() => overlayStore.set(state => state.sheet?.id === spec.id ? { sheet: null } : {}), [spec.id]);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    offset.value = withTiming(panelHeight.value + 40, { duration: 220, easing: motion.leave }, done => { if (done) runOnJS(finish)(); });
  }, [finish, offset, panelHeight]);
  useEffect(() => { closers.sheet = close; return () => { if (closers.sheet === close) closers.sheet = undefined; }; }, [close]);
  const onLayout = (event: LayoutChangeEvent) => {
    const first = panelHeight.value === screenH;
    panelHeight.value = event.nativeEvent.layout.height;
    if (first) { offset.value = event.nativeEvent.layout.height; offset.value = withSpring(0, motion.settle); }
  };
  const drag = Gesture.Pan().activeOffsetY(8).failOffsetX([-20, 20])
    .onChange(event => { offset.value = Math.max(0, offset.value + event.changeY); })
    .onEnd(event => {
      if (event.translationY > panelHeight.value * 0.3 || event.velocityY > 900) runOnJS(close)();
      else offset.value = withSpring(0, motion.settle);
    });
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - Math.min(1, offset.value / Math.max(1, panelHeight.value))) }));
  return <View style={{ position: 'absolute', inset: 0, zIndex: 800, elevation: 28 }} accessibilityViewIsModal>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, backgroundColor: c.scrim }, scrimStyle]} />
    <Pressable style={{ position: 'absolute', inset: 0 }} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
    <Animated.View onLayout={onLayout} style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: screenH * 0.88, backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingBottom: insets.bottom + 8 }, panelStyle]}>
      <GestureDetector gesture={drag}>
        <View style={{ paddingTop: 10, paddingBottom: spec.title ? 4 : 8 }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.faint, opacity: 0.6 }} />
          {spec.title ? <Text accessibilityRole="header" style={{ ...type.heading, color: c.text, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 6 }}>{spec.title}</Text> : null}
        </View>
      </GestureDetector>
      <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 8 }}>{spec.render(close)}</ScrollView>
    </Animated.View>
  </View>;
}

// ------------------------------------------------------------------------------------------------------------------
// Dialogs.

function DialogView({ spec }: { spec: DialogSpec & { id: number } }) {
  const c = usePalette();
  const mode = useThemeMode();
  const progress = useSharedValue(0);
  const [text, setText] = useState(spec.kind === 'prompt' ? spec.initial : '');
  const settled = useRef(false);
  const finish = useCallback(() => overlayStore.set(state => state.dialog?.id === spec.id ? { dialog: null } : {}), [spec.id]);
  const settle = useCallback((result: boolean | string | null) => {
    if (settled.current) return;
    settled.current = true;
    if (spec.kind === 'confirm') spec.resolve(result === true);
    else spec.resolve(typeof result === 'string' ? result : null);
    progress.value = withTiming(0, { duration: 130 }, done => { if (done) runOnJS(finish)(); });
  }, [finish, progress, spec]);
  useEffect(() => { closers.dialog = () => settle(spec.kind === 'confirm' ? false : null); return () => { closers.dialog = undefined; }; }, [settle, spec.kind]);
  useEffect(() => { progress.value = withSpring(1, motion.spring); if (spec.kind === 'confirm' && spec.destructive) haptic('warning'); }, [progress, spec]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value * 1.4), transform: [{ scale: 0.9 + 0.1 * progress.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value * (mode === 'dark' ? 0.6 : 0.35) }), [mode]);
  const cancel = () => settle(spec.kind === 'confirm' ? false : null);
  const accept = () => settle(spec.kind === 'confirm' ? true : text.trim() ? text : null);
  const confirmColor = spec.kind === 'confirm' && spec.destructive ? c.danger : c.accent;
  return <View style={{ position: 'absolute', inset: 0, zIndex: 1000, elevation: 32 }} accessibilityViewIsModal>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, backgroundColor: c.scrim }, scrimStyle]} />
    <Pressable style={{ position: 'absolute', inset: 0 }} onPress={cancel} accessibilityRole="button" accessibilityLabel={spec.cancelLabel} />
    <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
      <Animated.View style={[{ backgroundColor: c.surface, borderRadius: 28, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 12 }, cardStyle]}>
        <Text accessibilityRole="header" style={{ ...type.title, color: c.text }}>{spec.title}</Text>
        {spec.kind === 'confirm' && spec.message ? <Text style={{ ...type.labelRegular, color: c.muted, marginTop: 10 }}>{spec.message}</Text> : null}
        {spec.kind === 'prompt' ? <TextInput value={text} onChangeText={setText} autoFocus selectTextOnFocus placeholder={spec.placeholder} placeholderTextColor={c.faint} keyboardAppearance={mode} onSubmitEditing={accept} returnKeyType="done" maxLength={120} accessibilityLabel={spec.title}
          style={{ marginTop: 16, minHeight: 50, borderRadius: radius.row, borderWidth: 1.5, borderColor: c.accent, paddingHorizontal: 14, color: c.text, fontFamily: font.regular, fontSize: 16 }} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginTop: 18 }}>
          <PressableScale onPress={cancel} highlight={c.raised} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' }}><Text style={{ ...type.label, color: c.text }}>{spec.cancelLabel}</Text></PressableScale>
          <PressableScale onPress={accept} highlight={c.raised} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' }}><Text style={{ ...type.label, color: confirmColor }}>{spec.confirmLabel}</Text></PressableScale>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  </View>;
}

// ------------------------------------------------------------------------------------------------------------------

function ToastView({ toast: current }: { toast: OverlayShape['toast'] }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const [shown, setShown] = useState(current);
  useEffect(() => {
    if (current) { setShown(current); progress.value = withSpring(1, motion.spring); }
    else progress.value = withTiming(0, { duration: motion.exit });
  }, [current, progress]);
  const style = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 16 }, { scale: 0.94 + 0.06 * progress.value }] }));
  if (!shown) return null;
  return <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[{ position: 'absolute', zIndex: 1100, elevation: 34, alignSelf: 'center', bottom: insets.bottom + 96, maxWidth: '86%', backgroundColor: c.text, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 }, style]}>
    <Text style={{ ...type.label, fontSize: 14, color: c.canvas, textAlign: 'center' }}>{shown.message}</Text>
  </Animated.View>;
}
