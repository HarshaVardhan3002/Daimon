import type { ChatMessage } from '../chat/modelClient';
import type { PendingChatRequest } from './chatSession';
import type { Turn } from './AppState';
import type { DocumentAttachment } from '../chat/documentAttachment';

function legacyActivityText(turn: Turn): string {
  const activity = turn.liveActivity;
  if (!activity) return '';
  const parts: string[] = [activity.title];
  for (const block of activity.blocks) {
    if (block.type === 'explanation') parts.push([block.heading, block.body].filter(Boolean).join('\n\n'));
    else if (block.type === 'quiz') parts.push(`${block.question}\n${block.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('\n')}`);
    else if (block.type === 'flashcard_deck') parts.push(block.cards.map((card, index) => `${index + 1}. ${card.front}\n${card.back}`).join('\n\n'));
  }
  return parts.filter(Boolean).join('\n\n');
}

/** Build bounded context from saved ordinary turns, retaining the new prompt. */
export function buildChatContext(turns: readonly Turn[], prompt: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const answeredTurns = turns.filter(turn => turn.status === 'complete' && !turn.liveActivity && !turn.liveProgress && !turn.id.startsWith('sample-') && turn.prompt.trim()).slice(-12);
  for (const turn of answeredTurns) {
    messages.push({ role: 'user', content: turn.prompt.slice(0, 6000) });
    const answer = turn.answer.trim();
    const imageContext = turn.rich?.type === 'generated_image' ? `The previous assistant reply included a generated image described as: ${turn.rich.alt}` : '';
    const contextAnswer = [answer, imageContext].filter(Boolean).join('\n\n');
    if (contextAnswer) messages.push({ role: 'assistant', content: contextAnswer.slice(0, 6000) });
  }
  messages.push({ role: 'user', content: prompt });
  while (messages.length > 24 || messages.reduce((sum, item) => sum + item.content.length, 0) > 12_000) {
    if (messages.length <= 1) break;
    messages.shift();
  }
  if (messages.length && messages[messages.length - 1].role !== 'user') messages.push({ role: 'user', content: prompt });
  return messages;
}

/** Read an older typed activity as ordinary text without reviving its old controls. */
export function getLegacyActivityText(turn: Turn): string { return legacyActivityText(turn); }

/** A retry is safe only while the exact authored draft still matches its snapshot. */
export function canRetryPendingChat(request: Pick<PendingChatRequest, 'draftSnapshot' | 'attachment' | 'documentAttachment' | 'documentContextAttachment'> | null, draft: string, attachmentUri?: string, documentUri?: string): boolean {
  const requestDocumentUri = request?.documentAttachment?.uri ?? request?.documentContextAttachment?.uri;
  return Boolean(request && request.draftSnapshot === draft && request.attachment?.uri === attachmentUri && requestDocumentUri === documentUri);
}

/** Distinguish a newly attached file (shown on this turn) from inherited context (request-only). */
export function documentRequestForPrompt(selected: DocumentAttachment | undefined, hasImage: boolean, activeContext: DocumentAttachment | undefined): Pick<PendingChatRequest, 'documentAttachment' | 'documentContextAttachment'> {
  if (hasImage) return {};
  if (selected) return { documentAttachment: selected };
  return activeContext ? { documentContextAttachment: activeContext } : {};
}

/** Current composer attachment identity follows the one-attachment-per-prompt rule. */
export function documentUriForPrompt(hasImage: boolean, selectedUri?: string, activeContextUri?: string): string | undefined {
  return hasImage ? undefined : selectedUri ?? activeContextUri;
}

/** Commit context changes only after a prompt with its replacement/image succeeds. */
export function documentContextAfterSuccess(activeContext: DocumentAttachment | undefined, explicitDocument: DocumentAttachment | undefined, hasImage: boolean): DocumentAttachment | undefined {
  return explicitDocument ?? (hasImage ? undefined : activeContext);
}

/** Permanent document errors remain visible even though they cannot be retried unchanged. */
export function shouldShowChangedDraftMessage(hasPendingRequest: boolean, requestMatchesCurrent: boolean, error: string | null): boolean {
  return Boolean(error && hasPendingRequest && !requestMatchesCurrent && !error.startsWith('document_'));
}
