import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { AccessibilityActionEvent, LayoutChangeEvent, Platform, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, interpolateColor, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { cosmos } from '../design/tokens';
import type { ReasoningMode } from './reasoningEffort';

type Props = {
  value: ReasoningMode;
  onChange: (mode: ReasoningMode) => void;
  labels: { instant: string; medium: string; high: string; effort: string; chooseEffort: string };
  reducedMotion: boolean;
};

const STOPS: ReasoningMode[] = ['instant', 'medium', 'high'];
const LAST_STOP = STOPS.length - 1;
// Geometry measured from the ChatGPT reference capture (dp).
const CAPSULE_HEIGHT = 72;
const CAPSULE_INSET = 12;
const RAIL_HEIGHT = CAPSULE_HEIGHT - CAPSULE_INSET * 2;
const THUMB_SIZE = 40;
const THUMB_INSET = (RAIL_HEIGHT - THUMB_SIZE) / 2;
const EDGE = THUMB_INSET + THUMB_SIZE / 2;
const DOT_SIZE = 12;
const TAP_SLOP = 6;
const GRAB_SLOP = 8;
const MAX_RELEASE_VELOCITY = 1200;
// The dial always sits on the dark scrim, so it uses the cosmic HUD colours in both themes.
const HUD = cosmos.hud;
// The fill reveals a fixed spectrum, so its leading edge warms from moonlit teal to solar gold as effort rises.
const SPECTRUM = [0, 0.45, 0.72, 1];
const [TEAL, INDIGO, VIOLET, GOLD] = cosmos.energy;
const STOP_COLORS = [TEAL, '#9A8BFB', GOLD] as const;
const BAND = 56;
const HALO = RAIL_HEIGHT;
// One energy cycle while dragging: a light pulse travels along the fill and the stars twinkle.
const FLOW_MS = 1400;
const SNAP_SPRING = { stiffness: 420, damping: 32, mass: 1 };
const FOLLOW_SPRING = { stiffness: 1000, damping: 64, mass: 1 };
const APPEAR = { duration: 150, easing: Easing.out(Easing.cubic) };

// Gesture callbacks run on the UI thread, so every helper they call must stay a worklet.
const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, value));
};
const knobX = (railWidth: number, index: number) => {
  'worklet';
  return EDGE + Math.max(0, railWidth - EDGE * 2) * index / LAST_STOP;
};
const nearestStop = (railWidth: number, x: number) => {
  'worklet';
  return Math.round(clamp((x - EDGE) / Math.max(1, railWidth - EDGE * 2), 0, 1) * LAST_STOP);
};

const tick = () => {
  if (Platform.OS === 'android') {
    void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
      .catch(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick))
      .catch(() => undefined);
  } else void Haptics.selectionAsync().catch(() => undefined);
};

export function ReasoningEffortDial({ value, onChange, labels, reducedMotion }: Props) {
  const stopIndex = value === 'default' ? -1 : STOPS.indexOf(value);
  // Seed the first render from the viewport so the entering capsule never has
  // to wait for onLayout → React state → effect before its selected rail appears.
  const { width: viewportWidth } = useWindowDimensions();
  const initialRailWidth = Math.max(1, Math.min(viewportWidth - 56, 440) - CAPSULE_INSET * 2);
  const [railWidth, setRailWidth] = useState(initialRailWidth);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const railW = useSharedValue(initialRailWidth);
  const knob = useSharedValue(knobX(initialRailWidth, Math.max(0, stopIndex)));
  const shown = useSharedValue(stopIndex >= 0 ? 1 : 0);
  const settled = useSharedValue(stopIndex);
  const live = useSharedValue(stopIndex);
  const phase = useSharedValue(0);
  const grabbed = useSharedValue(0);
  const catching = useSharedValue(0);
  const startX = useSharedValue(0);
  const grabOffset = useSharedValue(0);
  const reduced = useSharedValue(reducedMotion ? 1 : 0);
  const energized = useSharedValue(0);
  const flow = useSharedValue(0);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const placedIndex = useRef<number | null>(stopIndex);
  const placedWidth = useRef(initialRailWidth);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { reduced.value = reducedMotion ? 1 : 0; }, [reduced, reducedMotion]);

  // Places the thumb for external value changes (accessibility actions, first layout); gesture commits are already placed.
  useEffect(() => {
    if (!railWidth) return;
    const relayout = placedWidth.current !== railWidth;
    if (!relayout && placedIndex.current === stopIndex) return;
    const animate = !relayout && !reducedMotion;
    const wasVisible = (placedIndex.current ?? -1) >= 0;
    placedWidth.current = railWidth;
    placedIndex.current = stopIndex;
    settled.value = stopIndex;
    live.value = stopIndex;
    if (stopIndex < 0) { shown.value = animate ? withTiming(0, APPEAR) : 0; return; }
    const target = knobX(railWidth, stopIndex);
    if (animate && wasVisible) { knob.value = withSpring(target, SNAP_SPRING); return; }
    knob.value = target;
    shown.value = animate ? withTiming(1, APPEAR) : 1;
  }, [knob, live, railWidth, reducedMotion, settled, shown, stopIndex]);

  const preview = useCallback((index: number) => {
    tick();
    setPreviewIndex(index);
  }, []);
  const clearPreview = useCallback(() => setPreviewIndex(null), []);
  const commit = useCallback((index: number) => {
    setPreviewIndex(null);
    placedIndex.current = index;
    const next = STOPS[index];
    if (next && next !== valueRef.current) onChangeRef.current(next);
  }, []);

  const onCapsuleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.max(0, event.nativeEvent.layout.width - CAPSULE_INSET * 2);
    railW.value = next;
    setRailWidth(next);
  }, [railW]);

  const pan = useMemo(() => Gesture.Pan()
    .minDistance(TAP_SLOP)
    .onBegin(event => {
      const width = railW.value;
      if (width <= 0) return;
      const x = event.x - CAPSULE_INSET;
      phase.value = 1;
      startX.value = x;
      catching.value = 0;
      grabbed.value = settled.value >= 0 && Math.abs(x - knob.value) <= THUMB_SIZE / 2 + GRAB_SLOP ? 1 : 0;
      grabOffset.value = grabbed.value ? knob.value - x : 0;
      if (grabbed.value) cancelAnimation(knob);
      live.value = settled.value;
    })
    .onUpdate(event => {
      const width = railW.value;
      if (!phase.value || width <= 0) return;
      const x = event.x - CAPSULE_INSET;
      if (phase.value === 1) {
        if (!grabbed.value && Math.abs(x - startX.value) < TAP_SLOP) return;
        phase.value = 2;
        if (!reduced.value) {
          energized.value = withTiming(1, { duration: 220 });
          flow.value = 0;
          flow.value = withRepeat(withTiming(1, { duration: FLOW_MS, easing: Easing.linear }), -1, false);
        }
        if (settled.value < 0) {
          knob.value = clamp(x, EDGE, width - EDGE);
          shown.value = reduced.value ? 1 : withTiming(1, APPEAR);
        } else if (!grabbed.value && !reduced.value) catching.value = 1;
      }
      const target = clamp(x + grabOffset.value, EDGE, width - EDGE);
      if (catching.value && Math.abs(knob.value - target) > 0.5) knob.value = withSpring(target, FOLLOW_SPRING);
      else { catching.value = 0; knob.value = target; }
      const index = nearestStop(width, target);
      if (index !== live.value) { live.value = index; runOnJS(preview)(index); }
    })
    .onFinalize((event, success) => {
      const width = railW.value;
      if (!phase.value || width <= 0) return;
      if (energized.value > 0) energized.value = withTiming(0, { duration: 520, easing: Easing.out(Easing.quad) }, done => { if (done) cancelAnimation(flow); });
      if (!success) {
        const previousIndex = settled.value;
        phase.value = 0;
        catching.value = 0;
        live.value = previousIndex;
        if (previousIndex < 0) shown.value = reduced.value ? 0 : withTiming(0, APPEAR);
        else if (reduced.value) knob.value = knobX(width, previousIndex);
        else knob.value = withSpring(knobX(width, previousIndex), SNAP_SPRING);
        runOnJS(clearPreview)();
        return;
      }
      const dragged = phase.value === 2;
      // A running catch-up spring already carries its own velocity into the snap.
      const releaseVelocity = dragged && !catching.value ? clamp(event.velocityX, -MAX_RELEASE_VELOCITY, MAX_RELEASE_VELOCITY) : 0;
      phase.value = 0;
      catching.value = 0;
      const x = event.x - CAPSULE_INSET;
      const index = dragged ? nearestStop(width, clamp(x + grabOffset.value, EDGE, width - EDGE)) : grabbed.value ? settled.value : nearestStop(width, x);
      const target = knobX(width, index);
      if (!dragged && settled.value < 0) {
        knob.value = target;
        shown.value = reduced.value ? 1 : withTiming(1, APPEAR);
      } else if (reduced.value) knob.value = target;
      else knob.value = withSpring(target, { ...SNAP_SPRING, velocity: releaseVelocity });
      settled.value = index;
      if (index !== live.value) { live.value = index; runOnJS(preview)(index); }
      runOnJS(commit)(index);
    }), [catching, clearPreview, commit, energized, flow, grabOffset, grabbed, knob, live, phase, preview, railW, reduced, settled, shown, startX]);

  const tap = useMemo(() => Gesture.Tap().maxDistance(TAP_SLOP).onEnd((event, success) => {
    const width = railW.value;
    if (!success || width <= 0) return;
    const previousIndex = settled.value;
    const index = nearestStop(width, event.x - CAPSULE_INSET);
    const target = knobX(width, index);
    phase.value = 0;
    catching.value = 0;
    settled.value = index;
    live.value = index;
    knob.value = reduced.value ? target : withSpring(target, SNAP_SPRING);
    shown.value = reduced.value ? 1 : withTiming(1, APPEAR);
    if (index !== previousIndex) runOnJS(preview)(index);
    runOnJS(commit)(index);
  }), [catching, commit, live, knob, phase, preview, railW, reduced, settled, shown]);
  const dialGesture = useMemo(() => Gesture.Race(pan, tap), [pan, tap]);

  // Springs may overshoot; the rail's ends stay hard stops.
  // The fill runs to the far edge of the thumb, so the thumb always sits on energy.
  const fillStyle = useAnimatedStyle(() => ({ opacity: shown.value, width: clamp(knob.value, EDGE, railW.value - EDGE) + THUMB_SIZE / 2 }));
  const headColor = () => {
    'worklet';
    const progress = clamp((knob.value - EDGE) / Math.max(1, railW.value - EDGE * 2), 0, 1);
    return interpolateColor(progress, SPECTRUM, [TEAL, INDIGO, VIOLET, GOLD]);
  };
  const thumbStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    borderColor: headColor(),
    transform: [{ translateX: clamp(knob.value, EDGE, railW.value - EDGE) - THUMB_SIZE / 2 }, { scale: 0.72 + 0.28 * shown.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: shown.value * (0.2 + 0.3 * energized.value),
    backgroundColor: headColor(),
    transform: [{ translateX: clamp(knob.value, EDGE, railW.value - EDGE) - HALO / 2 }, { scale: 1 + 0.1 * energized.value }],
  }));
  // Outside a drag the pulse is invisible and its animation is cancelled, so a resting dial costs nothing.
  const bandStyle = useAnimatedStyle(() => ({
    opacity: energized.value * 0.9,
    transform: [{ translateX: -BAND + flow.value * (clamp(knob.value, EDGE, railW.value - EDGE) + BAND) }],
  }));
  const twinkleA = useAnimatedStyle(() => ({ opacity: 0.5 + 0.4 * energized.value * Math.sin(flow.value * Math.PI * 4) }));
  const twinkleB = useAnimatedStyle(() => ({ opacity: 0.5 - 0.4 * energized.value * Math.sin(flow.value * Math.PI * 4 + 1.2) }));

  const labelsByStop = [labels.instant, labels.medium, labels.high];
  // Two star groups twinkle out of phase with each other.
  const starGroups = useMemo(() => [0, 1].map(group => cosmos.stars.filter((_, index) => index % 2 === group).map(([x, y, size]) => (
    <View key={`${x}`} style={{ position: 'absolute', left: x * railWidth - size / 2, top: y * RAIL_HEIGHT - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFFFFF' }} />
  ))), [railWidth]);
  const labelIndex = previewIndex ?? stopIndex;
  const onAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    const step = event.nativeEvent.actionName === 'increment' ? 1 : event.nativeEvent.actionName === 'decrement' ? -1 : 0;
    const next = STOPS[clamp(stopIndex + step, 0, LAST_STOP)];
    if (step && next !== valueRef.current) onChangeRef.current(next);
  }, [stopIndex]);

  return <View style={{ width: '100%', alignItems: 'center', paddingHorizontal: 28 }}>
    <Text accessibilityLiveRegion="polite" style={{ color: HUD.text, fontFamily: 'Inter_300Light', fontSize: 22, lineHeight: 28, marginBottom: 18, textAlign: 'center' }}>
      {labelIndex >= 0 ? <><Text style={{ color: STOP_COLORS[labelIndex] }}>{labelsByStop[labelIndex]}</Text>{` ${labels.effort}`}</> : <Text style={{ color: HUD.muted }}>{labels.chooseEffort}</Text>}
    </Text>
    <GestureDetector gesture={dialGesture}>
      <View
        accessible
        testID="reasoning-effort-dial"
        accessibilityRole="adjustable"
        accessibilityLabel={stopIndex >= 0 ? `${labels.chooseEffort}, ${labelsByStop[stopIndex]} ${labels.effort}` : labels.chooseEffort}
        accessibilityValue={stopIndex >= 0 ? { min: 0, max: LAST_STOP, now: stopIndex, text: `${labelsByStop[stopIndex]} ${labels.effort}` } : undefined}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
        onLayout={onCapsuleLayout}
        style={{ width: '100%', maxWidth: 440, height: CAPSULE_HEIGHT, borderRadius: CAPSULE_HEIGHT / 2, backgroundColor: HUD.capsule, borderWidth: 0.5, borderColor: HUD.border, padding: CAPSULE_INSET - 0.5 }}
      >
        <View pointerEvents="none" style={{ height: RAIL_HEIGHT, borderRadius: RAIL_HEIGHT / 2, backgroundColor: HUD.rail, overflow: 'hidden' }}>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, height: RAIL_HEIGHT, borderRadius: RAIL_HEIGHT / 2, overflow: 'hidden' }, fillStyle]}>
            <Svg width={railWidth} height={RAIL_HEIGHT}>
              <Defs>
                <LinearGradient id="energy" x1="0" y1="0" x2="1" y2="0">
                  {SPECTRUM.map((offset, index) => <Stop key={offset} offset={offset} stopColor={cosmos.energy[index]} />)}
                </LinearGradient>
                <LinearGradient id="depth" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset={0} stopColor="#FFFFFF" stopOpacity={0.2} />
                  <Stop offset={0.5} stopColor="#FFFFFF" stopOpacity={0} />
                  <Stop offset={1} stopColor="#0B0C1A" stopOpacity={0.3} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={railWidth} height={RAIL_HEIGHT} fill="url(#energy)" />
              <Rect x={0} y={0} width={railWidth} height={RAIL_HEIGHT} fill="url(#depth)" />
            </Svg>
            <Animated.View style={[{ position: 'absolute', inset: 0 }, twinkleA]}>{starGroups[0]}</Animated.View>
            <Animated.View style={[{ position: 'absolute', inset: 0 }, twinkleB]}>{starGroups[1]}</Animated.View>
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: BAND, height: RAIL_HEIGHT }, bandStyle]}>
              <Svg width={BAND} height={RAIL_HEIGHT}>
                <Defs>
                  <LinearGradient id="pulse" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset={0} stopColor="#FFFFFF" stopOpacity={0} />
                    <Stop offset={0.5} stopColor="#FFFFFF" stopOpacity={0.42} />
                    <Stop offset={1} stopColor="#FFFFFF" stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={BAND} height={RAIL_HEIGHT} fill="url(#pulse)" />
              </Svg>
            </Animated.View>
          </Animated.View>
          {STOPS.map((stop, index) => <View key={stop} style={{ position: 'absolute', left: knobX(railWidth, index) - DOT_SIZE / 2, top: (RAIL_HEIGHT - DOT_SIZE) / 2, width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: HUD.dot }} />)}
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: HALO, height: HALO, borderRadius: HALO / 2 }, haloStyle]} />
          <Animated.View style={[{ position: 'absolute', left: 0, top: THUMB_INSET, width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2, backgroundColor: HUD.thumb, borderWidth: 3, shadowColor: '#000000', shadowOpacity: 0.22, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 }, thumbStyle]} />
        </View>
      </View>
    </GestureDetector>
  </View>;
}
