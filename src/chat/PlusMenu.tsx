import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { type } from '../design/tokens';
import { usePalette, useThemeMode } from '../design/useTheme';
import { useStrings } from '../i18n/strings';
import { Icon, type FeatherName } from '../ui/icons';
import { PressableScale } from '../ui/PressableScale';
import { ReasoningGauge } from './ReasoningGauge';

export const PLUS_MENU_WIDTH = 255;
const ROW_HEIGHT = 60;
const PADDING = 8;
export const PLUS_MENU_HEIGHT = ROW_HEIGHT * 4 + PADDING * 2;
export const PLUS_MENU_LEFT = 12;
export const PLUS_MENU_RADIUS = 22;

export type PlusAction = 'camera' | 'photos' | 'files' | 'think';

/** Rows of the plus menu. Also drawn (inert) inside the camera sheet so they fade within the card as it grows. */
export function PlusMenuRows({ live, interactive, thinkHarder, onSelect }: { live: boolean; interactive: boolean; thinkHarder: boolean; onSelect?: (action: PlusAction) => void }) {
  const c = usePalette(); const t = useStrings(); const mode = useThemeMode();
  const rows: { key: PlusAction; label: string; icon?: FeatherName }[] = [
    { key: 'camera', label: t.camera, icon: 'camera' },
    { key: 'photos', label: t.photos, icon: 'image' },
    { key: 'files', label: t.files, icon: 'paperclip' },
    { key: 'think', label: t.thinkHarder },
  ];
  return <View style={{ paddingVertical: PADDING }}>
    {rows.map(row => {
      const accent = row.key === 'think' && thinkHarder;
      const color = accent ? c.accent : c.text;
      return <PressableScale key={row.key} disabled={!live || !interactive} onPress={() => onSelect?.(row.key)} scaleTo={0.98} highlight={c.raised}
        accessible={live} accessibilityRole={row.key === 'think' ? 'switch' : 'button'} accessibilityLabel={row.label} accessibilityState={row.key === 'think' ? { checked: thinkHarder, disabled: !interactive } : { disabled: !interactive }}
        style={{ height: ROW_HEIGHT, marginHorizontal: 6, borderRadius: 16, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: accent ? c.accent : c.line, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}>
          {row.icon ? <Icon name={row.icon} size={19} color={color} /> : <ReasoningGauge mode={thinkHarder ? 'medium' : 'default'} theme={mode} />}
        </View>
        <Text numberOfLines={1} style={{ ...type.body, flex: 1, color }}>{row.label}</Text>
        {row.key === 'think' && thinkHarder ? <Icon name="check" size={20} color={c.accent} /> : null}
      </PressableScale>;
    })}
  </View>;
}

type Props = {
  sheetOpen: boolean;
  interactive: boolean;
  thinkHarder: boolean;
  progress: SharedValue<number>;
  originLeft: SharedValue<number>;
  originTop: SharedValue<number>;
  targetTop: SharedValue<number>;
  /** 0 → 1 while the menu hands off to the camera sheet growing out of it. */
  handoff: SharedValue<number>;
  /** 1 while the camera sheet covers the card's place; the card hides so the two never double up. */
  covering: SharedValue<number>;
  onClose: () => void;
  onSelect: (action: PlusAction) => void;
};

/** The plus menu grows out of the composer's + button into a card above it, and shrinks back into it. */
export function PlusMenu({ sheetOpen, interactive, thinkHarder, progress, originLeft, originTop, targetTop, handoff, covering, onClose, onSelect }: Props) {
  const c = usePalette(); const t = useStrings(); const mode = useThemeMode();
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * (mode === 'dark' ? 0.4 : 0.22) * (1 - handoff.value) }), [mode]);
  const cardStyle = useAnimatedStyle(() => ({
    left: interpolate(progress.value, [0, 1], [originLeft.value, PLUS_MENU_LEFT]),
    top: interpolate(progress.value, [0, 1], [originTop.value, targetTop.value]),
    width: interpolate(progress.value, [0, 1], [44, PLUS_MENU_WIDTH]),
    height: interpolate(progress.value, [0, 1], [44, PLUS_MENU_HEIGHT]),
    shadowOpacity: progress.value * 0.3 * (1 - handoff.value),
    opacity: 1 - covering.value,
  }));
  const plusStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 0.24], [1, 0], Extrapolation.CLAMP), transform: [{ rotate: `${progress.value * 45}deg` }] }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.2, 0.58], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [10, 0]) }],
  }));
  return <View pointerEvents="auto" accessibilityElementsHidden={!sheetOpen} importantForAccessibility={sheetOpen ? 'auto' : 'no-hide-descendants'} style={{ position: 'absolute', zIndex: 100, elevation: 24, inset: 0 }}>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, backgroundColor: c.scrim }, backdropStyle]} />
    <Pressable accessibilityRole="button" accessibilityLabel={t.closeAttachmentMenu} onPress={onClose} style={{ position: 'absolute', inset: 0 }} />
    <Animated.View style={[{ position: 'absolute', borderRadius: PLUS_MENU_RADIUS, backgroundColor: c.surface, shadowColor: '#000', shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }, cardStyle]}>
      <View accessibilityViewIsModal={interactive} accessibilityElementsHidden={!interactive} importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'} style={{ flex: 1, borderRadius: PLUS_MENU_RADIUS, overflow: 'hidden' }}>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }, plusStyle]}><Icon name="plus" size={23} color={c.muted} /></Animated.View>
        <Animated.View pointerEvents={interactive ? 'auto' : 'none'} style={[{ width: PLUS_MENU_WIDTH }, contentStyle]}>
          <PlusMenuRows live interactive={interactive} thinkHarder={thinkHarder} onSelect={onSelect} />
        </Animated.View>
      </View>
    </Animated.View>
  </View>;
}
