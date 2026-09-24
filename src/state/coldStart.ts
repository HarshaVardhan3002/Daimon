import type { Locale } from '../design/theme';
import type { ImageAttachment } from '../chat/imageAttachment';
import type { DocumentAttachment } from '../chat/documentAttachment';
import type { Turn } from './AppState';
import type { ChatSession } from './chatSession';

export type ColdStartSavedConversation = {
  id: string;
  title: string;
  turns: Turn[];
  draft?: string;
  imageAttachment?: ImageAttachment;
  documentAttachment?: DocumentAttachment;
  session?: ChatSession;
};

export type ColdStartState = {
  theme: 'dark' | 'light';
  locale: Locale;
  draft: string;
  imageAttachment?: ImageAttachment;
  documentAttachment?: DocumentAttachment;
  conversation: Turn[];
  activeChatId: string;
  activeSession: ChatSession;
  savedConversations: ColdStartSavedConversation[];
};

const MAX_SAVED_CONVERSATIONS = 20;

function hasMeaningfulActiveState(state: ColdStartState): boolean {
  return Boolean(
    state.conversation.length
    || state.draft.length
    || state.imageAttachment
    || state.documentAttachment
    || state.activeSession.sampleSourceSelected
    || state.activeSession.activeDocumentContext
    || state.activeSession.pendingChatRequest
    || state.activeSession.pendingLiveRequest,
  );
}

function getActiveTitle(state: ColdStartState): string {
  const locale = state.locale;
  return state.conversation[0]?.prompt
    ?? state.activeSession.pendingChatRequest?.prompt
    ?? state.activeSession.pendingLiveRequest?.request.prompt
    ?? (state.draft.trim().slice(0, 60)
      || state.documentAttachment?.name
      || state.activeSession.activeDocumentContext?.name
      || (state.imageAttachment ? (locale === 'de' ? 'Bild' : 'Image')
        : state.activeSession.sampleSourceSelected ? (locale === 'de' ? 'Gespeicherter Chat' : 'Saved conversation')
          : (locale === 'de' ? 'Neuer Chat' : 'New chat')));
}

function stoppedTurns(turns: Turn[]): Turn[] {
  return turns.map(turn => turn.status === 'streaming' ? { ...turn, status: 'stopped' } : turn);
}

export function createFreshChatId(existingIds: readonly string[], now = Date.now()): string {
  const base = `chat-${now}`;
  const used = new Set(existingIds);
  if (!used.has(base)) return base;
  let suffix = 1;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/** Archive the active session once during successful cold hydration, then start blank. */
export function prepareColdStart(state: ColdStartState, freshChatId: string): ColdStartState {
  const savedConversations = hasMeaningfulActiveState(state)
    ? [
        {
          id: state.activeChatId,
          title: getActiveTitle(state),
          turns: stoppedTurns(state.conversation),
          draft: state.draft,
          imageAttachment: state.imageAttachment,
          documentAttachment: state.documentAttachment,
          session: state.activeSession,
        },
        ...state.savedConversations.filter(chat => chat.id !== state.activeChatId),
      ].slice(0, MAX_SAVED_CONVERSATIONS)
    : state.savedConversations.slice(0, MAX_SAVED_CONVERSATIONS);

  return {
    ...state,
    activeChatId: freshChatId,
    conversation: [],
    draft: '',
    imageAttachment: undefined,
    documentAttachment: undefined,
    activeSession: {},
    savedConversations,
  };
}

/** Restore one Recent without changing preferences or the chat's saved content. */
export function restoreSavedChat(state: ColdStartState, id: string): ColdStartState {
  const saved = state.savedConversations.find(chat => chat.id === id);
  if (!saved) return state;
  return {
    ...state,
    conversation: saved.turns,
    draft: saved.draft ?? '',
    imageAttachment: saved.imageAttachment,
    documentAttachment: saved.documentAttachment,
    activeChatId: saved.id,
    activeSession: saved.session ?? {},
    savedConversations: state.savedConversations.filter(chat => chat.id !== id),
  };
}
