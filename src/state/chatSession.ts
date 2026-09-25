import type { LiveModelRequest } from '../liveModel/types';
import { decodeImageAttachment, type ImageAttachment } from '../chat/imageAttachment';
import { decodeDocumentAttachment, type DocumentAttachment } from '../chat/documentAttachment';
import type { ReasoningEffort } from '../chat/reasoningEffort';

export type LiveRequestError = 'disconnected' | 'temporarilyUnavailable' | 'failed' | 'tooLong' | 'interrupted';
export type PendingLiveRequest = { request: LiveModelRequest; draftSnapshot: string; preserveDraftOnError: boolean; status: 'loading' | 'error'; error?: LiveRequestError };
export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type ChatRequestError = 'disconnected' | 'failed' | 'cancelled' | 'interrupted' | 'reasoning_unavailable' | 'reasoning_image_unsupported' | 'document_too_large' | 'document_too_many_pages' | 'document_password' | 'document_no_text' | 'document_invalid' | 'document_encoding';
export type PendingChatRequest = { messages: ChatMessage[]; prompt: string; locale: 'en' | 'de'; draftSnapshot: string; reasoningEffort?: ReasoningEffort; attachment?: ImageAttachment; documentAttachment?: DocumentAttachment; documentContextAttachment?: DocumentAttachment; replacementTurnId?: string; pendingTurnId?: string; status: 'loading' | 'error'; error?: ChatRequestError };
export type ChatSession = { sampleSourceSelected?: boolean; activeDocumentContext?: DocumentAttachment; pendingLiveRequest?: PendingLiveRequest; pendingChatRequest?: PendingChatRequest; retryableChatRequests?: PendingChatRequest[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Validate persisted per-chat metadata and make interrupted requests retryable after restart. */
export function decodeChatSession(value: unknown): ChatSession {
  if (value === undefined) return {};
  if (!isRecord(value) || (value.sampleSourceSelected !== undefined && typeof value.sampleSourceSelected !== 'boolean')) throw new Error('Stored chat session is invalid.');
  const sampleSourceSelected = value.sampleSourceSelected as boolean | undefined;
  const activeDocumentContext = decodeDocumentAttachment(value.activeDocumentContext);
  const retryableChatRequests = value.retryableChatRequests === undefined ? undefined
    : Array.isArray(value.retryableChatRequests) && value.retryableChatRequests.length <= 5
      ? value.retryableChatRequests.map(item => decodePendingChatRequest(item))
      : (() => { throw new Error('Stored retryable chat requests are invalid.'); })();
  if (value.pendingChatRequest !== undefined) {
    const pendingChatRequest = decodePendingChatRequest(value.pendingChatRequest);
    return { ...decodeLegacyLiveRequest(value, sampleSourceSelected), ...(activeDocumentContext ? { activeDocumentContext } : {}), ...(retryableChatRequests ? { retryableChatRequests } : {}), pendingChatRequest };
  }
  return { ...decodeLegacyLiveRequest(value, sampleSourceSelected), ...(activeDocumentContext ? { activeDocumentContext } : {}), ...(retryableChatRequests ? { retryableChatRequests } : {}) };
}

function decodePendingChatRequest(value: unknown): PendingChatRequest {
  const pendingChat = value;
  if (!isRecord(pendingChat) || !Array.isArray(pendingChat.messages) || typeof pendingChat.prompt !== 'string'
    || (pendingChat.locale !== 'en' && pendingChat.locale !== 'de') || typeof pendingChat.draftSnapshot !== 'string'
    || (pendingChat.reasoningEffort !== undefined && pendingChat.reasoningEffort !== 'low' && pendingChat.reasoningEffort !== 'medium' && pendingChat.reasoningEffort !== 'high')
    || (pendingChat.replacementTurnId !== undefined && typeof pendingChat.replacementTurnId !== 'string')
    || (pendingChat.pendingTurnId !== undefined && typeof pendingChat.pendingTurnId !== 'string')
    || (pendingChat.status !== 'loading' && pendingChat.status !== 'error')
    || pendingChat.messages.some(message => !isRecord(message) || (message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string' || message.image !== undefined || message.document !== undefined)) throw new Error('Stored chat request is invalid.');
  const error = ['disconnected', 'failed', 'cancelled', 'interrupted', 'reasoning_unavailable', 'reasoning_image_unsupported', 'document_too_large', 'document_too_many_pages', 'document_password', 'document_no_text', 'document_invalid', 'document_encoding'].includes(String(pendingChat.error)) ? pendingChat.error as ChatRequestError : undefined;
  return {
    messages: pendingChat.messages as ChatMessage[], prompt: pendingChat.prompt, locale: pendingChat.locale,
    draftSnapshot: pendingChat.draftSnapshot, status: 'error',
    ...(pendingChat.reasoningEffort ? { reasoningEffort: pendingChat.reasoningEffort as ReasoningEffort } : {}),
    ...(typeof pendingChat.replacementTurnId === 'string' ? { replacementTurnId: pendingChat.replacementTurnId } : {}),
    ...(typeof pendingChat.pendingTurnId === 'string' ? { pendingTurnId: pendingChat.pendingTurnId } : {}),
    ...(decodeImageAttachment(pendingChat.attachment) ? { attachment: decodeImageAttachment(pendingChat.attachment) } : {}),
    ...(decodeDocumentAttachment(pendingChat.documentAttachment) ? { documentAttachment: decodeDocumentAttachment(pendingChat.documentAttachment) } : {}),
    ...(decodeDocumentAttachment(pendingChat.documentContextAttachment) ? { documentContextAttachment: decodeDocumentAttachment(pendingChat.documentContextAttachment) } : {}),
    error: pendingChat.status === 'loading' ? 'interrupted' : error ?? 'failed',
  };
}

function decodeLegacyLiveRequest(value: Record<string, unknown>, sampleSourceSelected: boolean | undefined): ChatSession {
  if (value.pendingLiveRequest === undefined) return { sampleSourceSelected };
  const pending = value.pendingLiveRequest;
  if (!isRecord(pending) || !isRecord(pending.request) || typeof pending.request.prompt !== 'string'
    || (pending.request.sourceText !== undefined && typeof pending.request.sourceText !== 'string')
    || (pending.request.sourceKind !== undefined && pending.request.sourceKind !== 'bundled_sample' && pending.request.sourceKind !== 'user_source')
    || (pending.request.locale !== undefined && pending.request.locale !== 'en' && pending.request.locale !== 'de')
    || typeof pending.draftSnapshot !== 'string' || typeof pending.preserveDraftOnError !== 'boolean'
    || (pending.status !== 'loading' && pending.status !== 'error')) throw new Error('Stored live request is invalid.');
  const error: LiveRequestError | undefined = ['disconnected', 'temporarilyUnavailable', 'failed', 'tooLong', 'interrupted'].includes(String(pending.error)) ? pending.error as LiveRequestError : undefined;
  return {
    sampleSourceSelected,
    pendingLiveRequest: {
      request: pending.request as unknown as LiveModelRequest,
      draftSnapshot: pending.draftSnapshot,
      preserveDraftOnError: pending.preserveDraftOnError,
      status: 'error',
      error: pending.status === 'loading' ? 'interrupted' : error ?? 'failed',
    },
  };
}
