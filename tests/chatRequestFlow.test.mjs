import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatContext } from '../src/state/chatHistory.ts';
import { beginChatSend, completePendingTurn, failPendingTurn, isAnsweredChatTurn, isRegeneratingTurn, rememberRetryableRequest, shouldShowGlobalChatError, updatePendingTurn } from '../src/state/chatRequestFlow.ts';

const request = overrides => ({
  messages: [{ role: 'user', content: 'Explain this' }],
  prompt: 'Explain this',
  locale: 'en',
  draftSnapshot: 'Explain this',
  pendingTurnId: 'turn-pending-1',
  status: 'loading',
  ...overrides,
});

test('Send immediately clears only the submitted composer snapshot and shows its prompt and attachment', () => {
  const image = { uri: 'file:///image.png', mimeType: 'image/png', width: 20, height: 20, name: 'image.png' };
  const file = { uri: 'file:///notes.pdf', mimeType: 'application/pdf', sizeBytes: 100, name: 'notes.pdf' };
  const textSend = beginChatSend(request(), 'turn-pending-1');
  const imageSend = beginChatSend(request({ attachment: image }), 'turn-pending-2');
  const documentSend = beginChatSend(request({ documentAttachment: file }), 'turn-pending-3');

  assert.equal(textSend.composerDraft, '');
  assert.deepEqual({ id: textSend.turn.id, prompt: textSend.turn.prompt, status: textSend.turn.status, answer: textSend.turn.answer }, { id: 'turn-pending-1', prompt: 'Explain this', status: 'streaming', answer: '' });
  assert.equal(imageSend.composerDraft, '');
  assert.equal(imageSend.turn.imageAttachment, image);
  assert.equal(imageSend.imageUri, image.uri, 'the caller clears only this captured chip');
  assert.equal(documentSend.composerDraft, '');
  assert.equal(documentSend.turn.documentAttachment, file);
  assert.equal(documentSend.turn.imageAttachment, undefined);
  assert.equal(documentSend.documentUri, file.uri, 'the request still owns the captured file for retry');
});

test('success finalizes the optimistic turn in place; retry resets it instead of duplicating it', () => {
  const pending = beginChatSend(request(), 'turn-pending-1').turn;
  const retried = updatePendingTurn([pending], pending.id, 'streaming');
  const completed = { ...retried[0], status: 'complete', answer: 'A clear answer' };
  const final = completePendingTurn(retried, completed);

  assert.equal(final.length, 1);
  assert.equal(final[0].id, 'turn-pending-1');
  assert.equal(final[0].status, 'complete');
  assert.equal(final[0].answer, 'A clear answer');
  assert.equal(final[0].requestError, undefined);
});

test('failure keeps the authored turn and localized error identity for recovery', () => {
  const pending = beginChatSend(request(), 'turn-pending-1').turn;
  const failed = failPendingTurn([pending], pending.id, 'disconnected');
  assert.equal(failed.length, 1);
  assert.equal(failed[0].prompt, 'Explain this');
  assert.equal(failed[0].status, 'failed');
  assert.equal(failed[0].requestError, 'disconnected');
  assert.equal(failPendingTurn([pending], pending.id, 'cancelled')[0].status, 'stopped');
});

test('new sends preserve earlier failed retries while unanswered turns stay out of model context', () => {
  const old = request({ status: 'error', error: 'failed', pendingTurnId: 'turn-old' });
  const newer = request({ status: 'error', error: 'disconnected', pendingTurnId: 'turn-new' });
  const saved = rememberRetryableRequest(undefined, old);
  const both = rememberRetryableRequest(saved, newer);
  const turns = [
    { id: 'turn-done', prompt: 'Answered', locale: 'en', status: 'complete', answer: 'Yes.' },
    { ...beginChatSend(old, 'turn-old').turn, status: 'failed' },
    beginChatSend(newer, 'turn-new').turn,
  ];

  assert.deepEqual(both.map(item => item.pendingTurnId), ['turn-old', 'turn-new']);
  assert.deepEqual(buildChatContext(turns, 'Next question'), [
    { role: 'user', content: 'Answered' },
    { role: 'assistant', content: 'Yes.' },
    { role: 'user', content: 'Next question' },
  ]);
  assert.equal(isAnsweredChatTurn(turns[0]), true);
  assert.equal(isAnsweredChatTurn(turns[1]), false);
  assert.equal(isAnsweredChatTurn(turns[2]), false);
});

test('unanswered turns do not evict answered context before the 12-turn history bound', () => {
  const completed = { id: 'turn-context', prompt: 'Keep this question', locale: 'en', status: 'complete', answer: 'Keep this answer' };
  const unanswered = Array.from({ length: 20 }, (_, index) => ({
    id: `turn-pending-${index}`,
    prompt: `Unanswered prompt ${index}`,
    locale: 'en',
    status: index % 2 ? 'failed' : 'stopped',
    answer: '',
  }));
  assert.deepEqual(buildChatContext([completed, ...unanswered], 'New prompt'), [
    { role: 'user', content: 'Keep this question' },
    { role: 'assistant', content: 'Keep this answer' },
    { role: 'user', content: 'New prompt' },
  ]);
});

test('retry snapshots stay bounded to the five most recent failures', () => {
  const requests = Array.from({ length: 7 }, (_, index) => request({ status: 'error', error: 'failed', pendingTurnId: `turn-${index}` }));
  const retained = requests.reduce((previous, current) => rememberRetryableRequest(previous, current), undefined);
  assert.deepEqual(retained.map(item => item.pendingTurnId), ['turn-2', 'turn-3', 'turn-4', 'turn-5', 'turn-6']);
});

test('Regenerate keeps its existing answer visible with an in-place loading state', () => {
  const original = { id: 'turn-answer', prompt: 'Explain this', locale: 'en', status: 'complete', answer: 'Existing answer stays visible.' };
  const regeneration = request({ pendingTurnId: undefined, replacementTurnId: original.id, status: 'loading' });
  assert.equal(original.answer, 'Existing answer stays visible.');
  assert.equal(isRegeneratingTurn(regeneration, original.id, true), true);
  assert.equal(isRegeneratingTurn(regeneration, original.id, false), false);
  assert.equal(isRegeneratingTurn(regeneration, 'another-turn', true), false);
});

test('only requests without an authored pending Turn use the global error banner', () => {
  assert.equal(shouldShowGlobalChatError(request({ pendingTurnId: 'turn-1' }), true), false);
  assert.equal(shouldShowGlobalChatError(request({ replacementTurnId: 'turn-1', pendingTurnId: undefined }), true), true);
  assert.equal(shouldShowGlobalChatError(request({ pendingTurnId: undefined }), true), true, 'legacy request errors remain visible');
  assert.equal(shouldShowGlobalChatError(request({ pendingTurnId: undefined }), false), false);
});
