import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { cosmos, HIT, radius, type } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { useStrings } from '../i18n/strings';
import { initialCardProgress, reduceCardProgress } from '../learning/deck';
import type { CardAction, CardProgress, LessonCard } from '../learning/deck';
import { recordTasteCompleted, recordTasteFeedback, recordTasteShown } from '../learning/taste';
import { track } from '../telemetry/telemetry';
import { Icon } from '../ui/icons';
import { PressableScale, haptic } from '../ui/PressableScale';
import type { PersistedRichContent } from './richReply';
import { IdeaCard, FlipCard, McqCard, SwipeCard, ClozeCard, OrderCard, MatchCard } from './lesson';

type Lesson = Extract<PersistedRichContent, { type: 'lesson' }>;
type Props = { turnId: string; lesson: Lesson; onChange: (update: (lesson: Lesson) => Lesson) => void };
const savedProgress = (progress: Record<string, CardProgress>, id: string): CardProgress | undefined => Object.hasOwn(progress, id) ? progress[id] : undefined;

function Card({ card, ...props }: { card: LessonCard; progress: CardProgress; seed: string; onAction: (action: CardAction) => void }) {
  switch (card.kind) {
    case 'idea': return <IdeaCard card={card} {...props} />;
    case 'flip': return <FlipCard card={card} {...props} />;
    case 'mcq': return <McqCard card={card} {...props} />;
    case 'swipe': return <SwipeCard card={card} {...props} />;
    case 'cloze': return <ClozeCard card={card} {...props} />;
    case 'order': return <OrderCard card={card} {...props} />;
    case 'match': return <MatchCard card={card} {...props} />;
  }
}

export function LessonDeck({ turnId, lesson, onChange }: Props) {
  const c = usePalette(); const t = useStrings().lesson;
  const [review, setReview] = useState<{ indices: number[]; cursor: number; progress: Record<string, CardProgress> } | null>(null);
  const [revisiting, setRevisiting] = useState(false);
  const shownAt = useRef<Record<string, number>>(Object.create(null));
  const latest = useRef(lesson); latest.current = lesson;
  const index = review ? review.indices[review.cursor] : lesson.index;
  const card = lesson.deck.cards[lesson.order[index]];
  const summary = lesson.completed && !review && !revisiting;
  const progress = savedProgress(review ? review.progress : lesson.progress, card.id) ?? initialCardProgress(card);
  const save = (update: (value: Lesson) => Lesson) => {
    latest.current = update(latest.current);
    onChange(update);
  };

  useEffect(() => {
    if (summary) return;
    shownAt.current[card.id] = Date.now();
    if (!savedProgress(latest.current.progress, card.id)?.shown) {
      const previous = savedProgress(latest.current.progress, card.id) ?? initialCardProgress(card);
      track('learn', { deck: turnId, format: card.kind, action: 'shown', index });
      recordTasteShown(card.kind);
      save(value => ({ ...value, progress: { ...value.progress, [card.id]: reduceCardProgress(card, previous, { type: 'shown' }) } }));
    }
    // Revisit timing restarts, but the persisted shown marker prevents double counting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, summary, Boolean(review), turnId]);

  const action = (event: CardAction) => {
    const previous = savedProgress(review ? review.progress : latest.current.progress, card.id) ?? initialCardProgress(card);
    const reduced = reduceCardProgress(card, previous, event);
    if (reduced === previous) return;
    const ms = Math.max(0, Date.now() - (shownAt.current[card.id] ?? Date.now()));
    const next = !previous.answered && reduced.answered ? { ...reduced, elapsedMs: Math.min(ms, 86_400_000) } : reduced;
    const correct = event.type === 'order' ? event.index === (previous.order?.length ?? 0)
      : event.type === 'match' ? event.left === event.right : next.correct;
    const telemetryAction = event.type === 'flip' ? 'flip' : event.type === 'swipe' ? 'swipe' : event.type === 'reveal' ? 'reveal' : 'answer';
    if (event.type !== 'shown') track('learn', { deck: turnId, format: card.kind, action: telemetryAction, ...(correct === undefined ? {} : { correct }), ms, index });
    if (review) setReview({ ...review, progress: { ...review.progress, [card.id]: next } });
    else {
      if (!previous.answered && next.answered) recordTasteCompleted(card.kind, next.correct === true, ms);
      save(value => ({ ...value, progress: { ...value.progress, [card.id]: next } }));
    }
  };

  const next = () => {
    haptic('selection');
    if (card.kind === 'idea' && !progress.answered) action({ type: 'selfGrade', correct: true });
    if (review) {
      if (review.cursor + 1 < review.indices.length) setReview({ ...review, cursor: review.cursor + 1 });
      else setReview(null);
      return;
    }
    if (latest.current.completed) { setRevisiting(false); return; }
    const current = latest.current;
    const remaining = current.order.findIndex(cardIndex => !savedProgress(current.progress, current.deck.cards[cardIndex].id)?.answered);
    if (remaining < 0) {
      save(value => ({ ...value, completed: true }));
      setRevisiting(false);
      track('learn', { deck: turnId, format: 'deck', action: 'done', ms: Object.values(current.progress).reduce((total, item) => total + (item.elapsedMs ?? 0), 0) });
    } else save(value => ({ ...value, index: remaining }));
  };

  const kinds = [...new Set(lesson.deck.cards.map(item => item.kind))];
  const scored = lesson.deck.cards.filter(item => item.kind !== 'idea');
  const score = scored.filter(item => savedProgress(lesson.progress, item.id)?.correct).length;
  const missed = lesson.order.flatMap((cardIndex, position) => {
    const item = lesson.deck.cards[cardIndex];
    return item.kind !== 'idea' && savedProgress(lesson.progress, item.id)?.correct === false ? [position] : [];
  });
  const feedback = (kind: LessonCard['kind'], signal: 'more' | 'less') => {
    if (latest.current.feedback[kind] === signal) return;
    haptic('selection');
    save(value => ({ ...value, feedback: { ...value.feedback, [kind]: signal } }));
    recordTasteFeedback(kind, signal);
    track('learn_feedback', { deck: turnId, format: kind, signal });
  };
  const button = { minHeight: HIT, borderRadius: radius.chip, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center' as const, backgroundColor: c.raised };

  return <View style={{ marginTop: 16, gap: 8 }}>
    <Text accessibilityRole="header" style={{ ...type.heading, color: c.text }}>{lesson.deck.title}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
      {lesson.order.map((cardIndex, position) => {
        const done = savedProgress(lesson.progress, lesson.deck.cards[cardIndex].id)?.answered === true;
        return <PressableScale key={lesson.deck.cards[cardIndex].id} scaleTo={1} disabled={!done || Boolean(review)} accessibilityRole="button" accessibilityLabel={`${t.cardPosition(position + 1, lesson.order.length)}${done ? `, ${t.completed}` : ''}`} accessibilityState={{ disabled: !done || Boolean(review), selected: !summary && position === index }} onPress={() => { haptic('selection'); save(value => ({ ...value, index: position })); setRevisiting(latest.current.completed); }} style={{ minWidth: HIT, minHeight: HIT, alignItems: 'center', justifyContent: 'center', borderBottomWidth: !summary && position === index ? 1 : 0, borderColor: c.accent }}>
          <Icon name="star" size={done ? 13 : 9} color={done ? cosmos.energy[position % cosmos.energy.length] : c.faint} />
        </PressableScale>;
      })}
    </ScrollView>
    <View style={{ padding: 18, gap: 18, borderRadius: radius.card, backgroundColor: c.surface, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth }}>
      {summary ? <>
        <Text accessibilityLiveRegion="polite" accessibilityRole="header" style={{ ...type.title, color: c.text }}>{scored.length ? t.score(score, scored.length) : t.deckFinished}</Text>
        {scored.length ? <Text style={{ ...type.helper, color: c.muted }}>{t.deckFinished}</Text> : null}
        {kinds.map(kind => <View key={kind} style={{ gap: 8 }}>
          <Text style={{ ...type.label, color: c.text }}>{t.kind[kind]}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['more', 'less'] as const).map(signal => <PressableScale key={signal} scaleTo={1} accessibilityRole="button" accessibilityLabel={`${signal === 'more' ? t.more : t.less}: ${t.kind[kind]}`} accessibilityState={{ selected: lesson.feedback[kind] === signal }} onPress={() => feedback(kind, signal)} style={[button, { borderWidth: 1, borderColor: lesson.feedback[kind] === signal ? c.accent : c.line }]}>
              <Text style={{ ...type.helper, color: lesson.feedback[kind] === signal ? c.accent : c.muted }}>{signal === 'more' ? t.more : t.less}</Text>
            </PressableScale>)}
          </View>
        </View>)}
        {missed.length ? <PressableScale scaleTo={1} accessibilityRole="button" onPress={() => { haptic('selection'); setReview({ indices: missed, cursor: 0, progress: {} }); }} style={button}><Text style={{ ...type.label, color: c.text }}>{t.reviewMissed}</Text></PressableScale> : null}
      </> : <>
        <Text style={{ ...type.caption, color: c.muted }}>{review ? t.reviewMissed : t.cardPosition(index + 1, lesson.order.length)}</Text>
        <Card key={`${card.id}:${review ? 'review' : 'lesson'}`} card={card} progress={progress} seed={`${turnId}:${card.id}`} onAction={action} />
        {progress.answered || card.kind === 'idea' ? <PressableScale scaleTo={1} accessibilityRole="button" onPress={next} style={[button, { alignSelf: 'flex-end' }]}>
          <Text style={{ ...type.label, color: c.text }}>{review && review.cursor === review.indices.length - 1 ? t.reviewDone : lesson.completed ? t.finish : t.next}</Text>
        </PressableScale> : null}
      </>}
    </View>
  </View>;
}
