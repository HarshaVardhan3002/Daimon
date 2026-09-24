import assert from 'node:assert/strict';
import test from 'node:test';
import { createFreshChatId, prepareColdStart, restoreSavedChat } from '../src/state/coldStart.ts';
import { canRetryPendingChat, documentContextAfterSuccess, documentRequestForPrompt, documentUriForPrompt, shouldShowChangedDraftMessage } from '../src/state/chatHistory.ts';

const baseState = overrides => ({
  theme: 'light',
  locale: 'en',
  draft: '',
  conversation: [],
  activeChatId: 'active-1',
  activeSession: {},
  savedConversations: [],
  ...overrides,
});

const turn = overrides => ({
  id: 'turn-1',
  prompt: 'Explain this',
  locale: 'en',
  status: 'complete',
  answer: 'A saved answer',
  ...overrides,
});

test('archives a populated active chat and opens a blank fresh session while preserving preferences', () => {
  const quiz = { grading: 'complete', grade: { correct: true } };
  const richTurn = turn({ status: 'streaming', liveProgress: { blocks: { quiz: { quiz } } } });
  const state = baseState({
    conversation: [richTurn],
    activeSession: { sampleSourceSelected: true },
    savedConversations: [{ id: 'older', title: 'Older', turns: [turn({ id: 'older-turn' })] }],
  });

  const fresh = prepareColdStart(state, 'fresh-id');

  assert.equal(fresh.theme, 'light');
  assert.equal(fresh.locale, 'en');
  assert.equal(fresh.activeChatId, 'fresh-id');
  assert.deepEqual(fresh.conversation, []);
  assert.equal(fresh.draft, '');
  assert.equal(fresh.imageAttachment, undefined);
  assert.deepEqual(fresh.activeSession, {});
  assert.deepEqual(fresh.savedConversations.map(chat => chat.id), ['active-1', 'older']);
  assert.equal(fresh.savedConversations[0].title, 'Explain this');
  assert.equal(fresh.savedConversations[0].turns[0].status, 'stopped');
  assert.equal(fresh.savedConversations[0].turns[0].liveProgress.blocks.quiz.quiz, quiz);
});

test('empty active session creates no empty Recent and retains existing history', () => {
  const existing = { id: 'older', title: 'Older', turns: [turn()] };
  const fresh = prepareColdStart(baseState({ savedConversations: [existing] }), 'fresh');

  assert.deepEqual(fresh.savedConversations, [existing]);
  assert.deepEqual(fresh.conversation, []);
  assert.equal(fresh.draft, '');
});

test('draft-only and image-only sessions are archived with their recoverable content', () => {
  const draftOnly = prepareColdStart(baseState({ draft: 'unsent question' }), 'fresh-1');
  assert.equal(draftOnly.savedConversations[0].draft, 'unsent question');
  assert.equal(draftOnly.savedConversations[0].title, 'unsent question');

  const image = { uri: 'file:///document/image.jpg', mimeType: 'image/jpeg', width: 80, height: 60, name: 'image.jpg' };
  const imageOnly = prepareColdStart(baseState({ imageAttachment: image }), 'fresh-2');
  assert.equal(imageOnly.savedConversations[0].imageAttachment, image);
  assert.equal(imageOnly.savedConversations[0].title, 'Image');
  assert.equal(imageOnly.imageAttachment, undefined);
});

test('active document context is archived invisibly, restored for follow-ups, and survives Recent reopen', () => {
  const documentAttachment = { uri: 'file:///document/document-100-ab12cd3.pdf', mimeType: 'application/pdf', sizeBytes: 1200, name: 'agreement.pdf' };
  const activeDocumentContext = documentAttachment;
  const source = baseState({
    conversation: [turn({ prompt: 'Summarize this file', documentAttachment, documentInfo: { pagesRead: 3, pagesTotal: 3, characters: 1600, truncated: false } })],
    activeSession: { activeDocumentContext },
  });
  const cold = prepareColdStart(source, 'fresh');
  assert.equal(cold.documentAttachment, undefined, 'a sent file is not left as a composer draft');
  assert.equal(cold.activeSession.activeDocumentContext, undefined);
  assert.equal(cold.savedConversations[0].session.activeDocumentContext, activeDocumentContext);
  assert.equal(cold.savedConversations[0].turns[0].documentAttachment, documentAttachment);

  const opened = restoreSavedChat(cold, source.activeChatId);
  assert.equal(opened.activeSession.activeDocumentContext, activeDocumentContext);
  assert.equal(opened.conversation[0].documentAttachment, documentAttachment);
});

test('follow-up prompts reuse active context request-only while explicit file cards stay on the original turn', () => {
  const earlier = { uri: 'app://documents/earlier.pdf', mimeType: 'application/pdf', sizeBytes: 100, name: 'earlier.pdf' };
  const replacement = { uri: 'app://documents/replacement.txt', mimeType: 'text/plain', sizeBytes: 200, name: 'replacement.txt' };
  assert.deepEqual(documentRequestForPrompt(undefined, false, earlier), { documentContextAttachment: earlier }, 'follow-ups carry context separately from the visible turn attachment');
  assert.deepEqual(documentRequestForPrompt(replacement, false, earlier), { documentAttachment: replacement }, 'a newly selected document is explicit and replaces the context after success');
  assert.deepEqual(documentRequestForPrompt(undefined, true, earlier), {}, 'an image prompt does not send the document a second time');
  assert.deepEqual(documentRequestForPrompt(replacement, true, earlier), {}, 'the image remains the only attachment even if persisted state is inconsistent');
  assert.equal(documentContextAfterSuccess(earlier, undefined, false), earlier, 'cancelling/removing an unsent replacement keeps the prior context');
  assert.equal(documentContextAfterSuccess(earlier, replacement, false), replacement, 'a successfully sent replacement takes over context');
  assert.equal(documentContextAfterSuccess(earlier, undefined, true), undefined, 'a successfully sent image clears document context');
});

test('inherited document context stays retryable and remains serializable in pending request metadata', () => {
  const file = { uri: 'file:///data/user/0/app/files/document-attachments/document-10-ab123.pdf', mimeType: 'application/pdf', sizeBytes: 100, name: 'notes.pdf' };
  const request = { messages: [{ role: 'user', content: 'Follow up' }], prompt: 'Follow up', locale: 'en', draftSnapshot: 'Follow up', documentContextAttachment: file, status: 'error', error: 'interrupted' };
  const restoredRequest = JSON.parse(JSON.stringify(request));
  assert.deepEqual(restoredRequest.documentContextAttachment, file);
  assert.equal(restoredRequest.documentAttachment, undefined, 'reopened follow-up does not gain a duplicate file card');
  assert.equal(canRetryPendingChat(restoredRequest, 'Follow up', undefined, file.uri), true);
  assert.equal(canRetryPendingChat(restoredRequest, 'Changed prompt', undefined, file.uri), false);
});

test('document failures keep their localized error even when retry is disabled', () => {
  assert.equal(shouldShowChangedDraftMessage(true, false, 'document_password'), false);
  assert.equal(shouldShowChangedDraftMessage(true, false, 'document_no_text'), false);
  assert.equal(shouldShowChangedDraftMessage(true, false, 'failed'), true);
  assert.equal(shouldShowChangedDraftMessage(true, true, 'failed'), false);
});

test('image retry identity ignores the chat active PDF context', () => {
  const image = { uri: 'file:///data/user/0/app/files/image-10.png' };
  const activePdf = { uri: 'file:///data/user/0/app/files/document-attachments/document-10-ab123.pdf' };
  const request = { draftSnapshot: 'Describe this', attachment: image };
  const currentDocumentUri = documentUriForPrompt(true, undefined, activePdf.uri);
  assert.equal(currentDocumentUri, undefined);
  assert.equal(canRetryPendingChat(request, 'Describe this', image.uri, currentDocumentUri), true);
  assert.equal(canRetryPendingChat(request, 'Describe this', image.uri, activePdf.uri), false, 'passing the PDF URI would incorrectly block retry');
});

test('pending request metadata is archived without retrying and fresh session is blank', () => {
  const pendingChatRequest = {
    prompt: 'pending prompt',
    draftSnapshot: 'pending prompt',
    status: 'error',
    error: 'interrupted',
    messages: [{ role: 'user', content: 'pending prompt' }],
  };
  const pendingLiveRequest = {
    request: { prompt: 'legacy prompt' },
    draftSnapshot: 'legacy prompt',
    preserveDraftOnError: true,
    status: 'error',
    error: 'interrupted',
  };
  const fresh = prepareColdStart(baseState({ activeSession: { pendingChatRequest, pendingLiveRequest } }), 'fresh');

  assert.equal(fresh.savedConversations[0].title, 'pending prompt');
  assert.equal(fresh.savedConversations[0].session.pendingChatRequest, pendingChatRequest);
  assert.equal(fresh.savedConversations[0].session.pendingLiveRequest, pendingLiveRequest);
  assert.deepEqual(fresh.activeSession, {});
});

test('an optimistic pending bubble and its original retry identity survive archive and saved-chat reopen', () => {
  const pendingChatRequest = {
    prompt: 'Use the attached PDF',
    draftSnapshot: 'Use the attached PDF',
    pendingTurnId: 'pending-turn-1',
    status: 'loading',
    messages: [{ role: 'user', content: 'Use the attached PDF' }],
  };
  const olderRetry = { ...pendingChatRequest, pendingTurnId: 'failed-turn-0', status: 'error', error: 'failed' };
  const source = baseState({
    conversation: [turn({ id: 'pending-turn-1', prompt: 'Use the attached PDF', status: 'streaming', answer: '' })],
    activeSession: { pendingChatRequest, retryableChatRequests: [olderRetry] },
  });
  const cold = prepareColdStart(source, 'fresh');
  const saved = cold.savedConversations.find(chat => chat.id === source.activeChatId);

  assert.equal(saved.turns[0].status, 'stopped', 'a killed request is shown as interrupted rather than loading forever');
  assert.equal(saved.turns[0].id, pendingChatRequest.pendingTurnId);
  assert.equal(saved.session.pendingChatRequest.pendingTurnId, pendingChatRequest.pendingTurnId);
  assert.equal(saved.session.retryableChatRequests[0].pendingTurnId, olderRetry.pendingTurnId);

  const reopened = restoreSavedChat(cold, source.activeChatId);
  assert.equal(reopened.conversation[0].id, pendingChatRequest.pendingTurnId);
  assert.equal(reopened.activeSession.pendingChatRequest.pendingTurnId, pendingChatRequest.pendingTurnId);
  assert.equal(reopened.activeSession.retryableChatRequests[0].pendingTurnId, olderRetry.pendingTurnId);
});

test('active chat replaces a duplicate Recent, sorts newest first, and caps history at 20', () => {
  const savedConversations = Array.from({ length: 21 }, (_, index) => ({
    id: index === 4 ? 'active-1' : `saved-${index}`,
    title: `Saved ${index}`,
    turns: [turn({ id: `saved-turn-${index}` })],
  }));
  const fresh = prepareColdStart(baseState({ conversation: [turn()], savedConversations }), 'fresh');

  assert.equal(fresh.savedConversations.length, 20);
  assert.equal(fresh.savedConversations[0].id, 'active-1');
  assert.equal(fresh.savedConversations.filter(chat => chat.id === 'active-1').length, 1);
  assert.equal(fresh.savedConversations.some(chat => chat.id === 'saved-20'), false);
});

test('running the transform again is idempotent and generated ids avoid current history ids', () => {
  const initial = baseState({ draft: 'keep me' });
  const once = prepareColdStart(initial, 'fresh-1');
  const twice = prepareColdStart(once, 'fresh-2');

  assert.deepEqual(twice.savedConversations, once.savedConversations);
  assert.equal(createFreshChatId(['chat-100', 'chat-100-1'], 100), 'chat-100-2');
});

test('opening a saved chat restores turns, quiz state, draft, image and request session without changing preferences', () => {
  const quiz = { grading: 'complete', grade: { correct: true } };
  const saved = {
    id: 'recent-1',
    title: 'Saved',
    turns: [turn({ liveProgress: { blocks: { quiz: { quiz } } } })],
    draft: 'resume this',
    imageAttachment: { uri: 'file:///document/image.jpg', mimeType: 'image/jpeg', width: 80, height: 60, name: 'image.jpg' },
    session: { pendingChatRequest: { prompt: 'resume this', status: 'error', error: 'interrupted' } },
  };
  const state = baseState({
    activeChatId: 'fresh',
    savedConversations: [{ id: 'outgoing', title: 'Outgoing', turns: [] }, saved],
  });
  const restored = restoreSavedChat(state, 'recent-1');

  assert.equal(restored.activeChatId, 'recent-1');
  assert.equal(restored.conversation[0].liveProgress.blocks.quiz.quiz, quiz);
  assert.equal(restored.draft, 'resume this');
  assert.equal(restored.imageAttachment, saved.imageAttachment);
  assert.equal(restored.activeSession.pendingChatRequest, saved.session.pendingChatRequest);
  assert.deepEqual(restored.savedConversations.map(chat => chat.id), ['outgoing']);
  assert.equal(restored.theme, 'light');
  assert.equal(restored.locale, 'en');
});
