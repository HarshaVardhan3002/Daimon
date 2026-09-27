import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { type } from '../../design/tokens';
import { usePalette } from '../../design/useTheme';
import { useStrings } from '../../i18n/strings';
import { seededShuffle, type LessonCard, type CardProgress, type CardAction } from '../../learning/deck';
import { CardFrame, ChoiceButton, FadeDangerOutline, FeedbackText } from './shared';

const LONG_WORD = 13;

export function MatchCard({ card, progress, onAction, seed }: { card: Extract<LessonCard, { kind: 'match' }>; progress: CardProgress; onAction: (action: CardAction) => void; seed: string }) {
  const c = usePalette(); const t = useStrings().lesson; const [wrong, setWrong] = useState<{ left: number; right: number } | undefined>(); const [announcement, setAnnouncement] = useState<string | undefined>();
  const completed = progress.matched ?? [];
  const rightItems = seededShuffle(card.pairs.map((pair, index) => ({ label: pair[1], index })), `${seed}:${card.id}:match`);
  // A word that cannot fit a half-width chip (long German compounds) would break mid-word, so such decks use
  // full-width rows: the items first, then their matches.
  const stacked = card.pairs.some(pair => pair.some(label => label.split(/\s+/).some(word => word.length > LONG_WORD)));
  const match = (right: number) => {
    const left = progress.selected;
    if (left === undefined || progress.answered || completed.includes(left)) return;
    const wasCorrect = left === right;
    setAnnouncement(wasCorrect ? t.correct : t.notQuite);
    setTimeout(() => setAnnouncement(undefined), 850);
    if (!wasCorrect) { const pair = { left, right }; setWrong(pair); setTimeout(() => setWrong(current => current === pair ? undefined : current), 650); }
    onAction({ type: 'match', left, right });
  };
  return <CardFrame>
    <Text accessibilityRole="header" style={{ color: c.text, ...type.heading, marginBottom: 14 }}>{card.prompt}</Text>
    <View style={{ flexDirection: stacked ? 'column' : 'row', gap: stacked ? 16 : 10 }}>
      <View style={{ flex: stacked ? undefined : 1, gap: 8 }}>
        {card.pairs.map(([label], index) => <FadeDangerOutline key={`l${index}`} active={wrong?.left === index}>
          <ChoiceButton label={label} onPress={() => onAction({ type: 'selectMatch', index })} selected={progress.selected === index} disabled={completed.includes(index) || progress.answered} tone={completed.includes(index) ? 'success' : 'normal'} accessibilityLabel={`${t.matchLeft}: ${label}`} />
        </FadeDangerOutline>)}
      </View>
      <View style={{ flex: stacked ? undefined : 1, gap: 8 }}>
        {stacked ? <Text style={{ color: c.muted, ...type.helper }}>{t.matchRight}</Text> : null}
        {rightItems.map(item => <FadeDangerOutline key={`r${item.index}`} active={wrong?.right === item.index}>
          <ChoiceButton label={item.label} onPress={() => match(item.index)} disabled={completed.includes(item.index) || progress.selected === undefined || progress.answered} tone={completed.includes(item.index) ? 'success' : 'normal'} accessibilityLabel={`${t.matchRight}: ${item.label}`} />
        </FadeDangerOutline>)}
      </View>
    </View>
    {announcement && !progress.answered ? <FeedbackText>{announcement}</FeedbackText> : null}
    {progress.answered ? <FeedbackText>{progress.correct ? t.correct : t.notQuite}</FeedbackText> : null}
  </CardFrame>;
}
