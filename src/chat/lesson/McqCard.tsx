import React from 'react';
import { Text, View } from 'react-native';
import { type } from '../../design/tokens';
import { usePalette } from '../../design/useTheme';
import { useStrings } from '../../i18n/strings';
import type { LessonCard, CardProgress, CardAction } from '../../learning/deck';
import { CardFrame, ChoiceButton, FeedbackText } from './shared';

export function McqCard({ card, progress, onAction }: { card: Extract<LessonCard, { kind: 'mcq' }>; progress: CardProgress; onAction: (action: CardAction) => void; seed: string }) {
  const c = usePalette(); const t = useStrings().lesson;
  const pendingConfidence = Boolean(card.confidence) && progress.selected !== undefined && !progress.answered;
  const confidenceChoices: Array<{ value: 'guess' | 'think' | 'sure'; label: string }> = [
    { value: 'guess', label: t.guess }, { value: 'think', label: t.thinkSo }, { value: 'sure', label: t.sure },
  ];
  return <CardFrame>
    <Text accessibilityRole="header" style={{ color: c.text, ...type.heading, marginBottom: 16 }}>{card.prompt}</Text>
    <View style={{ gap: 8 }}>
      {card.options.map((option, index) => {
        const isAnswer = index === card.answerIndex;
        const chosen = index === progress.selected;
        const tone = progress.answered && isAnswer ? 'success' : progress.answered && chosen ? 'danger' : 'normal';
        return <ChoiceButton key={`${index}:${option}`} label={option} onPress={() => onAction({ type: 'answer', index })} disabled={progress.answered || pendingConfidence} selected={chosen} tone={tone} accessibilityLabel={`${String.fromCharCode(65 + index)}. ${option}`} />;
      })}
    </View>
    {pendingConfidence ? <View style={{ marginTop: 16 }}>
      <Text style={{ color: c.muted, ...type.label, marginBottom: 8 }}>{t.howSure}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>{confidenceChoices.map(item => <View key={item.value} style={{ flex: 1 }}><ChoiceButton label={item.label} onPress={() => onAction({ type: 'confidence', value: item.value })} selected={progress.confidence === item.value} /></View>)}</View>
    </View> : null}
    {progress.answered ? <FeedbackText>{progress.correct ? t.correct : `${t.notQuite} ${card.options[card.answerIndex]}${card.why ? ` — ${card.why}` : ''}`}</FeedbackText> : null}
  </CardFrame>;
}
