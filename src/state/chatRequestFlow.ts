import type { ChatRequestError, PendingChatRequest } from './chatSession';
import type { Turn } from './AppState';

function updateById(turns: Turn[], id: string, update: (turn: Turn) => Turn): Turn[] {
  let changed = false;
  const next = turns.map(turn => {
    if (turn.id !== id) return turn;
    changed = true;
    return update(turn);
  });
  return changed ? next : turns;
}

/** Create the authored bubble before starting network or file I/O. */
export function optimisticChatTurn(request: PendingChatRequest, id: string): Turn {
  return {
    id,
    prompt: request.prompt,
    locale: request.locale,
    status: 'streaming',
    answer: '',
    ...(request.attachment ? { imageAttachment: request.attachment } : {}),
    ...(request.documentAttachment ? { documentAttachment: request.documentAttachment } : {}),
  };
}

/** Capture the synchronous UI transition for Send: clear only the submitted draft/chips. */
export function beginChatSend(request: PendingChatRequest, id: string): { turn: Turn; composerDraft: ''; imageUri?: string; documentUri?: string } {
  return {
    turn: optimisticChatTurn(request, id),
    composerDraft: '',
    ...(request.attachment ? { imageUri: request.attachment.uri } : {}),
    ...(request.documentAttachment ? { documentUri: request.documentAttachment.uri } : {}),
  };
}

/** Keep a bounded set of older failed snapshots so their authored turns can still retry. */
export function rememberRetryableRequest(requests: readonly PendingChatRequest[] | undefined, request: PendingChatRequest | undefined): PendingChatRequest[] {
  if (!request?.pendingTurnId) return [...(requests ?? [])];
  return [...(requests ?? []).filter(item => item.pendingTurnId !== request.pendingTurnId), { ...request, status: 'error' as const }].slice(-5);
}

export function forgetRetryableRequest(requests: readonly PendingChatRequest[] | undefined, turnId: string): PendingChatRequest[] {
  return (requests ?? []).filter(item => item.pendingTurnId !== turnId);
}

export function updatePendingTurn(turns: Turn[], id: string, status: Turn['status'], answer = ''): Turn[] {
  return updateById(turns, id, turn => ({ ...turn, status, answer, requestError: undefined }));
}

export function failPendingTurn(turns: Turn[], id: string, error: ChatRequestError): Turn[] {
  const stopped = error === 'cancelled';
  return updateById(turns, id, turn => ({ ...turn, status: stopped ? 'stopped' : 'failed', answer: '', requestError: error }));
}

/** Finalize an optimistic bubble in place; retries never append a duplicate. */
export function completePendingTurn(turns: Turn[], completed: Turn): Turn[] {
  return updateById(turns, completed.id, () => completed);
}

/** A failed or unfinished authored turn must not be sent as answered conversation context. */
export function isAnsweredChatTurn(turn: Turn): boolean {
  return turn.status === 'complete';
}

export function isRegeneratingTurn(request: Pick<PendingChatRequest, 'replacementTurnId'> | null, turnId: string, loading: boolean): boolean {
  return loading && Boolean(request?.replacementTurnId && request.replacementTurnId === turnId);
}

/** The authored Turn owns its error/retry UI; keep the global banner for legacy and regenerate requests. */
export function shouldShowGlobalChatError(request: Pick<PendingChatRequest, 'pendingTurnId'> | null, hasError: boolean): boolean {
  return hasError && !request?.pendingTurnId;
}
