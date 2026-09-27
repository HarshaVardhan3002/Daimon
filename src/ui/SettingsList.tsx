import React, { forwardRef, memo } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, type } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { Icon, type FeatherName } from './icons';
import { PressableScale } from './PressableScale';

type GroupProps = { title?: string; helper?: string; children: React.ReactNode };
type RowProps = {
  label: string; value?: string; subtitle?: string; icon?: FeatherName; danger?: boolean;
  chevron?: boolean | 'down'; onPress?: () => void; trailing?: React.ReactNode;
  first?: boolean; last?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
};

export function SettingsGroup({ title, helper, children }: GroupProps) {
  const c = usePalette();
  return <View style={{ marginBottom: 26 }}>
    {title ? <Text accessibilityRole="header" style={{ ...type.helper, color: c.muted, marginHorizontal: 14, marginBottom: 9 }}>{title}</Text> : null}
    <View style={{ gap: 3 }}>{children}</View>
    {helper ? <Text style={{ ...type.helper, color: c.muted, marginHorizontal: 14, marginTop: 10 }}>{helper}</Text> : null}
  </View>;
}

export const SettingsRow = memo(forwardRef<View, RowProps>(function SettingsRow({ label, value, subtitle, icon, danger, chevron, onPress, trailing, first = false, last = false, disabled, style }, ref) {
  const c = usePalette();
  const corners = { borderTopLeftRadius: first ? radius.card : 6, borderTopRightRadius: first ? radius.card : 6, borderBottomLeftRadius: last ? radius.card : 6, borderBottomRightRadius: last ? radius.card : 6 };
  const content = <>
    {icon ? <Icon name={icon} size={20} color={danger ? c.danger : c.text} /> : null}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ ...type.body, color: danger ? c.danger : c.text }}>{label}</Text>
      {subtitle !== undefined ? <Text style={{ ...type.helper, color: c.muted, marginTop: 3 }}>{subtitle}</Text> : null}
    </View>
    {value !== undefined ? <Text style={{ ...type.labelRegular, color: c.muted, flexShrink: 1, maxWidth: '48%', textAlign: 'right' }}>{value}</Text> : null}
    {trailing}
    {chevron ? <Icon name={chevron === 'down' ? 'chevron-down' : 'chevron-right'} size={18} color={c.muted} /> : null}
  </>;
  const rowStyle: ViewStyle = { minHeight: 56, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 };
  // Keep the surface on a wrapper: PressableScale's highlight is transparent while at rest.
  return <View style={[{ backgroundColor: c.surface, overflow: 'hidden', ...corners }, style]}>
    {onPress ? <PressableScale ref={ref} accessibilityRole="button" accessibilityLabel={[label, value, subtitle].filter(Boolean).join(', ')}
      accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} highlight={c.raised} scaleTo={0.98} style={[rowStyle, corners]}>{content}</PressableScale>
      : <View ref={ref} style={rowStyle}>{content}</View>}
  </View>;
}));
