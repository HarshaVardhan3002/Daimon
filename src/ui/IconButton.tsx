import React, { forwardRef } from 'react';
import type { StyleProp, View, ViewStyle } from 'react-native';
import { HIT } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { PressableScale, type PressableScaleProps } from './PressableScale';

type Variant = 'plain' | 'surface' | 'accent' | 'inverse';
type Props = Omit<PressableScaleProps, 'style' | 'children'> & {
  /** Visible circle diameter; the touch target is at least 44. */
  size?: number;
  variant?: Variant;
  label: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Circular icon control. Visible size and hit area are independent so small glyphs stay easy to hit. */
export const IconButton = forwardRef<View, Props>(function IconButton({ size = 40, variant = 'plain', label, children, style, disabled, hitSlop, ...rest }, ref) {
  const c = usePalette();
  const background = variant === 'surface' ? c.surface : variant === 'accent' ? c.accent : variant === 'inverse' ? c.text : 'transparent';
  const slop = hitSlop ?? Math.max(0, (HIT - size) / 2);
  return <PressableScale ref={ref} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} hitSlop={slop} scaleTo={0.9} highlight={variant === 'plain' ? c.raised : undefined} {...rest}
    style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: background, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }, style]}>
    {children}
  </PressableScale>;
});
