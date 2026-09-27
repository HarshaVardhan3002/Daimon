import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTaste, emptyTaste, reduceTaste, tasteWeights } from '../src/learning/tasteMath.ts';

test('unobserved kinds have equal normalized weight', () => {
  const weights = Object.values(tasteWeights(emptyTaste()));
  assert.equal(weights.length, 7);
  assert.ok(weights.every(value => Math.abs(value - 1 / 7) < 1e-12));
  assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test('explicit feedback changes relative weights and reducers preserve prior state', () => {
  const original = emptyTaste();
  const more = reduceTaste(original, 'flip', { type: 'feedback', signal: 'more' });
  const both = reduceTaste(more, 'mcq', { type: 'feedback', signal: 'less' });
  const weights = tasteWeights(both);
  assert.ok(weights.flip > weights.idea);
  assert.ok(weights.mcq < weights.idea);
  assert.equal(original.flip.more, 0);
  assert.equal(both.flip.more, 1);
  assert.equal(both.mcq.less, 1);
});

test('implicit counts and mean duration accumulate without weighting reading speed', () => {
  let profile = emptyTaste();
  profile = reduceTaste(profile, 'order', { type: 'shown' });
  profile = reduceTaste(profile, 'order', { type: 'completed', correct: false, ms: 1000 });
  profile = reduceTaste(profile, 'order', { type: 'completed', correct: true, ms: 3000 });
  assert.deepEqual(profile.order, { more: 0, less: 0, shown: 1, completed: 2, correct: 1, meanMs: 2000 });
  assert.deepEqual(tasteWeights(profile), tasteWeights({ ...profile, order: { ...profile.order, meanMs: 90000 } }));
});

test('stored corrupt counts are bounded and cannot produce non-finite weights', () => {
  const profile = decodeTaste({ flip: { more: -1, less: Infinity, shown: 4.7, completed: 2, correct: 99, meanMs: 1e30 }, mcq: null });
  assert.deepEqual(profile.flip, { more: 0, less: 0, shown: 4, completed: 2, correct: 2, meanMs: 86400000 });
  assert.deepEqual(decodeTaste(null), emptyTaste());
  assert.ok(Object.values(tasteWeights(profile)).every(value => Number.isFinite(value) && value > 0));
});
