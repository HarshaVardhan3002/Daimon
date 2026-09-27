import { accountStore, type Profile } from '../state/accountStore';
import { appStore } from '../state/appStore';
import { track } from './telemetry';

/**
 * Probes that watch state transitions instead of wrapping every call site: effort, theme and language changes,
 * opening/creating/deleting chats, sign-in/out, memory and profile edits. Anything a store cannot see (sends, replies,
 * copies, card interactions) is tracked where it happens.
 */
const PROFILE_FIELDS: (keyof Profile)[] = ['nickname', 'occupation', 'about', 'customInstructions', 'baseStyle', 'warmth', 'enthusiasm', 'headers', 'emoji'];
const DAY_MS = 24 * 60 * 60 * 1000;

let started = false;

export function startProbes(): void {
  if (started) return;
  started = true;

  let app = appStore.get();
  appStore.subscribe(() => {
    const next = appStore.get();
    const prev = app;
    app = next;
    if (prev.hydrationStatus !== 'ready') return;
    if (next.reasoningMode !== prev.reasoningMode) track('effort_change', { from: prev.reasoningMode, to: next.reasoningMode });
    if (next.theme !== prev.theme) track('theme_change', { to: next.theme });
    if (next.locale !== prev.locale) track('locale_change', { to: next.locale });
    // New, deleted and branched chats also swap the active id, so they are tracked where they happen.
    if (next.activeChatId !== prev.activeChatId) {
      const reopened = prev.savedConversations.find(chat => chat.id === next.activeChatId);
      if (reopened) track('chat_open', { turns: reopened.turns.length, ageDays: Math.floor((Date.now() - (reopened.updatedAt ?? Date.now())) / DAY_MS) });
    } else {
      // Only new files count: switching chats restores that chat's unsent attachments.
      if (next.imageAttachment && next.imageAttachment.uri !== prev.imageAttachment?.uri) track('attach', { kind: next.imageAttachment.name === 'camera.jpg' ? 'camera' : 'photo', ok: true });
      if (next.documentAttachment && next.documentAttachment.uri !== prev.documentAttachment?.uri) track('attach', { kind: 'file', ok: true });
    }
  });

  let account = accountStore.get();
  accountStore.subscribe(() => {
    const next = accountStore.get();
    const prev = account;
    account = next;
    if (prev.status !== 'ready') return;
    if (!prev.session && next.session) track('sign_in', {});
    if (prev.session && !next.session) track('sign_out', {});
    if (next.memories.length < prev.memories.length) track('memory_delete', { all: next.memories.length === 0 && prev.memories.length > 1 });
    if (next.profile !== prev.profile) {
      if (next.profile.memoryEnabled !== prev.profile.memoryEnabled) track('memory_toggle', { on: next.profile.memoryEnabled });
      for (const field of PROFILE_FIELDS) if (next.profile[field] !== prev.profile[field]) track('profile_change', { field });
    }
  });
}
