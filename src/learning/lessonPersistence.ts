// @ts-ignore Node's built-in TypeScript loader requires the explicit .ts extension in tests.
import { arrangeDeck, validateCardProgress, validateLessonDeck } from './deck.ts';
// @ts-ignore Node's built-in TypeScript loader requires the explicit .ts extension in tests.
import type { CardProgress, LessonCard, LessonDeck } from './deck.ts';

export type LessonFeedback = Partial<Record<LessonCard['kind'], 'more' | 'less'>>;
export type PersistedLesson = {
  type: 'lesson';
  deck: LessonDeck;
  order: number[];
  index: number;
  progress: Record<string, CardProgress>;
  completed: boolean;
  feedback: LessonFeedback;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function createPersistedLesson(deck: LessonDeck, seed: string): PersistedLesson {
  return { type: 'lesson', deck, order: arrangeDeck(deck.cards, seed), index: 0, progress: {}, completed: false, feedback: {} };
}

/** Rebuild lesson data from persisted JSON. Invalid progress entries and feedback are discarded. */
export function decodePersistedLesson(value: unknown): PersistedLesson | undefined {
  if (!record(value) || value.type !== 'lesson' || !Number.isInteger(value.index) || typeof value.completed !== 'boolean' || !record(value.progress)) return undefined;
  const checked = validateLessonDeck(value.deck);
  if (!checked.ok || !Array.isArray(value.order) || value.order.length !== checked.deck.cards.length
    || !value.order.every(item => Number.isInteger(item) && (item as number) >= 0 && (item as number) < checked.deck.cards.length)
    || new Set(value.order).size !== checked.deck.cards.length || (value.index as number) < 0 || (value.index as number) >= checked.deck.cards.length) return undefined;

  const progressEntries: Array<[string, CardProgress]> = [];
  for (const [cardId, candidate] of Object.entries(value.progress)) {
    const card = checked.deck.cards.find(item => item.id === cardId);
    if (!card) continue;
    const valid = validateCardProgress(card, candidate);
    if (valid) progressEntries.push([cardId, valid]);
  }
  const progress = Object.fromEntries(progressEntries) as Record<string, CardProgress>;
  const feedback: LessonFeedback = {};
  if (record(value.feedback)) {
    for (const kind of ['idea', 'flip', 'mcq', 'swipe', 'cloze', 'order', 'match'] as const) {
      if (value.feedback[kind] === 'more' || value.feedback[kind] === 'less') feedback[kind] = value.feedback[kind];
    }
  }
  const everyCardAnswered = checked.deck.cards.every(card => Object.hasOwn(progress, card.id) && progress[card.id].answered === true);
  return {
    type: 'lesson', deck: checked.deck, order: [...value.order] as number[], index: value.index as number,
    progress, completed: value.completed && everyCardAnswered, feedback,
  };
}
