import React from 'react';
import { Text, View } from 'react-native';
import { type } from '../../design/tokens';
import { usePalette } from '../../design/useTheme';
import type { LessonCard, CardProgress, CardAction } from '../../learning/deck';
import { CardFrame } from './shared';

export function IdeaCard({ card }: { card: Extract<LessonCard, { kind: 'idea' }>; progress: CardProgress; onAction: (action: CardAction) => void; seed: string }) {
  const c = usePalette();
  return <CardFrame><View accessibilityLiveRegion="polite">
    {card.anchor ? <Text accessibilityRole="header" style={{ ...type.display, color: c.accent, fontSize: 38, lineHeight: 46, marginBottom: 14 }}>{card.anchor}</Text> : null}
    <Text accessibilityRole="header" style={{ color: c.text, ...type.heading, marginBottom: 8 }}>{card.title}</Text>
    <Text style={{ color: c.muted, ...type.body }}>{card.body}</Text>
  </View></CardFrame>;
}
