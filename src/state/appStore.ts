import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { AppState, NativeModules, Platform } from 'react-native';
import type { Locale } from '../design/tokens';
import { isReasoningMode, type ReasoningMode } from '../chat/reasoningEffort';
import { decodePersistedRichContent } from '../chat/richReply';
import { decodeImageAttachment, type ImageAttachment } from '../chat/imageAttachment';
import { decodeDocumentAttachment, type DocumentAttachment } from '../chat/documentAttachment';
import { decodeChatSession, type ChatRequestError, type ChatSession } from './chatSession';
import { normalizeRestoredTurn, updateTurnList } from './turns';
import { quarantineRawPayload, readStoredJSON } from './storageHydration';
import { createFreshChatId, prepareColdStart, restoreSavedChat } from './coldStart';
import { createStore, useStore } from './store';
import type { AnswerSource, HydrationStatus, SavedConversation, Stored, Turn } from './types';

const KEY = 'assistant:first-slice:v1';
const MAX_SAVED = 20;
const PERSIST_DELAY_MS = 350;
const defaultLocale: Locale = getLocales()[0]?.languageCode === 'de' ? 'de' : 'en';

export type AppShape = Stored & { hydrationStatus: HydrationStatus };
type Update<T> = T | ((previous: T) => T);
const apply = <T,>(update: Update<T>, previous: T): T => typeof update === 'function' ? (update as (value: T) => T)(previous) : update;

export const appStore = createStore<AppShape>({
  theme: 'dark', locale: defaultLocale, reasoningMode: 'default', preferredEffort: 'medium', draft: '',
  conversation: [], activeChatId: 'active-chat', activeSession: {}, savedConversations: [], hydrationStatus: 'loading',
});
export function useApp<S>(selector: (state: AppShape) => S): S { return useStore(appStore, selector); }

// ---------------------------------------------------------------------------------------------------------------
// Decoding. Unknown optional fields are dropped rather than failing the whole load, because a failed load
// quarantines the stored chats and shows the recovery screen.

type DaimonLaunchStateBridge = { isTaskRestored?: () => Promise<boolean> };
let coldStartDecision: Promise<boolean> | undefined;
let freshLaunchHandled = false;

/** Resolve once per JS runtime; bridge errors fail safe to resume. */
function shouldPrepareColdStartForLaunch(): Promise<boolean> {
  coldStartDecision ??= Platform.OS === 'android'
    ? Promise.resolve().then(async () => {
      const bridge = NativeModules.DaimonLaunchState as DaimonLaunchStateBridge | undefined;
      if (typeof bridge?.isTaskRestored !== 'function') throw new Error('Daimon launch-state bridge is unavailable.');
      return (await bridge.isTaskRestored()) === false;
    }).catch(() => false)
    : Promise.resolve(true);
  return coldStartDecision;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
const REQUEST_ERRORS = ['disconnected', 'failed', 'cancelled', 'interrupted', 'reasoning_unavailable', 'reasoning_image_unsupported', 'document_too_large', 'document_too_many_pages', 'document_password', 'document_no_text', 'document_invalid', 'document_encoding'];

function decodeSources(value: unknown): AnswerSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources = value.filter((item): item is AnswerSource => isRecord(item) && typeof item.id === 'string' && typeof item.title === 'string' && ['web', 'chat', 'file'].includes(String(item.kind)));
  return sources.length ? sources : undefined;
}

function decodeTurn(value: unknown): Turn {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.prompt !== 'string' || typeof value.answer !== 'string' || (value.locale !== 'en' && value.locale !== 'de') || !['streaming', 'complete', 'stopped', 'failed'].includes(String(value.status))) throw new Error('Stored conversation turn is invalid.');
  const requestError = REQUEST_ERRORS.includes(String(value.requestError)) ? value.requestError as ChatRequestError : undefined;
  const rich = decodePersistedRichContent(value.rich);
  const imageAttachment = decodeImageAttachment(value.imageAttachment);
  const documentAttachment = decodeDocumentAttachment(value.documentAttachment);
  let documentInfo: Turn['documentInfo'];
  if (value.documentInfo !== undefined) {
    const info = value.documentInfo;
    if (!isRecord(info) || !Number.isInteger(info.characters) || (info.characters as number) < 1 || typeof info.truncated !== 'boolean'
      || (info.pagesRead !== null && (!Number.isInteger(info.pagesRead) || (info.pagesRead as number) < 1))
      || (info.pagesTotal !== null && (!Number.isInteger(info.pagesTotal) || (info.pagesTotal as number) < 1))) throw new Error('Stored document read metadata is invalid.');
    documentInfo = { pagesRead: info.pagesRead as number | null, pagesTotal: info.pagesTotal as number | null, characters: info.characters as number, truncated: info.truncated };
  }
  const number = (field: unknown) => typeof field === 'number' && Number.isFinite(field) && field >= 0 ? field : undefined;
  const reasoningEffort = value.reasoningEffort === 'low' || value.reasoningEffort === 'medium' || value.reasoningEffort === 'high' ? value.reasoningEffort : undefined;
  const turn: Turn = {
    ...(value as unknown as Turn),
    requestError, rich, createdAt: number(value.createdAt), elapsedMs: number(value.elapsedMs), reasoningEffort, sources: decodeSources(value.sources),
    ...(imageAttachment ? { imageAttachment } : { imageAttachment: undefined }),
    ...(documentAttachment ? { documentAttachment } : { documentAttachment: undefined }),
    ...(documentInfo ? { documentInfo } : { documentInfo: undefined }),
  };
  return normalizeRestoredTurn(turn);
}

function decodeStored(value: unknown): Stored {
  if (!isRecord(value)) throw new Error('Stored app state is invalid.');
  if (value.theme !== undefined && value.theme !== 'dark' && value.theme !== 'light' && value.theme !== 'system') throw new Error('Stored theme is invalid.');
  if (value.locale !== undefined && value.locale !== 'en' && value.locale !== 'de') throw new Error('Stored locale is invalid.');
  if (value.reasoningMode !== undefined && !isReasoningMode(value.reasoningMode)) throw new Error('Stored reasoning mode is invalid.');
  if (value.draft !== undefined && typeof value.draft !== 'string') throw new Error('Stored draft is invalid.');
  if (value.activeChatId !== undefined && typeof value.activeChatId !== 'string') throw new Error('Stored chat ID is invalid.');
  if (value.conversation !== undefined && !Array.isArray(value.conversation)) throw new Error('Stored conversation is invalid.');
  if (value.savedConversations !== undefined && !Array.isArray(value.savedConversations)) throw new Error('Stored saved chats are invalid.');
  const preferredEffort = value.preferredEffort === 'instant' || value.preferredEffort === 'medium' || value.preferredEffort === 'high' ? value.preferredEffort : 'medium';
  return {
    theme: (value.theme as Stored['theme'] | undefined) ?? 'dark',
    locale: (value.locale as Locale | undefined) ?? defaultLocale,
    reasoningMode: (value.reasoningMode as ReasoningMode | undefined) ?? 'default',
    preferredEffort,
    draft: (value.draft as string | undefined) ?? '',
    imageAttachment: decodeImageAttachment(value.imageAttachment),
    documentAttachment: decodeDocumentAttachment(value.documentAttachment),
    activeChatId: (value.activeChatId as string | undefined) ?? 'active-chat',
    activeTitle: typeof value.activeTitle === 'string' && value.activeTitle.trim() ? value.activeTitle : undefined,
    activeSession: decodeChatSession(value.activeSession),
    conversation: ((value.conversation ?? []) as unknown[]).map(decodeTurn),
    savedConversations: ((value.savedConversations ?? []) as unknown[]).map(item => {
      if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string' || !Array.isArray(item.turns) || (item.draft !== undefined && typeof item.draft !== 'string')) throw new Error('Stored saved chat is invalid.');
      return { id: item.id, title: item.title, draft: item.draft as string | undefined, imageAttachment: decodeImageAttachment(item.imageAttachment), documentAttachment: decodeDocumentAttachment(item.documentAttachment), session: decodeChatSession(item.session), turns: item.turns.map(decodeTurn), updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : undefined };
    }),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Hydration and persistence.

let loadAttempt = 0;
/** Load stored chats and preferences. Safe to call again after a failure. */
export async function hydrateApp(): Promise<void> {
  const attempt = ++loadAttempt;
  appStore.set({ hydrationStatus: 'loading' });
  const result = await readStoredJSON(KEY, key => AsyncStorage.getItem(key), decodeStored);
  if (attempt !== loadAttempt) return;
  if (result.status === 'read_error') { appStore.set({ hydrationStatus: 'read_error' }); return; }
  if (result.status === 'parse_error') {
    void quarantineRawPayload(KEY, result.raw, (key, raw) => AsyncStorage.setItem(key, raw));
    appStore.set({ hydrationStatus: 'parse_error' });
    return;
  }
  const isFreshLaunch = await shouldPrepareColdStartForLaunch();
  if (attempt !== loadAttempt) return;
  const shouldPrepareColdStart = isFreshLaunch && !freshLaunchHandled;
  if (shouldPrepareColdStart) freshLaunchHandled = true;
  if (!result.value) {
    appStore.set({ activeChatId: createFreshChatId([]), hydrationStatus: 'ready' });
    return;
  }
  const stored = result.value;
  const restored = shouldPrepareColdStart
    ? { ...stored, ...prepareColdStart({ ...stored, draft: stored.draft }, createFreshChatId([stored.activeChatId, ...stored.savedConversations.map(chat => chat.id)])), activeTitle: undefined }
    : stored;
  if (shouldPrepareColdStart && stored.activeTitle && restored.savedConversations[0]?.id === stored.activeChatId) {
    restored.savedConversations = [{ ...restored.savedConversations[0], title: stored.activeTitle }, ...restored.savedConversations.slice(1)];
  }
  appStore.set({ ...restored, hydrationStatus: 'ready' });
}

const PERSISTED: (keyof Stored)[] = ['theme', 'locale', 'reasoningMode', 'preferredEffort', 'draft', 'imageAttachment', 'documentAttachment', 'conversation', 'activeChatId', 'activeTitle', 'activeSession', 'savedConversations'];
let lastWritten: Partial<Stored> = {};
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function snapshot(): Stored {
  const state = appStore.get();
  const value = {} as Record<string, unknown>;
  for (const key of PERSISTED) value[key] = state[key];
  return value as Stored;
}
/** Write now; used when the app goes to the background so nothing typed is lost. */
export function flushAppState(): void {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  if (appStore.get().hydrationStatus !== 'ready') return;
  const value = snapshot();
  if (PERSISTED.every(key => Object.is(value[key], lastWritten[key]))) return;
  lastWritten = value;
  AsyncStorage.setItem(KEY, JSON.stringify(value)).catch(() => undefined);
}
appStore.subscribe(() => {
  const state = appStore.get();
  if (state.hydrationStatus !== 'ready') return;
  if (PERSISTED.every(key => Object.is(state[key], lastWritten[key]))) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(flushAppState, PERSIST_DELAY_MS);
});
AppState.addEventListener('change', next => { if (next !== 'active') flushAppState(); });

// ---------------------------------------------------------------------------------------------------------------
// Actions. They read the current state when called, so callbacks never hold a stale copy.

export const setTheme = (theme: Stored['theme']) => appStore.set({ theme });
export const setLocale = (locale: Locale) => appStore.set({ locale });
export const setReasoningMode = (mode: ReasoningMode) => appStore.set(mode === 'default' ? { reasoningMode: mode } : { reasoningMode: mode, preferredEffort: mode });
/** Think harder on restores the last effort; off returns to the default model. */
export const setThinkHarder = (on: boolean) => appStore.set(state => ({ reasoningMode: on ? state.preferredEffort : 'default' }));
export const setDraft = (draft: string) => appStore.set({ draft });
export const setImageAttachment = (update: Update<ImageAttachment | undefined>) => appStore.set(state => ({ imageAttachment: apply(update, state.imageAttachment) }));
export const setDocumentAttachment = (update: Update<DocumentAttachment | undefined>) => appStore.set(state => ({ documentAttachment: apply(update, state.documentAttachment) }));
export const setConversation = (update: Update<Turn[]>) => appStore.set(state => ({ conversation: apply(update, state.conversation) }));
export const setActiveSession = (update: Update<ChatSession>) => appStore.set(state => ({ activeSession: apply(update, state.activeSession) }));

export function updateTurnById(id: string, update: (turn: Turn) => Turn): void {
  appStore.set(state => ({
    conversation: updateTurnList(state.conversation, id, update),
    savedConversations: state.savedConversations.map(chat => {
      const turns = updateTurnList(chat.turns, id, update);
      return turns === chat.turns ? chat : { ...chat, turns };
    }),
  }));
}

/** Title for the active chat: the name the person gave it, else its first prompt or attachment. */
export function activeChatTitle(state: Pick<AppShape, 'activeTitle' | 'conversation' | 'activeSession' | 'draft' | 'documentAttachment' | 'imageAttachment' | 'locale'>): string {
  if (state.activeTitle) return state.activeTitle;
  const de = state.locale === 'de';
  return state.conversation[0]?.prompt
    ?? state.activeSession.pendingChatRequest?.prompt
    ?? state.activeSession.pendingLiveRequest?.request.prompt
    ?? (state.draft.trim().slice(0, 60) || state.documentAttachment?.name || state.activeSession.activeDocumentContext?.name
      || (state.imageAttachment ? (de ? 'Bild' : 'Image') : state.activeSession.sampleSourceSelected ? (de ? 'Gespeicherter Chat' : 'Saved conversation') : (de ? 'Neuer Chat' : 'New chat')));
}

export function hasActiveContent(state: AppShape): boolean {
  const session = state.activeSession;
  return Boolean(state.conversation.length || state.draft || state.imageAttachment || state.documentAttachment || session.sampleSourceSelected || session.activeDocumentContext || session.pendingChatRequest || session.pendingLiveRequest);
}

function archiveActive(state: AppShape): SavedConversation[] {
  if (!hasActiveContent(state)) return state.savedConversations;
  const turns = state.conversation.map(turn => turn.status === 'streaming' ? { ...turn, status: 'stopped' as const } : turn);
  const entry: SavedConversation = { id: state.activeChatId, title: activeChatTitle(state), turns, draft: state.draft, imageAttachment: state.imageAttachment, documentAttachment: state.documentAttachment, session: state.activeSession, updatedAt: Date.now() };
  return [entry, ...state.savedConversations.filter(chat => chat.id !== state.activeChatId)].slice(0, MAX_SAVED);
}

/** Archive the active chat into Recents and open a blank one. An unsent draft carries over. */
export function startNewChat(): void {
  appStore.set(state => ({
    savedConversations: archiveActive(state),
    activeChatId: createFreshChatId([state.activeChatId, ...state.savedConversations.map(chat => chat.id)]),
    activeTitle: undefined,
    activeSession: {},
    conversation: [],
  }));
}

export function openSavedConversation(id: string): void {
  const state = appStore.get();
  if (id === state.activeChatId || !state.savedConversations.some(chat => chat.id === id)) return;
  const archived = archiveActive(state);
  const restored = restoreSavedChat({ ...state, savedConversations: archived }, id);
  const title = state.savedConversations.find(chat => chat.id === id)?.title;
  appStore.set({
    conversation: restored.conversation, draft: restored.draft, imageAttachment: restored.imageAttachment, documentAttachment: restored.documentAttachment,
    activeChatId: restored.activeChatId, activeSession: restored.activeSession, savedConversations: restored.savedConversations, activeTitle: title,
  });
}

export function renameChat(id: string, title: string): void {
  const clean = title.trim().slice(0, 120);
  if (!clean) return;
  appStore.set(state => id === state.activeChatId
    ? { activeTitle: clean }
    : { savedConversations: state.savedConversations.map(chat => chat.id === id ? { ...chat, title: clean } : chat) });
}

/** Delete a chat. Deleting the open chat leaves a blank one in its place (its draft goes with it). */
export function deleteChat(id: string): void {
  appStore.set(state => id === state.activeChatId
    ? { activeChatId: createFreshChatId([state.activeChatId, ...state.savedConversations.map(chat => chat.id)]), activeTitle: undefined, activeSession: {}, conversation: [], draft: '', imageAttachment: undefined, documentAttachment: undefined }
    : { savedConversations: state.savedConversations.filter(chat => chat.id !== id) });
}

/** Copy the conversation up to and including `turnId` into a new chat, leaving the original in Recents. */
export function branchFromTurn(turnId: string): boolean {
  const state = appStore.get();
  const index = state.conversation.findIndex(turn => turn.id === turnId);
  if (index < 0) return false;
  const turns = state.conversation.slice(0, index + 1).filter(turn => turn.status === 'complete');
  if (!turns.length) return false;
  appStore.set({
    savedConversations: archiveActive(state),
    activeChatId: createFreshChatId([state.activeChatId, ...state.savedConversations.map(chat => chat.id)]),
    activeTitle: undefined,
    activeSession: {},
    conversation: turns,
  });
  return true;
}
