import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { NativeModules, Platform } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Locale, ThemeMode } from '../design/theme';
import type { LiveModelActivity } from '../liveModel/types';
import type { LiveActivityProgress } from '../learning/liveProgress';
import { decodeChatSession, type ChatSession } from './chatSession';
import { normalizeRestoredTurn, updateTurnList } from './turns';
import { quarantineRawPayload, readStoredJSON } from './storageHydration';
import { decodePersistedRichContent, type PersistedRichContent } from '../chat/richReply';
import { decodeImageAttachment, type ImageAttachment } from '../chat/imageAttachment';
import { decodeDocumentAttachment, type DocumentAttachment } from '../chat/documentAttachment';
import { createFreshChatId, prepareColdStart, restoreSavedChat } from './coldStart';

const KEY = 'assistant:first-slice:v1';
export type Turn = { id: string; prompt: string; locale: Locale; status: 'streaming' | 'complete' | 'stopped'; answer: string; imageAttachment?: ImageAttachment; documentAttachment?: DocumentAttachment; documentInfo?: { pagesRead: number | null; pagesTotal: number | null; characters: number; truncated: boolean }; rich?: PersistedRichContent; liveActivity?: LiveModelActivity; liveProgress?: LiveActivityProgress };
export type { ChatMessage, ChatRequestError, ChatSession, PendingChatRequest } from './chatSession';
export type SavedConversation = { id: string; title: string; turns: Turn[]; draft?: string; imageAttachment?: ImageAttachment; documentAttachment?: DocumentAttachment; session?: ChatSession };
type Stored = { theme: ThemeMode; locale: Locale; draft: string; imageAttachment?: ImageAttachment; documentAttachment?: DocumentAttachment; conversation: Turn[]; activeChatId: string; activeSession: ChatSession; savedConversations: SavedConversation[] };
type HydrationStatus = 'loading' | 'ready' | 'read_error' | 'parse_error';
type AppContextValue = Stored & { hydrated: boolean; hydrationStatus: HydrationStatus; retryHydration: () => void; setTheme: React.Dispatch<React.SetStateAction<ThemeMode>>; setLocale: React.Dispatch<React.SetStateAction<Locale>>; setDraft: React.Dispatch<React.SetStateAction<string>>; setImageAttachment: React.Dispatch<React.SetStateAction<ImageAttachment | undefined>>; setDocumentAttachment: React.Dispatch<React.SetStateAction<DocumentAttachment | undefined>>; setConversation: React.Dispatch<React.SetStateAction<Turn[]>>; setActiveSession: React.Dispatch<React.SetStateAction<ChatSession>>; updateTurnById: (id: string, update: (turn: Turn) => Turn) => void; startNewChat: () => void; openSavedConversation: (id: string) => void };
const defaultLocale: Locale = getLocales()[0]?.languageCode === 'de' ? 'de' : 'en';
const Context = createContext<AppContextValue | null>(null);

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
function decodeTurn(value: unknown): Turn {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.prompt !== 'string' || typeof value.answer !== 'string' || (value.locale !== 'en' && value.locale !== 'de') || !['streaming', 'complete', 'stopped'].includes(String(value.status))) throw new Error('Stored conversation turn is invalid.');
  const rich = decodePersistedRichContent(value.rich);
  const imageAttachment = decodeImageAttachment(value.imageAttachment);
  const documentAttachment = decodeDocumentAttachment(value.documentAttachment);
  let documentInfo: Turn['documentInfo'];
  if (value.documentInfo !== undefined) {
    if (!isRecord(value.documentInfo) || !Number.isInteger(value.documentInfo.characters) || (value.documentInfo.characters as number) < 1
      || typeof value.documentInfo.truncated !== 'boolean'
      || (value.documentInfo.pagesRead !== null && (!Number.isInteger(value.documentInfo.pagesRead) || (value.documentInfo.pagesRead as number) < 1))
      || (value.documentInfo.pagesTotal !== null && (!Number.isInteger(value.documentInfo.pagesTotal) || (value.documentInfo.pagesTotal as number) < 1))) throw new Error('Stored document read metadata is invalid.');
    documentInfo = { pagesRead: value.documentInfo.pagesRead as number | null, pagesTotal: value.documentInfo.pagesTotal as number | null, characters: value.documentInfo.characters as number, truncated: value.documentInfo.truncated };
  }
  return normalizeRestoredTurn({ ...(value as unknown as Turn), ...(rich ? { rich } : { rich: undefined }), ...(imageAttachment ? { imageAttachment } : {}), ...(documentAttachment ? { documentAttachment } : {}), ...(documentInfo ? { documentInfo } : {}) });
}
function decodeStored(value: unknown): Stored {
  if (!isRecord(value)) throw new Error('Stored app state is invalid.');
  if (value.theme !== undefined && value.theme !== 'dark' && value.theme !== 'light') throw new Error('Stored theme is invalid.');
  if (value.locale !== undefined && value.locale !== 'en' && value.locale !== 'de') throw new Error('Stored locale is invalid.');
  if (value.draft !== undefined && typeof value.draft !== 'string') throw new Error('Stored draft is invalid.');
  if (value.activeChatId !== undefined && typeof value.activeChatId !== 'string') throw new Error('Stored chat ID is invalid.');
  if (value.conversation !== undefined && !Array.isArray(value.conversation)) throw new Error('Stored conversation is invalid.');
  if (value.savedConversations !== undefined && !Array.isArray(value.savedConversations)) throw new Error('Stored saved chats are invalid.');
  const savedConversations = (value.savedConversations ?? []) as unknown[];
  return {
    theme: (value.theme as ThemeMode | undefined) ?? 'dark',
    locale: (value.locale as Locale | undefined) ?? defaultLocale,
    draft: (value.draft as string | undefined) ?? '',
    imageAttachment: decodeImageAttachment(value.imageAttachment),
    documentAttachment: decodeDocumentAttachment(value.documentAttachment),
    activeChatId: (value.activeChatId as string | undefined) ?? 'active-chat',
    activeSession: decodeChatSession(value.activeSession),
    conversation: ((value.conversation ?? []) as unknown[]).map(decodeTurn),
    savedConversations: savedConversations.map(item => {
      if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string' || !Array.isArray(item.turns) || (item.draft !== undefined && typeof item.draft !== 'string')) throw new Error('Stored saved chat is invalid.');
      return { id: item.id, title: item.title, draft: item.draft as string | undefined, imageAttachment: decodeImageAttachment(item.imageAttachment), documentAttachment: decodeDocumentAttachment(item.documentAttachment), session: decodeChatSession(item.session), turns: item.turns.map(decodeTurn) };
    }),
  };
}

export function AppProvider({ children }: React.PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [draft, setDraft] = useState('');
  const [imageAttachment, setImageAttachment] = useState<ImageAttachment | undefined>();
  const [documentAttachment, setDocumentAttachment] = useState<DocumentAttachment | undefined>();
  const [conversation, setConversation] = useState<Turn[]>([]);
  const [activeChatId, setActiveChatId] = useState('active-chat');
  const [activeSession, setActiveSession] = useState<ChatSession>({});
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
  const [hydrationStatus, setHydrationStatus] = useState<HydrationStatus>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const hydrated = hydrationStatus === 'ready';
  const retryHydration = useCallback(() => { setHydrationStatus('loading'); setLoadAttempt(value => value + 1); }, []);
  useEffect(() => {
    let active = true;
    void readStoredJSON(KEY, key => AsyncStorage.getItem(key), value => decodeStored(value)).then(async result => {
      if (!active) return;
      if (result.status === 'read_error') { setHydrationStatus('read_error'); return; }
      if (result.status === 'parse_error') {
        void quarantineRawPayload(KEY, result.raw, (key, raw) => AsyncStorage.setItem(key, raw));
        setHydrationStatus('parse_error'); return;
      }
      const isFreshLaunch = await shouldPrepareColdStartForLaunch();
      if (!active) return;
      const shouldPrepareColdStart = isFreshLaunch && !freshLaunchHandled;
      if (shouldPrepareColdStart) freshLaunchHandled = true;
      if (result.value) {
        const restored = shouldPrepareColdStart
          ? prepareColdStart(result.value, createFreshChatId([
              result.value.activeChatId,
              ...result.value.savedConversations.map(chat => chat.id),
            ]))
          : result.value;
        setTheme(restored.theme); setLocale(restored.locale); setDraft(restored.draft); setImageAttachment(restored.imageAttachment); setDocumentAttachment(restored.documentAttachment);
        setConversation(restored.conversation); setActiveChatId(restored.activeChatId); setActiveSession(restored.activeSession); setSavedConversations(restored.savedConversations);
      } else {
        setActiveChatId(createFreshChatId([]));
      }
      setHydrationStatus('ready');
    });
    return () => { active = false; };
  }, [loadAttempt]);
  useEffect(() => { if (!hydrated) return; const value: Stored = { theme, locale, draft, imageAttachment, documentAttachment, conversation, activeChatId, activeSession, savedConversations }; AsyncStorage.setItem(KEY, JSON.stringify(value)).catch(() => undefined); }, [theme, locale, draft, imageAttachment, documentAttachment, conversation, activeChatId, activeSession, savedConversations, hydrated]);
  const updateTurnById = useCallback((id: string, update: (turn: Turn) => Turn) => {
    setConversation(current => updateTurnList(current, id, update));
    setSavedConversations(current => current.map(chat => {
      const turns = updateTurnList(chat.turns, id, update);
      return turns === chat.turns ? chat : { ...chat, turns };
    }));
  }, []);
  const startNewChat = () => {
    const nextChatId = `chat-${Date.now()}`;
    if (conversation.length || draft || imageAttachment || documentAttachment || activeSession.sampleSourceSelected || activeSession.activeDocumentContext || activeSession.pendingChatRequest || activeSession.pendingLiveRequest) {
      const title = conversation[0]?.prompt ?? activeSession.pendingChatRequest?.prompt ?? activeSession.pendingLiveRequest?.request.prompt ?? (draft.trim().slice(0, 60) || (documentAttachment?.name || activeSession.activeDocumentContext?.name || (imageAttachment ? locale === 'de' ? 'Bild' : 'Image' : activeSession.sampleSourceSelected ? locale === 'de' ? 'Gespeicherter Chat' : 'Saved conversation' : 'New chat')));
      const turns = conversation.map(turn => turn.status === 'streaming' ? { ...turn, status: 'stopped' as const } : turn);
      setSavedConversations(previous => [{ id: activeChatId, title, turns, draft, imageAttachment, documentAttachment, session: activeSession }, ...previous.filter(chat => chat.id !== activeChatId)].slice(0, 20));
    }
    // Carry an unsent draft into the new chat. Never clear text just because the
    // learner chose New Chat; it is persisted with this newly active conversation.
    setActiveChatId(nextChatId);
    setActiveSession({});
    setConversation([]);
  };
  const openSavedConversation = (id: string) => {
    const saved = savedConversations.find(chat => chat.id === id);
    if (!saved) return;
    const outgoingTitle = conversation[0]?.prompt ?? activeSession.pendingChatRequest?.prompt ?? activeSession.pendingLiveRequest?.request.prompt ?? (draft.trim().slice(0, 60) || (documentAttachment?.name || activeSession.activeDocumentContext?.name || (imageAttachment ? locale === 'de' ? 'Bild' : 'Image' : activeSession.sampleSourceSelected ? locale === 'de' ? 'Gespeicherter Chat' : 'Saved conversation' : 'New chat')));
    let chatsAfterArchive = savedConversations;
    if ((conversation.length || draft || imageAttachment || documentAttachment || activeSession.sampleSourceSelected || activeSession.activeDocumentContext || activeSession.pendingChatRequest || activeSession.pendingLiveRequest) && activeChatId !== saved.id) {
      const turns = conversation.map(turn => turn.status === 'streaming' ? { ...turn, status: 'stopped' as const } : turn);
      chatsAfterArchive = [{ id: activeChatId, title: outgoingTitle, turns, draft, imageAttachment, documentAttachment, session: activeSession }, ...savedConversations.filter(chat => chat.id !== activeChatId)].slice(0, 20);
    }
    const restored = restoreSavedChat({ theme, locale, draft, imageAttachment, documentAttachment, conversation, activeChatId, activeSession, savedConversations: chatsAfterArchive }, id);
    setConversation(restored.conversation);
    setDraft(restored.draft);
    setImageAttachment(restored.imageAttachment);
    setDocumentAttachment(restored.documentAttachment);
    setActiveChatId(restored.activeChatId);
    setActiveSession(restored.activeSession);
    setSavedConversations(restored.savedConversations);
  };
  const value = useMemo(() => ({ theme, locale, draft, imageAttachment, documentAttachment, conversation, activeChatId, activeSession, savedConversations, hydrated, hydrationStatus, retryHydration, setTheme, setLocale, setDraft, setImageAttachment, setDocumentAttachment, setConversation, setActiveSession, updateTurnById, startNewChat, openSavedConversation }), [theme, locale, draft, imageAttachment, documentAttachment, conversation, activeChatId, activeSession, savedConversations, hydrated, hydrationStatus, retryHydration, updateTurnById]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAppSettings() { const value = useContext(Context); if (!value) throw new Error('AppProvider is missing'); return value; }
