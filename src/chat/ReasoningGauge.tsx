import React from 'react';
import { View } from 'react-native';
import { cosmos, palettes as themes } from '../design/tokens';
import type { ThemeMode } from '../design/tokens';
import type { ReasoningMode } from './reasoningEffort';

type Props = { mode: ReasoningMode; theme: ThemeMode };

// A 24dp gauge with 2dp strokes,
// a 270° arc open at the bottom, a ring hub and a short needle.
const SIZE = 24;
const STROKE = 2;
const ARC_RADIUS = (SIZE - STROKE) / 2;
const HUB = 7;
const NEEDLE_TIP = 8;
const NEEDLE_BASE = 2.5;
const NEEDLE_ANGLE = { instant: -45, medium: 0, high: 45 } as const;

// Each level fills with its energy colour from the effort dial; light mode uses deeper inks of the same hues.
const LEVEL_FILL = {
  dark: { instant: cosmos.energy[0], medium: '#9A8BFB', high: cosmos.energy[3] },
  light: { instant: '#1C7C89', medium: '#4B4BC4', high: '#A2631C' },
} as const;
const colorsFor = (theme: ThemeMode, mode: Exclude<ReasoningMode, 'default'>) => theme === 'dark'
  ? { fill: LEVEL_FILL.dark[mode], track: themes.dark.raised, needle: themes.dark.text, idle: themes.dark.muted }
  : { fill: LEVEL_FILL.light[mode], track: '#D3D4DF', needle: themes.light.text, idle: themes.light.muted };

const layer = { position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE } as const;
// Each border side of a circle paints a 90° quadrant split on the diagonals, so left + top + right
// with a transparent bottom is exactly the −135°…+135° arc.
const ring = { ...layer, borderRadius: SIZE / 2, borderWidth: STROKE, borderColor: 'transparent' } as const;

function Cap({ angle, color }: { angle: number; color: string }) {
  return <View style={[layer, { transform: [{ rotate: `${angle}deg` }] }]}>
    <View style={{ position: 'absolute', left: (SIZE - STROKE) / 2, top: SIZE / 2 - ARC_RADIUS - STROKE / 2, width: STROKE, height: STROKE, borderRadius: STROKE / 2, backgroundColor: color }} />
  </View>;
}

export function ReasoningGauge({ mode, theme }: Props) {
  const colors = colorsFor(theme, mode === 'default' ? 'medium' : mode);
  const active = mode !== 'default';
  const angle = mode === 'default' ? 0 : NEEDLE_ANGLE[mode];
  const arc = active ? colors.track : colors.idle;
  const start = active ? colors.fill : arc;
  const needle = active ? colors.needle : colors.idle;
  return <View pointerEvents="none" style={{ width: SIZE, height: SIZE }}>
    <View style={[ring, { borderLeftColor: start, borderTopColor: arc, borderRightColor: arc }]} />
    {active && angle > -45 ? <View style={[ring, { borderTopColor: colors.fill, transform: [{ rotate: `${angle - 45}deg` }] }]} /> : null}
    <Cap angle={-135} color={start} />
    <Cap angle={135} color={arc} />
    {active ? <Cap angle={angle} color={colors.fill} /> : null}
    <View style={{ position: 'absolute', left: (SIZE - HUB) / 2, top: (SIZE - HUB) / 2, width: HUB, height: HUB, borderRadius: HUB / 2, borderWidth: STROKE, borderColor: needle }} />
    <View style={[layer, { transform: [{ rotate: `${angle}deg` }] }]}>
      <View style={{ position: 'absolute', left: (SIZE - STROKE) / 2, top: SIZE / 2 - NEEDLE_TIP, width: STROKE, height: NEEDLE_TIP - NEEDLE_BASE, borderRadius: STROKE / 2, backgroundColor: needle }} />
    </View>
  </View>;
}
