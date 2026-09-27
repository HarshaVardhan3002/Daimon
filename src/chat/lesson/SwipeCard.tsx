import React from 'react';
import { Text } from 'react-native';
import { type } from '../../design/tokens';
import { usePalette } from '../../design/useTheme';
import { useStrings } from '../../i18n/strings';
import type { LessonCard, CardProgress, CardAction } from '../../learning/deck';
import { CardFrame } from './shared';

/** A true-or-false statement. The deck's swipe is the answer: right for true, left for false. */
export function SwipeCard({ card, progress }: { card: Extract<LessonCard, { kind: 'swipe' }>; progress: CardProgress; onAction: (action: CardAction) => void; seed: string }) {
  const c = usePalette(); const t = useStrings().lesson;
  return <CardFrame>
    <Text style={{ color: c.text, ...type.title, textAlign: 'center' }}>{card.statement}</Text>
    {progress.answered ? <Text accessibilityLiveRegion="polite" style={{ color: progress.correct ? c.success : c.danger, ...type.helper, textAlign: 'center', marginTop: 12 }}>{`${progress.correct ? t.correct : t.notQuite}. ${card.why}`}</Text> : null}
  </CardFrame>;
}
