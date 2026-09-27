import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import { Share } from 'react-native';
import { strings } from '../i18n/strings';
import { appStore, setActiveSession, setConversation, setDocumentAttachment, setDraft, setImageAttachment } from '../state/appStore';
import { buildChatContext, documentContextAfterSuccess, documentRequestForPrompt } from '../state/chatHistory';
import { beginChatSend, completePendingTurn, failPendingTurn, forgetRetryableRequest, rememberRetryableRequest, updatePendingTurn } from '../state/chatRequestFlow';
import { createStore, useStore } from '../state/store';
import type { ChatRequestError, PendingChatRequest, Turn } from '../state/types';
import { toast } from '../ui/overlays';
import { haptic } from '../ui/PressableScale';
import { DocumentAttachmentError, documentAttachmentPayload } from './documentAttachment';
import { imageNeedsDefault } from './errorText';
import { imageAttachmentDataUri } from './imageAttachment';
import { ChatClientError, sendChatCompletion } from './modelClient';
import { reasoningEffortForMode } from './reasoningEffort';
import { persistRichReply } from './richReply';

const CHAT_PROXY_URL = 'http://127.0.0.1:18765';

/** Screen-level chat state that is not persisted. */
type ChatUi = {
  requestStatus: 'idle' | 'loading' | 'error';
  requestError: ChatRequestError | null;
  speakingTurnId: string | null;
  /** The user message being edited in the composer. */
  editingTurnId: string | null;
  /** The turn just sent: it is scrolled to the top and keeps room below it for the answer. */
  pinnedTurnId: string | null;
};
export const chatUi = createStore<ChatUi>({ requestStatus: 'idle', requestError: null, speakingTurnId: null, editingTurnId: null, pinnedTurnId: null });
export function useChatUi<S>(selector: (state: ChatUi) => S): S { return useStore(chatUi, selector); }

/** Screens above the chat (search) bump this when they open a chat, so it shows with its drawer already shut. */
export const drawerCloseSignal = createStore({ count: 0 });
export function closeDrawerBehind(): void { drawerCloseSignal.set({ count: drawerCloseSignal.get().count + 1 }); }

/** Answers that arrived in this session reveal with motion; restored ones appear at rest. */
export const freshAnswers = new Set<string>();

let pending: PendingChatRequest | null = null;
let abortController: AbortController | null = null;
let speechRun = 0;

const t = () => strings[appStore.get().locale];
const newTurnId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function currentRequest(): PendingChatRequest | null { return pending; }

/** Re-read the stored request after hydration or a chat switch, so an interrupted send stays retryable. */
export function syncRequestWithActiveChat(): void {
  const stored = appStore.get().activeSession.pendingChatRequest;
  speechRun += 1; void Speech.stop();
  chatUi.set({ speakingTurnId: null, editingTurnId: null, pinnedTurnId: null });
  if (abortController) return;
  if (!stored) { pending = null; chatUi.set({ requestStatus: 'idle', requestError: null }); return; }
  pending = stored;
  chatUi.set({ requestStatus: 'error', requestError: stored.error ?? 'interrupted' });
}

function errorCode(error: unknown, hasDocument: boolean): ChatRequestError {
  if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
  if (error instanceof ChatClientError && error.code === 'PROXY_UNREACHABLE') return 'disconnected';
  const code = error instanceof ChatClientError || error instanceof DocumentAttachmentError ? error.code : '';
  switch (code) {
    case 'REASONING_IMAGE_UNSUPPORTED': return 'reasoning_image_unsupported';
    case 'REASONING_UNAVAILABLE': return 'reasoning_unavailable';
    case 'DOCUMENT_TOO_MANY_PAGES': return 'document_too_many_pages';
    case 'DOCUMENT_PASSWORD': return 'document_password';
    case 'DOCUMENT_NO_TEXT': return 'document_no_text';
    case 'DOCUMENT_ENCODING': return 'document_encoding';
    case 'DOCUMENT_INVALID': return 'document_invalid';
    case 'DOCUMENT_TOO_LARGE': return 'document_too_large';
    case 'REQUEST_TOO_LARGE': return hasDocument ? 'document_too_large' : 'failed';
    default: return 'failed';
  }
}

async function run(request: PendingChatRequest): Promise<void> {
  if (abortController || pending?.status === 'loading') return;
  const previous = pending;
  const active: PendingChatRequest = { ...request, status: 'loading', error: undefined };
  pending = active;
  setActiveSession(current => {
    let retryable = current.retryableChatRequests;
    if (previous && previous.pendingTurnId !== active.pendingTurnId) retryable = rememberRetryableRequest(retryable, previous);
    retryable = forgetRetryableRequest(retryable, active.pendingTurnId ?? '');
    return { ...current, retryableChatRequests: retryable.length ? retryable : undefined, pendingChatRequest: active };
  });
  chatUi.set({ requestStatus: 'loading', requestError: null });
  const controller = new AbortController(); abortController = controller;
  const startedAt = Date.now();
  const requestDocument = request.documentAttachment ?? request.documentContextAttachment;
  try {
    const last = request.messages[request.messages.length - 1];
    const messages = requestDocument
      ? [...request.messages.slice(0, -1), { ...last, document: await documentAttachmentPayload(requestDocument) }]
      : request.attachment
        ? [...request.messages.slice(0, -1), { ...last, image: await imageAttachmentDataUri(request.attachment) }]
        : request.messages;
    const result = await sendChatCompletion(messages, { baseUrl: CHAT_PROXY_URL, signal: controller.signal, ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}) });
    const id = request.pendingTurnId ?? newTurnId();
    const rich = result.message.rich ? await persistRichReply(result.message.rich, id) : undefined;
    const original = appStore.get().conversation.find(item => item.id === id);
    const turn: Turn = {
      id, prompt: request.prompt, locale: request.locale, status: 'complete', answer: result.message.content,
      createdAt: original?.createdAt ?? startedAt, elapsedMs: Date.now() - startedAt, reasoningEffort: request.reasoningEffort,
      ...(request.attachment ? { imageAttachment: request.attachment } : {}),
      ...(request.documentAttachment ? { documentAttachment: request.documentAttachment } : {}),
      ...(request.documentAttachment && result.documentInfo ? { documentInfo: result.documentInfo } : {}),
      ...(rich ? { rich } : {}),
    };
    freshAnswers.add(id);
    setConversation(current => {
      if (request.pendingTurnId) return completePendingTurn(current, turn);
      const index = request.replacementTurnId ? current.findIndex(item => item.id === request.replacementTurnId) : -1;
      if (index === current.length - 1 && index >= 0) return [...current.slice(0, index), turn];
      return [...current, turn];
    });
    if (pending?.pendingTurnId === request.pendingTurnId) pending = null;
    setActiveSession(current => ({ ...current, activeDocumentContext: documentContextAfterSuccess(current.activeDocumentContext, request.documentAttachment, Boolean(request.attachment)), retryableChatRequests: forgetRetryableRequest(current.retryableChatRequests, request.pendingTurnId ?? ''), pendingChatRequest: current.pendingChatRequest?.pendingTurnId === request.pendingTurnId ? undefined : current.pendingChatRequest }));
    chatUi.set({ requestStatus: 'idle', requestError: null });
    haptic('light');
  } catch (error) {
    const kind = errorCode(error, Boolean(requestDocument));
    const failed: PendingChatRequest = { ...request, status: 'error', error: kind };
    pending = failed;
    setActiveSession(current => ({ ...current, pendingChatRequest: failed }));
    if (request.pendingTurnId) setConversation(current => failPendingTurn(current, request.pendingTurnId!, kind));
    chatUi.set({ requestStatus: 'error', requestError: kind });
  } finally {
    if (abortController === controller) abortController = null;
  }
}

export function isBusy(): boolean { return Boolean(abortController) || pending?.status === 'loading'; }

/** Send the composer's draft (or the edit of an earlier message). Returns false when nothing was sent. */
export function sendDraft(): boolean {
  const state = appStore.get();
  const locale = state.locale;
  const draft = state.draft;
  if ((!draft.trim() && !state.imageAttachment && !state.documentAttachment) || isBusy()) return false;
  const prompt = draft.trim() || (state.documentAttachment ? (locale === 'de' ? 'Fasse diese Datei zusammen.' : 'Summarize this file.') : (locale === 'de' ? 'Was ist auf diesem Bild zu sehen?' : 'What is in this image?'));
  const effort = reasoningEffortForMode(state.reasoningMode);
  if (state.imageAttachment && effort) { toast(imageNeedsDefault(locale)); return false; }
  const editing = chatUi.get().editingTurnId;
  const editIndex = editing ? state.conversation.findIndex(turn => turn.id === editing) : -1;
  const base = editIndex >= 0 ? state.conversation.slice(0, editIndex) : state.conversation;
  const requestDocument = documentRequestForPrompt(state.documentAttachment, Boolean(state.imageAttachment), state.activeSession.activeDocumentContext);
  const pendingTurnId = newTurnId();
  const request: PendingChatRequest = { messages: buildChatContext(base, prompt), prompt, locale, draftSnapshot: draft, ...(effort ? { reasoningEffort: effort } : {}), pendingTurnId, ...(state.imageAttachment ? { attachment: state.imageAttachment } : {}), ...requestDocument, status: 'loading' };
  const start = beginChatSend(request, pendingTurnId);
  setConversation([...base, { ...start.turn, createdAt: Date.now(), reasoningEffort: effort }]);
  setDraft(start.composerDraft);
  setImageAttachment(current => current?.uri === start.imageUri ? undefined : current);
  setDocumentAttachment(current => current?.uri === start.documentUri ? undefined : current);
  chatUi.set({ pinnedTurnId: pendingTurnId, editingTurnId: null });
  haptic('light');
  void run(request);
  return true;
}

export function stopRequest(): void { abortController?.abort(); }

export function retryableRequestFor(turnId: string): PendingChatRequest | undefined {
  if (pending?.pendingTurnId === turnId && pending.status === 'error') return pending.error?.startsWith('document_') ? undefined : pending;
  const stored = appStore.get().activeSession.retryableChatRequests?.find(item => item.pendingTurnId === turnId);
  return stored?.error?.startsWith('document_') ? undefined : stored;
}

export function retryRequest(turnId?: string): void {
  if (isBusy()) return;
  const request = !turnId || pending?.pendingTurnId === turnId ? pending : appStore.get().activeSession.retryableChatRequests?.find(item => item.pendingTurnId === turnId);
  if (!request) return;
  const state = appStore.get();
  const effort = reasoningEffortForMode(state.reasoningMode);
  if (request.attachment && effort) { toast(imageNeedsDefault(state.locale)); return; }
  if (request.pendingTurnId) {
    setConversation(current => updatePendingTurn(current, request.pendingTurnId!, 'streaming'));
    chatUi.set({ pinnedTurnId: request.pendingTurnId });
  }
  void run({ ...request, reasoningEffort: effort });
}

export function dismissRequestError(): void { chatUi.set({ requestStatus: 'idle', requestError: null }); }

export function canRegenerate(turn: Turn): boolean {
  const state = appStore.get();
  return !isBusy() && state.conversation.at(-1)?.id === turn.id && !state.draft.trim() && !state.imageAttachment && !state.documentAttachment
    && turn.status === 'complete' && !turn.imageAttachment && !turn.documentAttachment && !turn.rich && !turn.id.startsWith('sample-')
    && !turn.liveActivity && !turn.liveProgress && Boolean(turn.prompt.trim()) && Boolean(turn.answer.trim());
}

/** Ask again for the latest answer with the current effort setting; the new answer replaces it. */
export function regenerateTurn(turn: Turn): void {
  if (!canRegenerate(turn)) return;
  const state = appStore.get();
  const effort = reasoningEffortForMode(state.reasoningMode);
  // The optimistic pending turn keeps the prompt on screen while the answer is rebuilt in place.
  const pendingTurnId = turn.id;
  setConversation(current => updatePendingTurn(current, pendingTurnId, 'streaming'));
  chatUi.set({ pinnedTurnId: pendingTurnId });
  void run({ messages: buildChatContext(state.conversation.slice(0, -1), turn.prompt), prompt: turn.prompt, locale: turn.locale, draftSnapshot: state.draft, pendingTurnId, ...(effort ? { reasoningEffort: effort } : {}), status: 'loading' });
}

export function beginEdit(turn: Turn): void {
  if (isBusy()) return;
  chatUi.set({ editingTurnId: turn.id });
  setDraft(turn.prompt);
}
export function cancelEdit(): void {
  if (!chatUi.get().editingTurnId) return;
  chatUi.set({ editingTurnId: null });
  setDraft('');
}

export async function copyText(text: string): Promise<boolean> {
  try { await Clipboard.setStringAsync(text); haptic('success'); return true; }
  catch { toast(t().copyFailed); return false; }
}

export async function shareText(text: string): Promise<void> {
  try { await Share.share({ message: text }); }
  catch { toast(t().shareFailed); }
}

export async function toggleReadAloud(turn: Turn, text: string): Promise<void> {
  if (chatUi.get().speakingTurnId === turn.id) {
    speechRun += 1; chatUi.set({ speakingTurnId: null }); await Speech.stop(); return;
  }
  const runId = ++speechRun;
  chatUi.set({ speakingTurnId: null });
  await Speech.stop();
  if (speechRun !== runId) return;
  chatUi.set({ speakingTurnId: turn.id });
  const done = () => { if (speechRun === runId) chatUi.set({ speakingTurnId: null }); };
  Speech.speak(text, {
    language: turn.locale === 'de' ? 'de-DE' : 'en-US',
    onDone: done, onStopped: done,
    onError: () => { if (speechRun === runId) { chatUi.set({ speakingTurnId: null }); toast(t().readAloudFailed); } },
  });
}

export function stopSpeech(): void { speechRun += 1; chatUi.set({ speakingTurnId: null }); void Speech.stop(); }

export function transcript(): string {
  const state = appStore.get();
  const you = strings[state.locale].you;
  return state.conversation.map(turn => `${you}: ${turn.prompt}\n\nDaimon: ${turn.answer}`).join('\n\n');
}
