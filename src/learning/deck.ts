export type LessonCard =
  | { kind: 'idea'; id: string; title: string; body: string; anchor?: string }
  | { kind: 'flip'; id: string; front: string; back: string; confidence?: boolean }
  | { kind: 'mcq'; id: string; prompt: string; options: string[]; answerIndex: number; why?: string; confidence?: boolean }
  | { kind: 'swipe'; id: string; statement: string; isTrue: boolean; why: string }
  | { kind: 'cloze'; id: string; before: string; after: string; answer: string; distractors: string[] }
  | { kind: 'order'; id: string; prompt: string; steps: string[] }
  | { kind: 'match'; id: string; prompt: string; pairs: [string, string][] };

export type LessonDeck = { title: string; cards: LessonCard[] };
export type ConfidenceLevel = 'guess' | 'think' | 'sure';
export type CardProgress = {
  shown?: boolean;
  answered: boolean;
  elapsedMs?: number;
  correct?: boolean;
  flipped?: boolean;
  confidence?: ConfidenceLevel;
  selected?: number;
  order?: number[];
  attempts?: number;
  matched?: number[];
  revealed?: boolean;
};
export type CardAction =
  | { type: 'shown' }
  | { type: 'flip' }
  | { type: 'confidence'; value: ConfidenceLevel }
  | { type: 'answer'; index: number }
  | { type: 'selfGrade'; correct: boolean }
  | { type: 'swipe'; value: boolean }
  | { type: 'order'; index: number }
  | { type: 'reveal' }
  | { type: 'selectMatch'; index: number }
  | { type: 'match'; left: number; right: number };

const kinds = ['idea', 'flip', 'mcq', 'swipe', 'cloze', 'order', 'match'] as const;
type Kind = typeof kinds[number];

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function bounded(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= max && (allowEmpty || value.trim().length > 0);
}
function stringArray(value: unknown, min: number, max: number, limit: number): value is string[] {
  return Array.isArray(value) && value.length >= min && value.length <= max && value.every(item => bounded(item, limit));
}

function validateCard(value: unknown): LessonCard | undefined {
  if (!record(value) || !bounded(value.id, 80) || typeof value.kind !== 'string') return undefined;
  const id = value.id;
  switch (value.kind) {
    case 'idea':
      if (!bounded(value.title, 80) || !bounded(value.body, 400) || (value.anchor !== undefined && !bounded(value.anchor, 16))) return undefined;
      return { kind: 'idea', id, title: value.title, body: value.body, ...(value.anchor === undefined ? {} : { anchor: value.anchor as string }) };
    case 'flip':
      if (!bounded(value.front, 300) || !bounded(value.back, 400) || (value.confidence !== undefined && typeof value.confidence !== 'boolean')) return undefined;
      return { kind: 'flip', id, front: value.front, back: value.back, ...(value.confidence === undefined ? {} : { confidence: value.confidence }) };
    case 'mcq':
      if (!bounded(value.prompt, 300) || !stringArray(value.options, 2, 5, 160) || new Set(value.options).size !== value.options.length
        || !Number.isInteger(value.answerIndex) || (value.answerIndex as number) < 0 || (value.answerIndex as number) >= value.options.length
        || (value.why !== undefined && !bounded(value.why, 400)) || (value.confidence !== undefined && typeof value.confidence !== 'boolean')) return undefined;
      return { kind: 'mcq', id, prompt: value.prompt, options: [...value.options], answerIndex: value.answerIndex as number,
        ...(value.why === undefined ? {} : { why: value.why as string }), ...(value.confidence === undefined ? {} : { confidence: value.confidence }) };
    case 'swipe':
      if (!bounded(value.statement, 300) || typeof value.isTrue !== 'boolean' || !bounded(value.why, 400)) return undefined;
      return { kind: 'swipe', id, statement: value.statement, isTrue: value.isTrue, why: value.why };
    case 'cloze':
      if (!bounded(value.before, 300, true) || !bounded(value.after, 300, true) || !bounded(value.answer, 40)
        || !stringArray(value.distractors, 2, 3, 160) || value.distractors.includes(value.answer) || new Set(value.distractors).size !== value.distractors.length) return undefined;
      return { kind: 'cloze', id, before: value.before, after: value.after, answer: value.answer, distractors: [...value.distractors] };
    case 'order':
      if (!bounded(value.prompt, 300) || !stringArray(value.steps, 3, 6, 160) || new Set(value.steps).size !== value.steps.length) return undefined;
      return { kind: 'order', id, prompt: value.prompt, steps: [...value.steps] };
    case 'match':
      if (!bounded(value.prompt, 300) || !Array.isArray(value.pairs) || value.pairs.length < 3 || value.pairs.length > 5
        || !value.pairs.every(pair => Array.isArray(pair) && pair.length === 2 && bounded(pair[0], 60) && bounded(pair[1], 60))
        || new Set(value.pairs.map(pair => pair[0])).size !== value.pairs.length || new Set(value.pairs.map(pair => pair[1])).size !== value.pairs.length) return undefined;
      return { kind: 'match', id, prompt: value.prompt, pairs: value.pairs.map(pair => [pair[0], pair[1]]) };
    default: return undefined;
  }
}

export function validateLessonDeck(value: unknown): { ok: true; deck: LessonDeck } | { ok: false; error: string } {
  if (!record(value) || !bounded(value.title, 80) || !Array.isArray(value.cards) || value.cards.length < 3 || value.cards.length > 14) {
    return { ok: false, error: 'A lesson deck needs a title and 3 to 14 cards.' };
  }
  const cards: LessonCard[] = [];
  const ids = new Set<string>();
  for (const candidate of value.cards) {
    const card = validateCard(candidate);
    if (!card) return { ok: false, error: 'A lesson card is invalid.' };
    if (ids.has(card.id)) return { ok: false, error: 'Lesson card ids must be unique.' };
    ids.add(card.id);
    cards.push(card);
  }
  return { ok: true, deck: { title: value.title, cards } };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function randomFor(seed: string): () => number {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; };
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  const random = randomFor(seed);
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function arrangeDeck(cards: readonly LessonCard[], seed: string): number[] {
  const randomRank = new Map(seededShuffle(cards.map((_, index) => index), seed).map((index, rank) => [index, rank]));
  const remaining = new Set(cards.map((_, index) => index));
  const result: number[] = [];
  const idea = cards.findIndex(card => card.kind === 'idea');
  const finishers = new Set(cards.flatMap((card, index) => card.kind === 'swipe' || card.kind === 'flip' ? [index] : []));
  if (idea >= 0) { result.push(idea); remaining.delete(idea); }
  let activeRun = 0;
  while (remaining.size) {
    const candidates = [...remaining];
    const lastKind = result.length ? cards[result[result.length - 1]].kind : undefined;
    const avoidRepeat = candidates.filter(index => cards[index].kind !== lastKind);
    let pool = avoidRepeat.length ? avoidRepeat : candidates;
    if (activeRun >= 3) {
      const ideas = pool.filter(index => cards[index].kind === 'idea');
      if (ideas.length) pool = ideas;
    }
    // Preserve a single remaining finisher; retaining every finisher can starve mixed kinds.
    if (remaining.size > 1) {
      const remainingFinishers = [...remaining].filter(index => finishers.has(index));
      if (remainingFinishers.length === 1 && pool.includes(remainingFinishers[0])) {
        const otherChoices = pool.filter(index => index !== remainingFinishers[0]);
        if (otherChoices.length) pool = otherChoices;
      }
    } else {
      const finalizers = pool.filter(index => finishers.has(index));
      if (finalizers.length) pool = finalizers;
    }
    pool.sort((a, b) => (randomRank.get(a) ?? a) - (randomRank.get(b) ?? b));
    const selected = pool[0];
    result.push(selected);
    remaining.delete(selected);
    activeRun = cards[selected].kind === 'idea' ? 0 : activeRun + 1;
  }
  return result;
}

export function initialCardProgress(card: LessonCard): CardProgress {
  return { answered: false, ...(card.kind === 'order' ? { order: [], attempts: 0 } : {}), ...(card.kind === 'match' ? { matched: [] } : {}) };
}

export function reduceCardProgress(card: LessonCard, progress: CardProgress, action: CardAction): CardProgress {
  if (action.type === 'shown') return progress.shown ? progress : { ...progress, shown: true };
  if (progress.answered) return progress;
  if (action.type === 'confidence' && card.kind === 'mcq' && card.confidence === true && progress.selected !== undefined && progress.confidence === undefined) {
    return { ...progress, confidence: action.value, answered: true, correct: progress.selected === card.answerIndex };
  }
  if (action.type === 'confidence' && card.kind === 'flip' && card.confidence === true && progress.flipped && progress.confidence === undefined) return { ...progress, confidence: action.value };
  if (action.type === 'flip' && card.kind === 'flip' && !progress.flipped) return { ...progress, flipped: true };
  if (action.type === 'selfGrade' && (card.kind === 'idea' || (card.kind === 'flip' && progress.flipped && (card.confidence !== true || progress.confidence !== undefined)))) return { ...progress, answered: true, correct: action.correct };
  if (action.type === 'answer' && card.kind === 'mcq' && progress.selected === undefined && Number.isInteger(action.index) && action.index >= 0 && action.index < card.options.length) {
    const needsConfidence = card.confidence === true && progress.confidence === undefined;
    return { ...progress, selected: action.index, answered: !needsConfidence, ...(needsConfidence ? {} : { correct: action.index === card.answerIndex }) };
  }
  if (action.type === 'swipe' && card.kind === 'swipe') return { ...progress, selected: action.value ? 1 : 0, answered: true, correct: action.value === card.isTrue };
  if (action.type === 'answer' && card.kind === 'cloze' && Number.isInteger(action.index) && action.index >= 0 && action.index <= card.distractors.length) {
    return { ...progress, selected: action.index, answered: true, correct: action.index === 0 };
  }
  if (action.type === 'order' && card.kind === 'order' && Number.isInteger(action.index) && action.index >= 0 && action.index < card.steps.length && !progress.answered) {
    const order = [...(progress.order ?? [])];
    if (order.includes(action.index)) return progress;
    if (action.index !== order.length) return { ...progress, attempts: (progress.attempts ?? 0) + 1 };
    order.push(action.index);
    const answered = order.length === card.steps.length;
    return { ...progress, order, answered, ...(answered ? { correct: (progress.attempts ?? 0) === 0 } : {}) };
  }
  if (action.type === 'reveal' && card.kind === 'order' && (progress.attempts ?? 0) >= 2) return { ...progress, answered: true, correct: false, revealed: true };
  if (action.type === 'selectMatch' && card.kind === 'match' && Number.isInteger(action.index) && action.index >= 0 && action.index < card.pairs.length && !(progress.matched ?? []).includes(action.index)) {
    return progress.selected === action.index ? progress : { ...progress, selected: action.index };
  }
  if (action.type === 'match' && card.kind === 'match' && Number.isInteger(action.left) && Number.isInteger(action.right)
    && action.left >= 0 && action.left < card.pairs.length && action.right >= 0 && action.right < card.pairs.length && !progress.answered
    && progress.selected === action.left) {
    if ((progress.matched ?? []).includes(action.left) || (progress.matched ?? []).includes(action.right)) return progress;
    if (action.left !== action.right) return { ...progress, selected: undefined, attempts: (progress.attempts ?? 0) + 1 };
    const matched = [...(progress.matched ?? []), action.left];
    const answered = matched.length === card.pairs.length;
    return { ...progress, selected: undefined, matched, answered, ...(answered ? { correct: (progress.attempts ?? 0) === 0 } : {}) };
  }
  return progress;
}

export function validateCardProgress(card: LessonCard, value: unknown): CardProgress | undefined {
  if (!record(value) || typeof value.answered !== 'boolean') return undefined;
  const result: CardProgress = { answered: value.answered };
  if (value.shown !== undefined) { if (typeof value.shown !== 'boolean') return undefined; result.shown = value.shown; }
  if (value.elapsedMs !== undefined) { if (typeof value.elapsedMs !== 'number' || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0 || value.elapsedMs > 86_400_000) return undefined; result.elapsedMs = value.elapsedMs; }
  if (value.correct !== undefined) { if (typeof value.correct !== 'boolean') return undefined; result.correct = value.correct; }
  if (value.confidence !== undefined) {
    if (!((card.kind === 'mcq' || card.kind === 'flip') && card.confidence === true) || !['guess', 'think', 'sure'].includes(value.confidence as string)) return undefined;
    result.confidence = value.confidence as ConfidenceLevel;
  }
  if (value.attempts !== undefined) { if (!Number.isInteger(value.attempts) || (value.attempts as number) < 0 || (value.attempts as number) > 1000) return undefined; result.attempts = value.attempts as number; }
  if (value.flipped !== undefined) { if (card.kind !== 'flip' || typeof value.flipped !== 'boolean') return undefined; result.flipped = value.flipped; }
  if (value.revealed !== undefined) { if (card.kind !== 'order' || typeof value.revealed !== 'boolean') return undefined; result.revealed = value.revealed; }
  if (value.selected !== undefined) {
    const length = card.kind === 'mcq' ? card.options.length : card.kind === 'cloze' ? card.distractors.length + 1 : card.kind === 'swipe' ? 2 : card.kind === 'match' ? card.pairs.length : 0;
    if (!length || !Number.isInteger(value.selected) || (value.selected as number) < 0 || (value.selected as number) >= length) return undefined;
    result.selected = value.selected as number;
  }
  if (value.order !== undefined) {
    if (card.kind !== 'order' || !Array.isArray(value.order) || value.order.length > card.steps.length || !value.order.every(item => Number.isInteger(item) && (item as number) >= 0 && (item as number) < card.steps.length) || new Set(value.order).size !== value.order.length) return undefined;
    result.order = [...value.order] as number[];
  }
  if (value.matched !== undefined) {
    if (card.kind !== 'match' || !Array.isArray(value.matched) || value.matched.length > card.pairs.length || !value.matched.every(item => Number.isInteger(item) && (item as number) >= 0 && (item as number) < card.pairs.length) || new Set(value.matched).size !== value.matched.length) return undefined;
    result.matched = [...value.matched] as number[];
  }
  if (card.kind !== 'order' && (result.order !== undefined || result.attempts !== undefined && card.kind !== 'match')) return undefined;
  if (card.kind !== 'match' && result.matched !== undefined) return undefined;
  if (result.correct !== undefined && !result.answered) return undefined;
  switch (card.kind) {
    case 'idea':
      if (result.selected !== undefined || result.flipped !== undefined || result.order !== undefined || result.matched !== undefined) return undefined;
      if (result.answered !== (result.correct !== undefined)) return undefined;
      break;
    case 'flip':
      if (result.selected !== undefined || result.order !== undefined || result.matched !== undefined || result.revealed !== undefined) return undefined;
      if (result.answered && (!result.flipped || result.correct === undefined)) return undefined;
      if (result.confidence !== undefined && !result.flipped) return undefined;
      if (result.answered && card.confidence === true && result.confidence === undefined) return undefined;
      if (!result.answered && result.correct !== undefined) return undefined;
      break;
    case 'mcq':
      if (result.flipped !== undefined || result.order !== undefined || result.matched !== undefined || result.revealed !== undefined || result.selected === undefined && (result.answered || result.confidence !== undefined)) return undefined;
      if (result.confidence !== undefined && result.selected === undefined) return undefined;
      if (result.answered) {
        if (card.confidence === true && result.confidence === undefined) return undefined;
        if (result.correct !== (result.selected === card.answerIndex)) return undefined;
      } else if (result.correct !== undefined || result.confidence !== undefined || (result.selected !== undefined && card.confidence !== true)) return undefined;
      break;
    case 'swipe':
      if (result.flipped !== undefined || result.confidence !== undefined || result.order !== undefined || result.matched !== undefined || result.revealed !== undefined) return undefined;
      if (result.answered) {
        if (result.selected === undefined || result.correct !== ((result.selected === 1) === card.isTrue)) return undefined;
      } else if (result.selected !== undefined || result.correct !== undefined) return undefined;
      break;
    case 'cloze':
      if (result.flipped !== undefined || result.confidence !== undefined || result.order !== undefined || result.matched !== undefined || result.revealed !== undefined) return undefined;
      if (result.answered ? result.selected === undefined || result.correct !== (result.selected === 0) : result.selected !== undefined || result.correct !== undefined) return undefined;
      break;
    case 'order': {
      if (result.selected !== undefined || result.matched !== undefined || result.flipped !== undefined || result.confidence !== undefined) return undefined;
      const order = result.order ?? [];
      if (order.some((step, index) => step !== index)) return undefined;
      if (result.revealed && ((result.attempts ?? 0) < 2 || !result.answered || result.correct !== false)) return undefined;
      if (result.answered && !result.revealed && order.length !== card.steps.length) return undefined;
      if (!result.answered && (result.correct !== undefined || order.length === card.steps.length)) return undefined;
      if (result.answered && !result.revealed && result.correct !== ((result.attempts ?? 0) === 0)) return undefined;
      break;
    }
    case 'match': {
      if (result.order !== undefined || result.revealed !== undefined || result.flipped !== undefined || result.confidence !== undefined) return undefined;
      const matched = result.matched ?? [];
      if (result.selected !== undefined && (result.answered || matched.includes(result.selected))) return undefined;
      if (result.answered !== (matched.length === card.pairs.length)) return undefined;
      if (result.answered && result.correct !== ((result.attempts ?? 0) === 0)) return undefined;
      if (!result.answered && result.correct !== undefined) return undefined;
      break;
    }
  }
  return result;
}
