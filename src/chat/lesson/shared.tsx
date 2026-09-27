import React, { useEffect } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { HIT, motion, radius, type } from '../../design/tokens';
import { usePalette } from '../../design/useTheme';
import { PressableScale } from '../../ui/PressableScale';

export function CardFrame({ children }: { children: React.ReactNode }) {
  return <View style={{ width: '100%', gap: 10 }}>{children}</View>;
}

export function CardText({ children, style, role }: { children: React.ReactNode; style?: object; role?: 'header' }) {
  const c = usePalette();
  return <Text accessibilityRole={role} style={[{ color: c.text, ...type.body, flexShrink: 1 }, style]}>{children}</Text>;
}

export function ChoiceButton({ label, onPress, disabled = false, selected = false, tone = 'normal', accessibilityLabel }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  tone?: 'normal' | 'success' | 'danger';
  accessibilityLabel?: string;
}) {
  const c = usePalette();
  const color = tone === 'success' ? c.success : tone === 'danger' ? c.danger : c.accent;
  return <PressableScale
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled, selected }}
    disabled={disabled}
    scaleTo={1}
    haptic="selection"
    onPress={onPress}
    style={{ minHeight: HIT, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.row, borderWidth: 1, borderColor: tone !== 'normal' ? color : selected ? c.accent : c.line, backgroundColor: tone !== 'normal' ? `${color}18` : selected ? c.selected : c.raised, justifyContent: 'center', opacity: disabled ? 0.72 : 1 } as ViewStyle}
  >{/* Hyphenate long compounds (German) instead of breaking them mid-word in narrow chips. */}<Text android_hyphenationFrequency="full" style={{ color: tone === 'normal' ? c.text : color, ...type.labelRegular }}>{label}</Text></PressableScale>;
}

export function FeedbackText({ children }: { children: React.ReactNode }) {
  const c = usePalette();
  return <Text accessibilityLiveRegion="polite" style={{ color: c.muted, ...type.helper, marginTop: 12 }}>{children}</Text>;
}

export function FadeDangerOutline({ active, children }: { active: boolean; children: React.ReactNode }) {
  const c = usePalette(); const reduced = useReducedMotion(); const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => { progress.value = reduced ? (active ? 1 : 0) : withTiming(active ? 1 : 0, { duration: motion.quick, easing: motion.standard }); }, [active, progress, reduced]);
  const style = useAnimatedStyle(() => ({ borderColor: interpolateColor(progress.value, [0, 1], [c.line, c.danger]) }));
  return <Animated.View style={[{ borderRadius: radius.row, borderWidth: 1 }, style]}>{children}</Animated.View>;
}
