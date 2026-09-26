import React from 'react';
import { View } from 'react-native';
import { themes } from '../design/theme';
import type { ThemeMode } from '../design/theme';
import type { ReasoningMode } from './reasoningEffort';

type Props = { mode: ReasoningMode; theme: ThemeMode };

// Geometry measured from the ChatGPT composer reference: a 24dp gauge with 2dp strokes,
// a 270° arc open at the bottom, a ring hub and a short needle.
const SIZE = 24;
const STROKE = 2;
const ARC_RADIUS = (SIZE - STROKE) / 2;
const HUB = 7;
const NEEDLE_TIP = 8;
const NEEDLE_BASE = 2.5;
// High matches the reference (needle and violet arc end at +45°).
const NEEDLE_ANGLE = { instant: -45, medium: 0, high: 45 } as const;

const colorsFor = (theme: ThemeMode) => theme === 'dark'
  ? { fill: '#C8A4FB', track: themes.dark.raised, needle: themes.dark.text, idle: themes.dark.muted }
  : { fill: themes.light.accent, track: '#CFCFCB', needle: themes.light.text, idle: themes.light.muted };

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
  const colors = colorsFor(theme);
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
