import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { type } from '../../design/tokens';
import { usePalette } from '../../design/useTheme';
import { useStrings } from '../../i18n/strings';
import { seededShuffle, type LessonCard, type CardProgress, type CardAction } from '../../learning/deck';
import { CardFrame, ChoiceButton, FadeDangerOutline, FeedbackText } from './shared';

export function OrderCard({ card, progress, onAction, seed }: { card: Extract<LessonCard, { kind: 'order' }>; progress: CardProgress; onAction: (action: CardAction) => void; seed: string }) {
  const c = usePalette(); const t = useStrings().lesson; const [wrong, setWrong] = useState<number | undefined>();
  const chosen = progress.order ?? [];
  const shuffled = seededShuffle(card.steps.map((step, index) => ({ step, index })), `${seed}:${card.id}:order`);
  const shownOrder = progress.revealed ? card.steps.map((_, index) => index) : chosen;
  const choose = (index: number) => {
    if (progress.answered || progress.revealed) return;
    const expected = chosen.length;
    if (index !== expected) {
      setWrong(index); setTimeout(() => setWrong(value => value === index ? undefined : value), 600);
    }
    onAction({ type: 'order', index });
  };
  return <CardFrame>
    <Text accessibilityRole="header" style={{ color: c.text, ...type.heading, marginBottom: 14 }}>{card.prompt}</Text>
    <Text style={{ color: c.muted, ...type.caption, marginBottom: 7 }}>{t.yourOrder}</Text>
    <View style={{ gap: 6, marginBottom: 14 }}>
      {shownOrder.map((index, position) => <Text key={`chosen-${index}`} style={{ color: progress.revealed ? c.success : c.text, ...type.labelRegular }}>{position + 1}. {card.steps[index]}</Text>)}
    </View>
    {!progress.revealed && !progress.answered ? <View style={{ gap: 8 }}>
      {shuffled.filter(item => !chosen.includes(item.index)).map(item => <FadeDangerOutline key={item.index} active={wrong === item.index}>
        <ChoiceButton label={item.step} onPress={() => choose(item.index)} accessibilityLabel={`${t.addStep}: ${item.step}`} />
      </FadeDangerOutline>)}
    </View> : null}
    {!progress.revealed && !progress.answered && (progress.attempts ?? 0) >= 2 ? <View style={{ marginTop: 12 }}><ChoiceButton label={t.showOrder} onPress={() => onAction({ type: 'reveal' })} /></View> : null}
    {wrong !== undefined && !progress.answered && !progress.revealed ? <FeedbackText>{t.notQuite}</FeedbackText> : null}
    {progress.revealed || progress.answered ? <FeedbackText>{progress.revealed ? t.showOrder : progress.correct ? t.correct : t.notQuite}</FeedbackText> : null}
  </CardFrame>;
}
