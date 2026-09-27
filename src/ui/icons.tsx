import { Feather } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { motion } from '../design/tokens';

export type FeatherName = React.ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 20, color }: { name: FeatherName; size?: number; color: string }) {
  return <Feather name={name} size={size} color={color} />;
}

/** ChatGPT's menu glyph: two lines, the lower one shorter. */
export function MenuGlyph({ size = 22, color }: { size?: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 8.5h16M4 15.5h10" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>;
}

/** New chat: a rounded square with a pencil. */
export function ComposeGlyph({ size = 21, color }: { size?: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M11 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    <Path d="M17.6 3.6a1.9 1.9 0 0 1 2.8 2.8L12.7 14.1 9 15l.9-3.7 7.7-7.7Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
  </Svg>;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LENGTH = 16;

/** Copy glyph that draws a check mark over itself while `done` is set. */
export function CopyCheck({ done, size = 18, color }: { done: boolean; size?: number; color: string }) {
  const progress = useSharedValue(done ? 1 : 0);
  useEffect(() => { progress.value = done ? withTiming(1, { duration: 260, easing: motion.enter }) : withTiming(0, { duration: 140 }); }, [done, progress]);
  const copyStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value, transform: [{ scale: 1 - progress.value * 0.4 }] }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value * 3) }));
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LENGTH * (1 - progress.value) }));
  return <View style={{ width: size, height: size }}>
    <Animated.View style={[{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }, copyStyle]}><Feather name="copy" size={size - 1} color={color} /></Animated.View>
    <Animated.View style={[{ position: 'absolute', inset: 0 }, checkStyle]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <AnimatedPath d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={CHECK_LENGTH + 4} animatedProps={checkProps} />
      </Svg>
    </Animated.View>
  </View>;
}

/** Cross-fades and rotates between two glyphs; used for plus → close and play → stop. */
export function SwapIcon({ active, from, to, rotate = 90, size = 20, color }: { active: boolean; from: React.ReactNode; to: React.ReactNode; rotate?: number; size?: number; color?: string }) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => { progress.value = withSpring(active ? 1 : 0, motion.snappy); }, [active, progress]);
  const fromStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value, transform: [{ rotate: `${progress.value * rotate}deg` }, { scale: 1 - progress.value * 0.3 }] }));
  const toStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ rotate: `${(progress.value - 1) * rotate}deg` }, { scale: 0.7 + progress.value * 0.3 }] }));
  void color;
  return <View style={{ width: size, height: size }}>
    <Animated.View style={[{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }, fromStyle]}>{from}</Animated.View>
    <Animated.View style={[{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }, toStyle]}>{to}</Animated.View>
  </View>;
}
