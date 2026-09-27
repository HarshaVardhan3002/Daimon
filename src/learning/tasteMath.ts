import type { LessonCard } from './deck';

export const LEARNING_KINDS = ['idea', 'flip', 'mcq', 'swipe', 'cloze', 'order', 'match'] as const;
export type LearningKind = LessonCard['kind'];
export type TasteStats = { more: number; less: number; shown: number; completed: number; correct: number; meanMs: number };
export type TasteProfile = Record<LearningKind, TasteStats>;
export type TasteEvent = { type: 'shown' } | { type: 'completed'; correct: boolean; ms: number } | { type: 'feedback'; signal: 'more' | 'less' };

export function emptyTaste(): TasteProfile {
  return Object.fromEntries(LEARNING_KINDS.map(kind => [kind, { more: 0, less: 0, shown: 0, completed: 0, correct: 0, meanMs: 0 }])) as TasteProfile;
}

export function reduceTaste(profile: TasteProfile, kind: LearningKind, event: TasteEvent): TasteProfile {
  const previous = profile[kind];
  let next = { ...previous };
  if (event.type === 'shown') next.shown += 1;
  if (event.type === 'feedback') next[event.signal] += 1;
  if (event.type === 'completed') {
    const ms = Number.isFinite(event.ms) ? Math.max(0, Math.min(event.ms, 86_400_000)) : 0;
    next.completed += 1;
    next.correct += Number(event.correct);
    next.meanMs += (ms - next.meanMs) / next.completed;
  }
  return { ...profile, [kind]: next };
}

/** Explicit preference dominates; completion and accuracy supply modest, smoothed signals.
 * Speed is descriptive only: slower reading must not count as a dislike. */
export function tasteWeights(profile: TasteProfile): Record<LearningKind, number> {
  const values = LEARNING_KINDS.map(kind => {
    const stats = profile[kind];
    const explicit = (stats.more - stats.less) / (stats.more + stats.less + 2);
    const completion = (Math.min(stats.completed, stats.shown) + 1) / (stats.shown + 2);
    const accuracy = (stats.correct + 1) / (stats.completed + 2);
    return Math.exp(1.5 * explicit + 0.3 * (completion - 0.5) + 0.2 * (accuracy - 0.5));
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(LEARNING_KINDS.map((kind, index) => [kind, values[index] / total])) as Record<LearningKind, number>;
}

export function decodeTaste(value: unknown): TasteProfile {
  const result = emptyTaste();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const kind of LEARNING_KINDS) {
    const stats = (value as Record<string, unknown>)[kind];
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) continue;
    for (const key of ['more', 'less', 'shown', 'completed', 'correct', 'meanMs'] as const) {
      const number = (stats as Record<string, unknown>)[key];
      if (typeof number === 'number' && Number.isFinite(number) && number >= 0) result[kind][key] = key === 'meanMs' ? Math.min(number, 86_400_000) : Math.min(Math.floor(number), 1_000_000_000);
    }
    result[kind].correct = Math.min(result[kind].correct, result[kind].completed);
  }
  return result;
}
