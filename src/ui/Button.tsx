import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { font, HIT, motion, radius, type as textType } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { PressableScale, type PressableScaleProps } from './PressableScale';

type Props = Omit<PressableScaleProps, 'children' | 'style'> & {
  label: string;
  accessibilityLabel?: string;
  loading?: boolean;
  variant?: 'inverse' | 'accent';
  style?: PressableScaleProps['style'];
};

export function Button({ label, accessibilityLabel, loading = false, disabled, variant = 'inverse', style, ...pressableProps }: Props) {
  const palette = usePalette();
  const background = variant === 'accent' ? palette.accent : palette.text;
  const foreground = variant === 'accent' ? palette.onAccent : palette.canvas;
  const inactive = Boolean(disabled || loading);
  return <PressableScale
    {...pressableProps}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled: inactive, busy: loading }}
    disabled={inactive}
    scaleTo={0.98}
    style={[{ minHeight: HIT + 10, borderRadius: radius.pill, backgroundColor: background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, opacity: inactive ? 0.48 : 1 }, style]}
  >
    {loading ? <Animated.View entering={FadeIn.duration(motion.quick)} style={{ minHeight: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <ActivityIndicator size="small" color={foreground} />
      <Text style={{ ...textType.label, color: foreground }}>{label}</Text>
    </Animated.View> : <Text style={{ ...textType.label, fontFamily: font.semibold, color: foreground, textAlign: 'center' }}>{label}</Text>}
  </PressableScale>;
}
