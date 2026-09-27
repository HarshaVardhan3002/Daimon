import type { Locale, ThemePreference } from '../design/tokens';
import type { LiveModelActivity } from '../liveModel/types';
import type { LiveActivityProgress } from '../learning/liveProgress';
import type { ChatRequestError, ChatSession } from './chatSession';
import type { PersistedRichContent } from '../chat/richReply';
import type { ImageAttachment } from '../chat/imageAttachment';
import type { DocumentAttachment } from '../chat/documentAttachment';
import type { ReasoningEffort, ReasoningMode } from '../chat/reasoningEffort';

/** A source the harness attached to an answer. Nothing produces these yet; the UI renders them when present. */
export type AnswerSource = { id: string; kind: 'web' | 'chat' | 'file'; title: string; url?: string; domain?: string; snippet?: string; cited?: boolean };

export type Turn = {
  id: string;
  prompt: string;
  locale: Locale;
  status: 'streaming' | 'complete' | 'stopped' | 'failed';
  answer: string;
  requestError?: ChatRequestError;
  imageAttachment?: ImageAttachment;
  documentAttachment?: DocumentAttachment;
  documentInfo?: { pagesRead: number | null; pagesTotal: number | null; characters: number; truncated: boolean };
  rich?: PersistedRichContent;
  liveActivity?: LiveModelActivity;
  liveProgress?: LiveActivityProgress;
  /** When the prompt was sent (ms). Older turns carry it in their id instead. */
  createdAt?: number;
  /** Time from send to a complete answer (ms). */
  elapsedMs?: number;
  /** Effort the answer was generated with; absent for the default model. */
  reasoningEffort?: ReasoningEffort;
  sources?: AnswerSource[];
};

export type { ChatMessage, ChatRequestError, ChatSession, PendingChatRequest } from './chatSession';
export type SavedConversation = { id: string; title: string; turns: Turn[]; draft?: string; imageAttachment?: ImageAttachment; documentAttachment?: DocumentAttachment; session?: ChatSession; updatedAt?: number };

export type Stored = {
  theme: ThemePreference;
  locale: Locale;
  reasoningMode: ReasoningMode;
  /** Effort Think harder returns to when it is switched back on. */
  preferredEffort: Exclude<ReasoningMode, 'default'>;
  draft: string;
  imageAttachment?: ImageAttachment;
  documentAttachment?: DocumentAttachment;
  conversation: Turn[];
  activeChatId: string;
  /** Title the person gave the active chat; otherwise it is named after its first prompt. */
  activeTitle?: string;
  activeSession: ChatSession;
  savedConversations: SavedConversation[];
};

export type HydrationStatus = 'loading' | 'ready' | 'read_error' | 'parse_error';

/** Send time of a turn: the stored field, else the timestamp embedded in `chat-<ms>-…` ids. */
export function turnTime(turn: Pick<Turn, 'id' | 'createdAt'>): number | undefined {
  if (turn.createdAt) return turn.createdAt;
  const match = /^chat-(\d{12,})/.exec(turn.id);
  return match ? Number(match[1]) : undefined;
}
