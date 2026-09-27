import React from 'react';
import { Text, View } from 'react-native';
import { type } from '../../design/tokens';
import { usePalette } from '../../design/useTheme';
import { useStrings } from '../../i18n/strings';
import { seededShuffle, type LessonCard, type CardProgress, type CardAction } from '../../learning/deck';
import { CardFrame, ChoiceButton, FeedbackText } from './shared';

export function ClozeCard({ card, progress, onAction, seed }: { card: Extract<LessonCard, { kind: 'cloze' }>; progress: CardProgress; onAction: (action: CardAction) => void; seed: string }) {
  const c = usePalette(); const t = useStrings().lesson;
  const choices = seededShuffle([card.answer, ...card.distractors], `${seed}:${card.id}:cloze`);
  const selected = progress.selected === undefined ? undefined : [card.answer, ...card.distractors][progress.selected];
  const gapBefore = card.before && !/\s$/.test(card.before) ? ' ' : '';
  const gapAfter = card.after && !/^[\s,.;:!?)]/.test(card.after) ? ' ' : '';
  return <CardFrame>
    <Text accessibilityLiveRegion="polite" accessibilityLabel={`${card.before}${gapBefore}${selected ?? t.blank}${gapAfter}${card.after}`} style={{ color: c.text, ...type.body }}>
      {card.before}{gapBefore}<Text style={{ color: progress.answered && progress.correct ? c.success : c.accent, ...type.bodyMedium, textDecorationLine: selected ? 'none' : 'underline' }}>{selected ?? '________'}</Text>{gapAfter}{card.after}
    </Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
      {choices.map((choice, visibleIndex) => {
        const canonicalIndex = [card.answer, ...card.distractors].indexOf(choice);
        const isSelected = canonicalIndex === progress.selected;
        const isAnswer = canonicalIndex === 0;
        return <ChoiceButton key={`${canonicalIndex}:${choice}`} label={choice} onPress={() => onAction({ type: 'answer', index: canonicalIndex })} disabled={progress.answered} selected={isSelected} tone={progress.answered && isAnswer ? 'success' : progress.answered && isSelected ? 'danger' : 'normal'} accessibilityLabel={`${t.option(visibleIndex + 1)}: ${choice}`} />;
      })}
    </View>
    {progress.answered ? <FeedbackText>{progress.correct ? t.correct : `${t.notQuite} ${card.answer}`}</FeedbackText> : null}
  </CardFrame>;
}
