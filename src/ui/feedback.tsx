import React, { useEffect, useState } from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, interpolateColor, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { motion } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { PressableScale } from './PressableScale';

/** Toggle switch: the thumb grows and slides with a spring; on uses the text colour like the reference. */
export function Switch({ value, onValueChange, label, disabled }: { value: boolean; onValueChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  const c = usePalette();
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => { progress.value = withSpring(value ? 1 : 0, motion.snappy); }, [progress, value]);
  const trackStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.value, [0, 1], [c.raised, c.text]), borderColor: interpolateColor(progress.value, [0, 1], [c.faint, c.text]) }), [c]);
  const thumbStyle = useAnimatedStyle(() => {
    const size = 18 + progress.value * 6;
    return { width: size, height: size, borderRadius: size / 2, backgroundColor: interpolateColor(progress.value, [0, 1], [c.faint, c.canvas]), transform: [{ translateX: 5 + progress.value * 15 }] };
  }, [c]);
  return <PressableScale accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }} disabled={disabled} scaleTo={0.94} haptic="selection" onPress={() => onValueChange(!value)} hitSlop={8}>
    <Animated.View style={[{ width: 52, height: 32, borderRadius: 16, borderWidth: 2, justifyContent: 'center', opacity: disabled ? 0.4 : 1 }, trackStyle]}>
      <Animated.View style={thumbStyle} />
    </Animated.View>
  </PressableScale>;
}

/** A breathing dot: the reference's "working on it" signal before any text arrives. */
export function PulseDot({ size = 12 }: { size?: number }) {
  const c = usePalette();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 620, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 620, easing: Easing.inOut(Easing.sin) })), -1);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.72 + pulse.value * 0.36 }], opacity: 0.75 + pulse.value * 0.25 }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.text }, style]} />;
}

/**
 * Text with a light band sweeping across it ("Thinking"). A canvas-coloured veil dims the text everywhere except a
 * moving window, which works on any background because the veil matches the canvas.
 */
export function ShimmerText({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  const c = usePalette();
  const [width, setWidth] = useState(0);
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1);
    return () => cancelAnimation(sweep);
  }, [sweep]);
  const veil = c.canvas + 'A6';
  const veilStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -width * 1.5 + sweep.value * width * 2 }] }), [width]);
  return <View style={{ alignSelf: 'flex-start', overflow: 'hidden' }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <Text style={[{ color: c.text }, style]}>{children}</Text>
    {width ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: width * 2.5, experimental_backgroundImage: `linear-gradient(90deg, ${veil} 0%, ${veil} 30%, transparent 45%, transparent 55%, ${veil} 70%, ${veil} 100%)` }, veilStyle]} /> : null}
  </View>;
}
