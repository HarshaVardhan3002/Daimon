import * as Haptics from 'expo-haptics';
import React, { forwardRef, useCallback } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { motion } from '../design/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning';
export function haptic(kind: HapticKind): void {
  const run = kind === 'selection' ? Haptics.selectionAsync()
    : kind === 'success' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : kind === 'warning' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  void run.catch(() => undefined);
}

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Scale while held; 1 disables it. */
  scaleTo?: number;
  /** Background shown while held (rows and menu items). */
  highlight?: string;
  haptic?: HapticKind;
};

/** Pressable with UI-thread press feedback: a quick shrink and optional highlight that spring back on release. */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale({ style, scaleTo = 0.97, highlight, haptic: hapticKind, onPressIn, onPressOut, onPress, disabled, ...rest }, ref) {
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * pressed.value }],
    ...(highlight ? { backgroundColor: interpolateColor(pressed.value, [0, 1], ['transparent', highlight]) } : null),
  }), [scaleTo, highlight]);
  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    pressed.value = withTiming(1, { duration: motion.press / 1.4 });
    onPressIn?.(event);
  }, [onPressIn, pressed]);
  const handlePressOut = useCallback((event: GestureResponderEvent) => {
    pressed.value = withSpring(0, motion.snappy);
    onPressOut?.(event);
  }, [onPressOut, pressed]);
  const handlePress = useCallback((event: GestureResponderEvent) => {
    if (hapticKind) haptic(hapticKind);
    onPress?.(event);
  }, [hapticKind, onPress]);
  return <AnimatedPressable ref={ref} {...rest} disabled={disabled} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handlePress} style={[style, animatedStyle]} />;
});
