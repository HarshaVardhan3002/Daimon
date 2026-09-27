import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { HIT, motion, radius, type } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { useStrings, type Strings } from '../i18n/strings';
import { initialCardProgress, reduceCardProgress } from '../learning/deck';
import type { CardAction, CardProgress, LessonCard } from '../learning/deck';
import { recordTasteCompleted, recordTasteFeedback, recordTasteShown } from '../learning/taste';
import { track } from '../telemetry/telemetry';
import { Icon, type FeatherName } from '../ui/icons';
import { PressableScale, haptic } from '../ui/PressableScale';
import type { PersistedRichContent } from './richReply';
import { ClozeCard, FlipCard, IdeaCard, MatchCard, McqCard, OrderCard, SwipeCard } from './lesson';

type Lesson = Extract<PersistedRichContent, { type: 'lesson' }>;
type Props = { turnId: string; lesson: Lesson; onChange: (update: (lesson: Lesson) => Lesson) => void };
type Direction = 'left' | 'right';
type LessonStrings = Strings['lesson'];
/** What a swipe does on the top card: answers it (binary), moves on (continue), or nothing yet (locked). */
type Meaning = { mode: 'binary'; left: string; right: string } | { mode: 'continue' } | { mode: 'locked'; hint: string };
type TopHandle = { fling: (direction: Direction) => void };

// The stack: each card behind peeks out below the one in front and is a little narrower.
const PEEK = 10;
const STACK_PAD = PEEK * 2;
const DEPTH_SCALE = 0.045;
// A drag past this share of the width, or a fling, sends the card away. A locked card only gives a little.
const COMMIT = 0.28;
const COMMIT_VELOCITY = 800;
const LOCKED_PULL = 0.16;
const TILT = 8;
const FLY_MS = 220;
const FLIP_MS = 320;
const SETTLE = { duration: 200, easing: motion.standard };

const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, value));
};
const savedProgress = (progress: Record<string, CardProgress>, id: string): CardProgress | undefined => Object.hasOwn(progress, id) ? progress[id] : undefined;

function meaningFor(card: LessonCard, progress: CardProgress, t: LessonStrings): Meaning {
  if (card.kind === 'swipe' && !progress.answered) return { mode: 'binary', left: t.false, right: t.true };
  if (card.kind === 'flip' && !progress.answered) {
    if (!progress.flipped) return { mode: 'locked', hint: t.flipFirst };
    if (card.confidence && progress.confidence === undefined) return { mode: 'locked', hint: t.howSure };
    return { mode: 'binary', left: t.notYet, right: t.knewIt };
  }
  if (card.kind === 'idea' || progress.answered) return { mode: 'continue' };
  return { mode: 'locked', hint: t.answerFirst };
}

function CardFace({ card, turn, ...props }: { card: LessonCard; progress: CardProgress; seed: string; onAction: (action: CardAction) => void; turn?: SharedValue<number> }) {
  switch (card.kind) {
    case 'idea': return <IdeaCard card={card} {...props} />;
    case 'flip': return <FlipCard card={card} turn={turn} {...props} />;
    case 'mcq': return <McqCard card={card} {...props} />;
    case 'swipe': return <SwipeCard card={card} {...props} />;
    case 'cloze': return <ClozeCard card={card} {...props} />;
    case 'order': return <OrderCard card={card} {...props} />;
    case 'match': return <MatchCard card={card} {...props} />;
  }
}

/** One card: its surface, a quiet header (kind and position) and the face. Flashcards turn over as a whole. */
function CardSurface({ card, progress, seed, onAction, position, total, minHeight, bare = false }: { card: LessonCard; progress: CardProgress; seed: string; onAction: (action: CardAction) => void; position: number; total: number; minHeight: number; bare?: boolean }) {
  const c = usePalette(); const t = useStrings().lesson; const reduced = useReducedMotion();
  const flipped = card.kind === 'flip' && Boolean(progress.flipped);
  const turn = useSharedValue(flipped ? 1 : 0);
  useEffect(() => {
    turn.value = reduced ? (flipped ? 1 : 0) : withTiming(flipped ? 1 : 0, { duration: FLIP_MS, easing: motion.standard });
  }, [flipped, reduced, turn]);
  // Two half-turns (0→90°, then −90→0°) so the back never reads mirrored.
  const turnStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 1000 }, { rotateY: `${turn.value < 0.5 ? turn.value * 180 : (turn.value - 1) * 180}deg` }] }));
  const centered = card.kind === 'flip' || card.kind === 'swipe';
  // Inside a waiting plate the surface is bare: the plate draws it, laid out exactly as it will be on top.
  return <Animated.View style={[{ minHeight, padding: 20, gap: 14 }, bare ? null : { borderRadius: radius.card, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }, turnStyle]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ ...type.caption, color: c.muted }}>{t.kind[card.kind]}</Text>
      <Text accessibilityLabel={t.cardPosition(position, total)} style={{ ...type.caption, color: c.faint }}>{`${position} / ${total}`}</Text>
    </View>
    <View style={{ flex: 1, justifyContent: centered ? 'center' : 'flex-start', paddingBottom: centered ? 18 : 0 }}>
      <CardFace card={card} progress={progress} seed={seed} onAction={onAction} turn={turn} />
    </View>
  </Animated.View>;
}

/** A card waiting in the stack. It moves up toward the front as the top card is dragged away. */
function Plate({ depth, drag, children }: { depth: 1 | 2; drag: SharedValue<number>; children?: React.ReactNode }) {
  const c = usePalette();
  const style = useAnimatedStyle(() => {
    const d = depth - drag.value;
    return { transform: [{ translateY: PEEK * d }, { scale: 1 - DEPTH_SCALE * d }] };
  });
  // Deeper cards sit further back in the dark (or the dawn light).
  const veil = useAnimatedStyle(() => ({ opacity: 0.28 * clamp(depth - drag.value, 0, 2) }));
  return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: STACK_PAD, borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, transformOrigin: 'bottom' }, style]}>
    {children}
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.canvas }, veil]} />
  </Animated.View>;
}

function Cue({ label, color }: { label: string; color: string }) {
  const c = usePalette();
  return <View style={{ borderRadius: radius.pill, borderWidth: 1.5, borderColor: color, backgroundColor: c.surface, paddingHorizontal: 12, paddingVertical: 5 }}>
    <Text style={{ ...type.label, fontSize: 14, color }}>{label}</Text>
  </View>;
}

type TopCardProps = { meaning: Meaning; width: SharedValue<number>; drag: SharedValue<number>; reduced: boolean; onCommit: (direction: Direction) => boolean; children: React.ReactNode };

/** The card on top of the stack: it follows the finger, tilts a little, and flies off when released far enough. */
const TopCard = forwardRef<TopHandle, TopCardProps>(function TopCard({ meaning, width, drag, reduced, onCommit, children }, ref) {
  const c = usePalette(); const t = useStrings().lesson;
  const mode = meaning.mode;
  const x = useSharedValue(0);
  const flying = useSharedValue(false);
  const armed = useSharedValue(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const finish = useCallback((direction: Direction) => {
    if (commitRef.current(direction)) return;
    // Nothing to commit after all (the card changed underneath): bring it back.
    flying.value = false;
    x.value = withTiming(0, SETTLE);
    drag.value = withTiming(0, SETTLE);
  }, [drag, flying, x]);
  const flyTo = useCallback((direction: Direction) => {
    'worklet';
    flying.value = true;
    drag.value = withTiming(1, { duration: FLY_MS });
    x.value = withTiming((direction === 'right' ? 1 : -1) * Math.max(width.value, 320) * 1.4, { duration: reduced ? 1 : FLY_MS, easing: motion.leave }, done => {
      if (done) runOnJS(finish)(direction);
    });
  }, [drag, finish, flying, reduced, width, x]);
  useImperativeHandle(ref, () => ({ fling: direction => { if (!flying.value && mode !== 'locked') flyTo(direction); } }), [flyTo, flying, mode]);

  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-10, 10])
    .onStart(() => { armed.value = false; })
    .onUpdate(event => {
      if (flying.value) return;
      if (mode === 'locked') { x.value = event.translationX * LOCKED_PULL; return; }
      x.value = event.translationX;
      const progress = clamp(Math.abs(event.translationX) / Math.max(1, width.value * COMMIT), 0, 1);
      drag.value = progress;
      const past = progress >= 1;
      if (past !== armed.value) { armed.value = past; if (past) runOnJS(haptic)('selection'); }
    })
    .onEnd(event => {
      if (flying.value) return;
      const far = Math.abs(event.translationX) > width.value * COMMIT;
      const flung = Math.abs(event.velocityX) > COMMIT_VELOCITY && Math.sign(event.velocityX) === Math.sign(event.translationX);
      if (mode !== 'locked' && (far || flung)) { flyTo(event.translationX > 0 ? 'right' : 'left'); return; }
      x.value = withTiming(0, SETTLE);
      drag.value = withTiming(0, SETTLE);
    })
    .onFinalize(() => {
      if (flying.value || (x.value === 0 && drag.value === 0)) return;
      x.value = withTiming(0, SETTLE);
      drag.value = withTiming(0, SETTLE);
    }), [armed, drag, flyTo, flying, mode, width, x]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${reduced ? 0 : clamp(x.value / Math.max(1, width.value) * TILT * 2, -TILT, TILT)}deg` }],
  }), [reduced]);
  const toward = (sign: 1 | -1) => {
    'worklet';
    return mode === 'locked' ? 0 : clamp(sign * x.value / Math.max(1, width.value * COMMIT), 0, 1);
  };
  const rightCue = useAnimatedStyle(() => ({ opacity: toward(1) }), [mode]);
  const leftCue = useAnimatedStyle(() => ({ opacity: toward(-1) }), [mode]);
  const rightTint = useAnimatedStyle(() => ({ opacity: 0.1 * toward(1) }), [mode]);
  const leftTint = useAnimatedStyle(() => ({ opacity: 0.1 * toward(-1) }), [mode]);
  const binary = meaning.mode === 'binary';
  const rightColor = binary ? c.success : c.accent;
  const leftColor = binary ? c.danger : c.accent;
  return <GestureDetector gesture={pan}>
    <Animated.View style={cardStyle}>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius.card, backgroundColor: rightColor }, rightTint]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius.card, backgroundColor: leftColor }, leftTint]} />
      {/* Like a stamp on the side the card is leaving from. */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 14, left: 14 }, rightCue]}><Cue label={binary ? meaning.right : t.next} color={rightColor} /></Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 14, right: 14 }, leftCue]}><Cue label={binary ? meaning.left : t.next} color={leftColor} /></Animated.View>
    </Animated.View>
  </GestureDetector>;
});

/** Progress as soft dots; the current card is a capsule that glides between positions. */
const DOT = { width: { current: 18, done: 6, pending: 6 }, opacity: { current: 1, done: 0.85, pending: 0.28 } } as const;

function PagerDot({ state }: { state: 'done' | 'current' | 'pending' }) {
  const c = usePalette(); const reduced = useReducedMotion();
  const width = useSharedValue<number>(DOT.width[state]);
  const opacity = useSharedValue<number>(DOT.opacity[state]);
  useEffect(() => {
    const timing = { duration: motion.local, easing: motion.standard };
    width.value = reduced ? DOT.width[state] : withTiming(DOT.width[state], timing);
    opacity.value = reduced ? DOT.opacity[state] : withTiming(DOT.opacity[state], timing);
  }, [opacity, reduced, state, width]);
  const style = useAnimatedStyle(() => ({ width: width.value, opacity: opacity.value }));
  return <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: c.accent }, style]} />;
}

function StackButton({ icon, color, label, onPress }: { icon: FeatherName; color: string; label: string; onPress: () => void }) {
  const c = usePalette();
  return <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.97} style={{ flex: 1, minHeight: HIT + 4, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
    <Icon name={icon} size={18} color={color} />
    <Text style={{ ...type.label, color: c.text }}>{label}</Text>
  </PressableScale>;
}

export function LessonDeck({ turnId, lesson, onChange }: Props) {
  const c = usePalette(); const t = useStrings().lesson; const reduced = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const minCard = Math.round(clamp(windowHeight * 0.42, 300, 380));
  const [review, setReview] = useState<{ indices: number[]; cursor: number; progress: Record<string, CardProgress> } | null>(null);
  const [revisiting, setRevisiting] = useState(false);
  const [verdict, setVerdict] = useState<{ key: number; correct: boolean; text: string } | null>(null);
  const width = useSharedValue(0);
  const drag = useSharedValue(0);
  const topRef = useRef<TopHandle>(null);
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
  // The new top card lands where the one behind it was; the rest of the stack settles back into place.
  useEffect(() => { drag.value = reduced ? 0 : withTiming(0, SETTLE); }, [card.id, drag, reduced, review?.cursor, summary]);

  const action = (event: CardAction) => {
    const previous = savedProgress(review ? review.progress : latest.current.progress, card.id) ?? initialCardProgress(card);
    const updated = reduceCardProgress(card, previous, event);
    if (updated === previous) return;
    const ms = Math.max(0, Date.now() - (shownAt.current[card.id] ?? Date.now()));
    const next = !previous.answered && updated.answered ? { ...updated, elapsedMs: Math.min(ms, 86_400_000) } : updated;
    const correct = event.type === 'order' ? event.index === (previous.order?.length ?? 0)
      : event.type === 'match' ? event.left === event.right : next.correct;
    const telemetryAction = event.type === 'flip' ? 'flip' : event.type === 'swipe' ? 'swipe' : event.type === 'reveal' ? 'reveal' : 'answer';
    if (event.type !== 'shown') track('learn', { deck: turnId, format: card.kind, action: telemetryAction, ...(correct === undefined ? {} : { correct }), ms, index });
    if (review) setReview(current => current && { ...current, progress: { ...current.progress, [card.id]: next } });
    else {
      if (!previous.answered && next.answered) recordTasteCompleted(card.kind, next.correct === true, ms);
      save(value => ({ ...value, progress: { ...value.progress, [card.id]: next } }));
    }
  };

  const next = () => {
    if (card.kind === 'idea' && !progress.answered) action({ type: 'selfGrade', correct: true });
    if (review) {
      setReview(current => !current ? current : current.cursor + 1 < current.indices.length ? { ...current, cursor: current.cursor + 1 } : null);
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

  const meaning = meaningFor(card, progress, t);
  /** Runs when the top card has flown off. Returns false when there was nothing to commit. */
  const commit = (direction: Direction): boolean => {
    if (summary || meaning.mode === 'locked') return false;
    haptic('light');
    if (card.kind === 'swipe' && !progress.answered) {
      const value = direction === 'right';
      action({ type: 'swipe', value });
      setVerdict(current => ({ key: (current?.key ?? 0) + 1, correct: value === card.isTrue, text: card.why }));
    } else {
      if (card.kind === 'flip' && !progress.answered) action({ type: 'selfGrade', correct: direction === 'right' });
      setVerdict(null);
    }
    next();
    return true;
  };

  // The cards the next swipes will bring up, in the order `next` picks them.
  const upcoming = summary ? [] : review
    ? review.indices.slice(review.cursor + 1, review.cursor + 3)
    : lesson.completed ? [] : lesson.order.map((_, position) => position)
      .filter(position => position !== index && !savedProgress(lesson.progress, lesson.deck.cards[lesson.order[position]].id)?.answered)
      .slice(0, 2);
  const upcomingCard = upcoming.length ? lesson.deck.cards[lesson.order[upcoming[0]]] : undefined;

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
  const chip = { minHeight: HIT, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' as const, backgroundColor: c.raised };

  return <View style={{ marginTop: 16, gap: 12 }}>
    <Text accessibilityRole="header" style={{ ...type.heading, color: c.text }}>{lesson.deck.title}</Text>
    <View accessibilityLabel={summary ? t.deckFinished : t.cardPosition(index + 1, lesson.order.length)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 12 }}>
      {lesson.order.map((cardIndex, position) => {
        const done = savedProgress(lesson.progress, lesson.deck.cards[cardIndex].id)?.answered === true;
        return <PagerDot key={lesson.deck.cards[cardIndex].id} state={!summary && position === index ? 'current' : done ? 'done' : 'pending'} />;
      })}
    </View>

    {summary ? <View style={{ padding: 20, gap: 18, borderRadius: radius.card, backgroundColor: c.surface, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth }}>
      <Text accessibilityLiveRegion="polite" accessibilityRole="header" style={{ ...type.title, color: c.text }}>{scored.length ? t.score(score, scored.length) : t.deckFinished}</Text>
      {scored.length ? <Text style={{ ...type.helper, color: c.muted }}>{t.deckFinished}</Text> : null}
      {kinds.map(kind => <View key={kind} style={{ gap: 8 }}>
        <Text style={{ ...type.label, color: c.text }}>{t.kind[kind]}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['more', 'less'] as const).map(signal => <PressableScale key={signal} scaleTo={0.97} accessibilityRole="button" accessibilityLabel={`${signal === 'more' ? t.more : t.less}: ${t.kind[kind]}`} accessibilityState={{ selected: lesson.feedback[kind] === signal }} onPress={() => feedback(kind, signal)} style={[chip, { borderWidth: 1, borderColor: lesson.feedback[kind] === signal ? c.accent : c.line }]}>
            <Text style={{ ...type.helper, color: lesson.feedback[kind] === signal ? c.accent : c.muted }}>{signal === 'more' ? t.more : t.less}</Text>
          </PressableScale>)}
        </View>
      </View>)}
      {missed.length ? <PressableScale scaleTo={0.97} accessibilityRole="button" onPress={() => { haptic('selection'); setVerdict(null); setReview({ indices: missed, cursor: 0, progress: {} }); }} style={chip}><Text style={{ ...type.label, color: c.text }}>{t.reviewMissed}</Text></PressableScale> : null}
    </View> : <>
      <View onLayout={event => { width.value = event.nativeEvent.layout.width; }} style={{ paddingBottom: STACK_PAD }}>
        {upcoming.length > 1 ? <Plate depth={2} drag={drag} /> : null}
        {upcomingCard ? <Plate depth={1} drag={drag}>
          <CardSurface card={upcomingCard} progress={savedProgress(review ? review.progress : lesson.progress, upcomingCard.id) ?? initialCardProgress(upcomingCard)} seed={`${turnId}:${upcomingCard.id}`} onAction={() => undefined} position={upcoming[0] + 1} total={lesson.order.length} minHeight={minCard} bare />
        </Plate> : null}
        <TopCard key={`${card.id}:${review ? 'review' : 'lesson'}`} ref={topRef} meaning={meaning} width={width} drag={drag} reduced={reduced} onCommit={commit}>
          <CardSurface card={card} progress={progress} seed={`${turnId}:${card.id}`} onAction={action} position={index + 1} total={lesson.order.length} minHeight={minCard} />
        </TopCard>
      </View>
      {verdict ? <Animated.View key={verdict.key} entering={reduced ? undefined : FadeIn.duration(motion.local)} accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 6 }}>
        <Icon name={verdict.correct ? 'check' : 'x'} size={16} color={verdict.correct ? c.success : c.danger} />
        <Text style={{ ...type.helper, color: c.muted, flex: 1 }}><Text style={{ color: verdict.correct ? c.success : c.danger }}>{`${verdict.correct ? t.correct : t.notQuite}. `}</Text>{verdict.text}</Text>
      </Animated.View> : null}
      <View style={{ minHeight: HIT + 4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {meaning.mode === 'binary' ? <>
          <StackButton icon="x" color={c.danger} label={meaning.left} onPress={() => topRef.current?.fling('left')} />
          <StackButton icon="check" color={c.success} label={meaning.right} onPress={() => topRef.current?.fling('right')} />
        </> : meaning.mode === 'continue' ? <PressableScale scaleTo={0.98} accessibilityRole="button" accessibilityLabel={review && review.cursor === review.indices.length - 1 ? t.reviewDone : lesson.completed ? t.finish : t.next} onPress={() => topRef.current?.fling('left')} style={{ flex: 1, minHeight: HIT, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="chevrons-left" size={16} color={c.faint} />
          <Text style={{ ...type.helper, color: c.muted }}>{t.swipeNext}</Text>
        </PressableScale> : <Text accessibilityLiveRegion="polite" style={{ ...type.helper, color: c.faint, flex: 1, textAlign: 'center' }}>{meaning.hint}</Text>}
      </View>
    </>}
  </View>;
}
