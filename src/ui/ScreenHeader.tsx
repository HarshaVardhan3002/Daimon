import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { useScreenStrings } from '../i18n/screens';
import { IconButton } from './IconButton';
import { Icon } from './icons';

type Props = { title: string; onBack: () => void; onSave?: () => void; canSave?: boolean };

export function ScreenHeader({ title, onBack, onSave, canSave = false }: Props) {
  const c = usePalette(); const t = useScreenStrings(); const insets = useSafeAreaInsets();
  return <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: c.canvas }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <IconButton size={44} label={t.common.back} variant="surface" onPress={onBack}><Icon name="arrow-left" color={c.text} /></IconButton>
      <Text accessibilityRole="header" style={{ ...type.heading, color: c.text, textAlign: 'center', flex: 1 }}>{title}</Text>
      {onSave ? <IconButton size={44} label={t.common.save} variant={canSave ? 'accent' : 'surface'} disabled={!canSave} onPress={onSave}>
        <Icon name="check" color={canSave ? c.onAccent : c.faint} />
      </IconButton> : <View style={{ width: 44 }} />}
    </View>
  </View>;
}
