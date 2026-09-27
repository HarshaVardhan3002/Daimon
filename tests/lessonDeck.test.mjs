import assert from 'node:assert/strict';
import test from 'node:test';
import {
  arrangeDeck, initialCardProgress, reduceCardProgress, seededShuffle, validateCardProgress, validateLessonDeck,
} from '../src/learning/deck.ts';
import { createPersistedLesson, decodePersistedLesson } from '../src/learning/lessonPersistence.ts';
import { previewLesson } from '../src/dev/fixtures.ts';

test('both preview languages provide valid decks with every format', () => {
  for (const locale of ['en', 'de']) {
    const result = validateLessonDeck(previewLesson(locale));
    assert.equal(result.ok, true);
    assert.equal(result.deck.cards.length, 7);
    assert.equal(new Set(result.deck.cards.map(card => card.kind)).size, 7);
  }
});

function sampleDeck() {
  return {
    title: 'Black holes',
    cards: [
      { kind: 'idea', id: 'idea', title: 'A boundary', body: 'The event horizon marks the point beyond which light cannot escape.', anchor: 'c' },
      { kind: 'flip', id: 'flip', front: 'What is the event horizon?', back: 'The boundary beyond which escape is impossible.', confidence: true },
      { kind: 'mcq', id: 'mcq', prompt: 'What can escape?', options: ['Light', 'Nothing', 'Everything'], answerIndex: 1, why: 'Past the horizon, no path leads out.', confidence: true },
      { kind: 'swipe', id: 'swipe', statement: 'Black holes pull in everything in the universe.', isTrue: false, why: 'Their gravity matters locally.' },
      { kind: 'cloze', id: 'cloze', before: 'The boundary is called the', after: '.', answer: 'event horizon', distractors: ['singularity', 'accretion disk'] },
      { kind: 'order', id: 'order', prompt: 'Order the stages', steps: ['A star runs out of fuel', 'Its core collapses', 'A black hole may form'] },
      { kind: 'match', id: 'match', prompt: 'Match the terms', pairs: [['horizon', 'boundary'], ['core', 'center'], ['disk', 'orbiting matter']] },
      { kind: 'idea', id: 'idea2', title: 'A dense object', body: 'A black hole packs mass into a very small region.' },
      { kind: 'flip', id: 'flip2', front: 'Can light escape?', back: 'From inside the horizon, it cannot.' },
    ],
  };
}

test('validates all lesson card variants and rejects malformed or unbounded input', () => {
  const valid = validateLessonDeck(sampleDeck());
  assert.equal(valid.ok, true);
  assert.equal(valid.deck.cards.length, 9);
  assert.equal(validateLessonDeck({ ...sampleDeck(), cards: sampleDeck().cards.slice(0, 2) }).ok, false);
  const duplicateId = sampleDeck(); duplicateId.cards[1].id = 'idea';
  assert.equal(validateLessonDeck(duplicateId).ok, false);
  const duplicateOptions = sampleDeck(); duplicateOptions.cards[2].options = ['same', 'same'];
  assert.equal(validateLessonDeck(duplicateOptions).ok, false);
  const duplicateCloze = sampleDeck(); duplicateCloze.cards[4].distractors[0] = duplicateCloze.cards[4].answer;
  assert.equal(validateLessonDeck(duplicateCloze).ok, false);
  const duplicateMatchSide = sampleDeck(); duplicateMatchSide.cards[6].pairs[1][0] = duplicateMatchSide.cards[6].pairs[0][0];
  assert.equal(validateLessonDeck(duplicateMatchSide).ok, false);
  const clozeBoundaries = sampleDeck(); clozeBoundaries.cards[4].answer = 'a'.repeat(40); clozeBoundaries.cards[4].distractors = ['b'.repeat(160), 'third'];
  assert.equal(validateLessonDeck(clozeBoundaries).ok, true);
  clozeBoundaries.cards[4].answer = 'a'.repeat(41);
  assert.equal(validateLessonDeck(clozeBoundaries).ok, false);
  clozeBoundaries.cards[4].answer = 'answer'; clozeBoundaries.cards[4].distractors[0] = 'b'.repeat(161);
  assert.equal(validateLessonDeck(clozeBoundaries).ok, false);
  const longPrompt = sampleDeck(); longPrompt.cards[2].prompt = 'x'.repeat(301);
  assert.equal(validateLessonDeck(longPrompt).ok, false);
  const invalidIndex = sampleDeck(); invalidIndex.cards[2].answerIndex = 3;
  assert.equal(validateLessonDeck(invalidIndex).ok, false);
});

test('seeded shuffle and arrangement are repeatable and honor soft ordering rules', () => {
  const cards = validateLessonDeck(sampleDeck()).deck.cards;
  assert.deepEqual(seededShuffle([1, 2, 3, 4, 5], 'turn-a'), seededShuffle([1, 2, 3, 4, 5], 'turn-a'));
  assert.notDeepEqual(seededShuffle([1, 2, 3, 4, 5], 'turn-a'), seededShuffle([1, 2, 3, 4, 5], 'turn-b'));
  for (let seedIndex = 0; seedIndex < 80; seedIndex += 1) {
    const seed = `turn-${seedIndex}`;
    const order = arrangeDeck(cards, seed);
    assert.deepEqual(order, arrangeDeck(cards, seed));
    assert.equal(cards[order[0]].kind, 'idea');
    assert.ok(['flip', 'swipe'].includes(cards[order.at(-1)].kind));
    let activeRun = 0;
    for (let position = 0; position < order.length; position += 1) {
      const current = cards[order[position]];
      const remaining = order.slice(position);
      const ideaRemains = remaining.some(index => cards[index].kind === 'idea');
      if (activeRun >= 3 && ideaRemains) assert.equal(current.kind, 'idea');
      if (position > 0) {
        const previous = cards[order[position - 1]];
        const laterDifferent = remaining.some(index => cards[index].kind !== previous.kind);
        if (previous.kind === current.kind && laterDifferent) assert.fail(`avoidable repeated kinds for ${seed}`);
      }
      activeRun = current.kind === 'idea' ? 0 : activeRun + 1;
    }
  }
  assert.notDeepEqual(arrangeDeck(cards, 'turn-a'), arrangeDeck(cards, 'turn-b'));
});

test('progress reducers grade confidence-gated answers and record swipe, order, reveal, and matches', () => {
  const deck = validateLessonDeck(sampleDeck()).deck;
  const mcq = deck.cards.find(card => card.kind === 'mcq');
  let progress = initialCardProgress(mcq);
  progress = reduceCardProgress(mcq, progress, { type: 'answer', index: 0 });
  assert.equal(progress.selected, 0);
  assert.equal(progress.answered, false);
  assert.equal(progress.correct, undefined);
  progress = reduceCardProgress(mcq, progress, { type: 'confidence', value: 'guess' });
  assert.equal(progress.answered, true);
  assert.equal(progress.correct, false);
  assert.equal(reduceCardProgress(mcq, progress, { type: 'answer', index: 1 }), progress);
  assert.equal(reduceCardProgress(mcq, progress, { type: 'confidence', value: 'sure' }), progress);

  const flip = deck.cards.find(card => card.kind === 'flip');
  let flipped = initialCardProgress(flip);
  assert.equal(reduceCardProgress(flip, flipped, { type: 'selfGrade', correct: true }), flipped);
  flipped = reduceCardProgress(flip, flipped, { type: 'flip' });
  assert.equal(reduceCardProgress(flip, flipped, { type: 'selfGrade', correct: true }), flipped);
  flipped = reduceCardProgress(flip, flipped, { type: 'confidence', value: 'guess' });
  flipped = reduceCardProgress(flip, flipped, { type: 'selfGrade', correct: false });
  assert.equal(flipped.answered, true);
  assert.equal(reduceCardProgress(flip, flipped, { type: 'selfGrade', correct: true }), flipped);

  const swipe = deck.cards.find(card => card.kind === 'swipe');
  assert.equal(reduceCardProgress(swipe, initialCardProgress(swipe), { type: 'swipe', value: false }).correct, true);
  const order = deck.cards.find(card => card.kind === 'order');
  let ordered = initialCardProgress(order);
  ordered = reduceCardProgress(order, ordered, { type: 'order', index: 1 });
  assert.equal(ordered.attempts, 1);
  assert.deepEqual(ordered.order, []);
  assert.equal(reduceCardProgress(order, ordered, { type: 'reveal' }), ordered);
  ordered = reduceCardProgress(order, ordered, { type: 'order', index: 2 });
  assert.equal(ordered.attempts, 2);
  ordered = reduceCardProgress(order, ordered, { type: 'reveal' });
  assert.equal(ordered.revealed, true);
  assert.equal(ordered.answered, true);
  const match = deck.cards.find(card => card.kind === 'match');
  let matched = initialCardProgress(match);
  matched = reduceCardProgress(match, matched, { type: 'selectMatch', index: 0 });
  matched = reduceCardProgress(match, matched, { type: 'match', left: 0, right: 1 });
  assert.equal(matched.attempts, 1);
  assert.equal(matched.selected, undefined);
  matched = reduceCardProgress(match, matched, { type: 'selectMatch', index: 0 });
  matched = reduceCardProgress(match, matched, { type: 'match', left: 0, right: 0 });
  assert.deepEqual(matched.matched, [0]);
  matched = reduceCardProgress(match, matched, { type: 'selectMatch', index: 1 });
  matched = reduceCardProgress(match, matched, { type: 'match', left: 1, right: 1 });
  matched = reduceCardProgress(match, matched, { type: 'selectMatch', index: 2 });
  matched = reduceCardProgress(match, matched, { type: 'match', left: 2, right: 2 });
  assert.equal(matched.answered, true);
  assert.equal(matched.correct, false);
  assert.equal(reduceCardProgress(match, matched, { type: 'match', left: 2, right: 2 }), matched);
});

test('progress validation rejects state that does not fit its card', () => {
  const deck = validateLessonDeck(sampleDeck()).deck;
  const mcq = deck.cards.find(card => card.kind === 'mcq');
  assert.equal(validateCardProgress(mcq, { answered: false, selected: 0, confidence: 'sure' }), undefined, 'a confidence-gated selection cannot remain unresolved after confidence');
  const order = deck.cards.find(card => card.kind === 'order');
  assert.equal(validateCardProgress(order, { answered: false, order: [0, 0] }), undefined);
  assert.equal(validateCardProgress(order, { answered: false, selected: 99 }), undefined);
  assert.deepEqual(validateCardProgress(order, { answered: false, order: [0], attempts: 1 }), { answered: false, order: [0], attempts: 1 });
  assert.equal(validateCardProgress(order, { answered: false, elapsedMs: 86_400_001 }), undefined);
  assert.equal(validateCardProgress(order, { answered: false, elapsedMs: 42.5 }).elapsedMs, 42.5);
});

function completedProgress(deck) {
  const progress = {};
  for (const card of deck.cards) {
    let value = initialCardProgress(card);
    if (card.kind === 'idea') value = reduceCardProgress(card, value, { type: 'selfGrade', correct: true });
    if (card.kind === 'flip') { value = reduceCardProgress(card, value, { type: 'flip' }); if (card.confidence) value = reduceCardProgress(card, value, { type: 'confidence', value: 'sure' }); value = reduceCardProgress(card, value, { type: 'selfGrade', correct: true }); }
    if (card.kind === 'mcq') { value = reduceCardProgress(card, value, { type: 'answer', index: card.answerIndex }); if (card.confidence) value = reduceCardProgress(card, value, { type: 'confidence', value: 'sure' }); }
    if (card.kind === 'swipe') value = reduceCardProgress(card, value, { type: 'swipe', value: card.isTrue });
    if (card.kind === 'cloze') value = reduceCardProgress(card, value, { type: 'answer', index: 0 });
    if (card.kind === 'order') for (let index = 0; index < card.steps.length; index += 1) value = reduceCardProgress(card, value, { type: 'order', index });
    if (card.kind === 'match') for (let index = 0; index < card.pairs.length; index += 1) { value = reduceCardProgress(card, value, { type: 'selectMatch', index }); value = reduceCardProgress(card, value, { type: 'match', left: index, right: index }); }
    progress[card.id] = value;
  }
  return progress;
}

test('persisted lessons roundtrip, sanitize invalid progress and feedback, and normalize completion', () => {
  const deck = validateLessonDeck(sampleDeck()).deck;
  const created = createPersistedLesson(deck, 'turn-seed');
  assert.deepEqual(created.order, arrangeDeck(deck.cards, 'turn-seed'));
  const complete = { ...created, index: 2, progress: completedProgress(deck), completed: true, feedback: { idea: 'more', mcq: 'invalid', match: 'less' } };
  const serialized = JSON.parse(JSON.stringify(complete));
  const decoded = decodePersistedLesson(serialized);
  assert.equal(decoded.index, 2);
  assert.equal(decoded.completed, true);
  assert.deepEqual(decoded.feedback, { idea: 'more', match: 'less' });
  assert.deepEqual(decoded.progress, serialized.progress);

  assert.equal(decodePersistedLesson({ ...complete, order: [0, 0, 1, 2, 3, 4, 5, 6, 7] }), undefined);
  const malformedProgress = { ...complete, progress: { ...complete.progress, mcq: { answered: true, selected: 0, correct: true, confidence: 'sure' } } };
  const sanitized = decodePersistedLesson(malformedProgress);
  assert.equal(sanitized.progress.mcq, undefined);
  assert.equal(sanitized.completed, false);
  const incomplete = { ...complete, progress: { ...complete.progress, idea: { answered: false } } };
  assert.equal(decodePersistedLesson(incomplete).completed, false);

  const reservedDeckRaw = sampleDeck(); reservedDeckRaw.cards[0].id = '__proto__';
  const reservedDeck = validateLessonDeck(reservedDeckRaw).deck;
  const reservedCreated = createPersistedLesson(reservedDeck, 'reserved');
  const reservedRoundtrip = decodePersistedLesson({ ...reservedCreated, progress: { ['__proto__']: { answered: true, correct: true }, constructor: { answered: true, correct: true } } });
  assert.equal(Object.hasOwn(reservedRoundtrip.progress, '__proto__'), true);
  assert.equal(Object.hasOwn(reservedRoundtrip.progress, 'constructor'), false);
});
