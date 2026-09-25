import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { AccessibilityActionEvent, LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { ReasoningMode } from './reasoningEffort';

type Props = {
  value: ReasoningMode;
  onChange: (mode: ReasoningMode) => void;
  labels: { instant: string; medium: string; high: string; effort: string; chooseEffort: string };
  colors: { text: string; muted: string; faint: string; accent: string; line: string; selected: string };
  reducedMotion: boolean;
};

const STOPS: ReasoningMode[] = ['instant', 'medium', 'high'];
const THUMB_SIZE = 52;
const TRACK_HEIGHT = 52;
const CAPSULE_HEIGHT = 78;
const STOP_COUNT = 3;
const knobX = (width: number, index: number) => {
  'worklet';
  return THUMB_SIZE / 2 + Math.max(0, width - THUMB_SIZE) * index / (STOP_COUNT - 1);
};

export function ReasoningEffortDial({ value, onChange, labels, colors, reducedMotion }: Props) {
  const [width, setWidth] = useState(0);
  const trackWidth = useSharedValue(0);
  const knobPosition = useSharedValue(-THUMB_SIZE);
  const selectedStop = useSharedValue(-1);
  const interacting = useSharedValue(false);
  const reducedMotionValue = useSharedValue(reducedMotion ? 1 : 0);
  const currentMode = useRef(value);
  const onChangeRef = useRef(onChange);
  const stopIndex = value === 'default' ? -1 : STOPS.indexOf(value);

  useEffect(() => { currentMode.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { reducedMotionValue.value = reducedMotion ? 1 : 0; }, [reducedMotion, reducedMotionValue]);

  const select = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(STOP_COUNT - 1, index));
    const next = STOPS[clamped];
    if (currentMode.current !== next) void Haptics.selectionAsync().catch(() => undefined);
    currentMode.current = next;
    onChangeRef.current(next);
  }, []);

  useEffect(() => {
    if (interacting.value) return;
    selectedStop.value = stopIndex;
    const next = stopIndex < 0 ? -THUMB_SIZE : knobX(trackWidth.value, stopIndex);
    knobPosition.value = reducedMotion ? next : withTiming(next, { duration: 170 });
  }, [interacting, knobPosition, reducedMotion, selectedStop, stopIndex, trackWidth]);

  const onTrackLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setWidth(nextWidth);
    trackWidth.value = nextWidth;
    knobPosition.value = stopIndex < 0 ? -THUMB_SIZE : knobX(nextWidth, stopIndex);
  }, [knobPosition, stopIndex, trackWidth]);

  const pan = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .onBegin(event => {
      const w = trackWidth.value;
      if (w > 0) {
        interacting.value = true;
        const x = Math.max(THUMB_SIZE / 2, Math.min(w - THUMB_SIZE / 2, event.x));
        const index = Math.round((x - THUMB_SIZE / 2) / Math.max(1, w - THUMB_SIZE) * (STOP_COUNT - 1));
        selectedStop.value = index;
        runOnJS(select)(index);
      }
    })
    .onUpdate(event => {
      const w = trackWidth.value;
      if (w <= 0) return;
      const x = Math.max(THUMB_SIZE / 2, Math.min(w - THUMB_SIZE / 2, event.x));
      knobPosition.value = x;
      const index = Math.round((x - THUMB_SIZE / 2) / Math.max(1, w - THUMB_SIZE) * (STOP_COUNT - 1));
      if (selectedStop.value !== index) {
        selectedStop.value = index;
        runOnJS(select)(index);
      }
    })
    .onEnd(() => {
      const w = trackWidth.value;
      const index = selectedStop.value;
      if (w > 0 && index >= 0) {
        const target = knobX(w, index);
        knobPosition.value = reducedMotionValue.value ? target : withTiming(target, { duration: 150 });
      }
      interacting.value = false;
    })
    .onFinalize((_event, success) => {
      if (success || !interacting.value) return;
      const w = trackWidth.value;
      const index = selectedStop.value;
      if (w > 0 && index >= 0) {
        const target = knobX(w, index);
        knobPosition.value = reducedMotionValue.value ? target : withTiming(target, { duration: 150 });
      }
      interacting.value = false;
    }), [interacting, knobPosition, reducedMotionValue, select, selectedStop, trackWidth]);

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knobPosition.value - THUMB_SIZE / 2 }] }));
  const activeTrackStyle = useAnimatedStyle(() => ({ width: Math.max(0, knobPosition.value) }));
  const labelsByStop = [labels.instant, labels.medium, labels.high];
  const activeLabel = stopIndex < 0 ? labels.chooseEffort : `${labelsByStop[stopIndex]} ${labels.effort}`;
  const accessibilityActions = [
    { name: 'decrement', label: labels.instant },
    { name: 'increment', label: labels.high },
  ];
  const onAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') select(Math.min(STOP_COUNT - 1, Math.max(0, stopIndex + 1)));
    if (event.nativeEvent.actionName === 'decrement') select(Math.max(0, stopIndex - 1));
  }, [select, stopIndex]);

  return <View style={{ width: '100%', alignItems: 'center' }}>
    <Text accessibilityLiveRegion="polite" style={{ alignSelf: 'center', color: colors.text, fontFamily: 'Inter_300Light', fontSize: 25, lineHeight: 32, marginBottom: 12 }}>
      {stopIndex >= 0 ? <><Text style={{ color: colors.accent }}>{labelsByStop[stopIndex]}</Text><Text style={{ color: colors.text }}>{` ${labels.effort}`}</Text></> : <Text style={{ color: colors.muted }}>{labels.chooseEffort}</Text>}
    </Text>
    <View style={{ width: '84%', height: CAPSULE_HEIGHT, borderRadius: CAPSULE_HEIGHT / 2, backgroundColor: colors.selected, borderWidth: 1, borderColor: '#34343B', justifyContent: 'center', paddingHorizontal: 13 }}>
      <View onLayout={onTrackLayout} style={{ height: TRACK_HEIGHT, justifyContent: 'center' }}>
        <GestureDetector gesture={pan}>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={activeLabel}
            accessibilityValue={{ min: 0, max: 2, ...(stopIndex >= 0 ? { now: stopIndex } : {}), text: activeLabel }}
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={onAccessibilityAction}
            style={{ height: TRACK_HEIGHT, justifyContent: 'center' }}
          >
            <View pointerEvents="none" style={{ height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, backgroundColor: '#55555D' }} />
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, backgroundColor: colors.accent }, activeTrackStyle]} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {STOPS.map((stop, index) => <View key={stop} style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: '#FFFFFF', opacity: stopIndex === index ? 0 : 0.34 }} />)}
            </View>
            {width > 0 && stopIndex >= 0 ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2, backgroundColor: '#FFFFFF', elevation: 5, shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } }, knobStyle]} /> : null}
          </View>
        </GestureDetector>
      </View>
    </View>
  </View>;
}
