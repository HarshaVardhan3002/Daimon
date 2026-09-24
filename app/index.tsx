import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Speech from 'expo-speech';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, BackHandler, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { copy, themes } from '../src/design/theme';
import type { Locale, ThemeMode } from '../src/design/theme';
import { ChatClientError, sendChatCompletion } from '../src/chat/modelClient';
import { ReadableMessage } from '../src/chat/ReadableMessage';
import { QuizCard } from '../src/chat/QuizCard';
import { GeneratedImage } from '../src/chat/GeneratedImage';
import { persistRichReply } from '../src/chat/richReply';
import { validateQuizCardData } from '../src/chat/quizCardData';
import { imageAttachmentDataUri, isSupportedImage, persistImageAttachment, type ImageAttachment } from '../src/chat/imageAttachment';
import { DocumentAttachmentError, documentAttachmentPayload, persistDocumentAttachment, supportedDocumentMimeType } from '../src/chat/documentAttachment';
import { useAppSettings } from '../src/state/AppState';
import type { ChatRequestError, PendingChatRequest, Turn } from '../src/state/AppState';
import { buildChatContext, documentContextAfterSuccess, documentRequestForPrompt, getLegacyActivityText } from '../src/state/chatHistory';
import { beginChatSend, completePendingTurn, failPendingTurn, forgetRetryableRequest, isRegeneratingTurn, rememberRetryableRequest, shouldShowGlobalChatError, updatePendingTurn } from '../src/state/chatRequestFlow';
import { updateTurnList } from '../src/state/turns';

const CHAT_PROXY_URL = 'http://127.0.0.1:18765';

const errorText = (locale: Locale, error: ChatRequestError) => {
  if (error === 'disconnected') return locale === 'de' ? 'Daimon ist gerade nicht erreichbar. Deine Nachricht bleibt im Chat und kann erneut gesendet werden.' : 'Daimon can’t be reached right now. Your message stays in the chat and can be retried.';
  if (error === 'cancelled') return locale === 'de' ? 'Antwort angehalten. Deine Nachricht bleibt im Chat und kann erneut gesendet werden.' : 'Response stopped. Your message stays in the chat and can be retried.';
  if (error === 'interrupted') return locale === 'de' ? 'Die Antwort wurde unterbrochen. Du kannst es erneut versuchen.' : 'The response was interrupted. You can try again.';
  if (error === 'document_too_large') return locale === 'de' ? 'Die Datei ist größer als 8 MiB. Wähle eine kleinere Datei aus.' : 'This file is larger than 8 MiB. Choose a smaller file.';
  if (error === 'document_too_many_pages') return locale === 'de' ? 'Das PDF hat mehr als 60 Seiten. Teile es in kleinere Dateien auf.' : 'This PDF has more than 60 pages. Split it into smaller files.';
  if (error === 'document_password') return locale === 'de' ? 'Dieses PDF ist passwortgeschützt. Entferne den Passwortschutz und füge die Datei erneut hinzu.' : 'This PDF is password-protected. Remove the password and attach it again.';
  if (error === 'document_no_text') return locale === 'de' ? 'In dieser Datei wurde kein lesbarer Text gefunden. Gescannte PDFs können noch nicht per OCR gelesen werden.' : 'No selectable text was found. Scanned PDFs are not supported because OCR is not available yet.';
  if (error === 'document_encoding') return locale === 'de' ? 'Die Textdatei ist nicht UTF-8-codiert. Speichere sie als UTF-8 und füge sie erneut hinzu.' : 'This text file is not UTF-8 encoded. Save it as UTF-8 and attach it again.';
  if (error === 'document_invalid') return locale === 'de' ? 'Die Datei konnte nicht gelesen werden. Exportiere sie erneut und füge die neue Datei hinzu.' : 'This file could not be read. Export it again and attach the new file.';
  return locale === 'de' ? 'Die Antwort konnte nicht geladen werden. Versuche es erneut.' : 'The response couldn’t be loaded. Try again.';
};

export default function HomeScreen() {
  const { theme, locale, draft, imageAttachment, documentAttachment, conversation, savedConversations, activeChatId, activeSession, hydrated, hydrationStatus, retryHydration, setDraft, setImageAttachment, setDocumentAttachment, setConversation, setActiveSession, setTheme, setLocale, startNewChat, openSavedConversation, updateTurnById } = useAppSettings();
  const t = copy[locale]; const c = themes[theme]; const insets = useSafeAreaInsets(); const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false); const [chatActionsOpen, setChatActionsOpen] = useState(false); const [moreTurnId, setMoreTurnId] = useState<string | null>(null); const [speakingTurnId, setSpeakingTurnId] = useState<string | null>(null); const [query, setQuery] = useState(''); const [notice, setNotice] = useState(''); const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [requestError, setRequestError] = useState<ChatRequestError | null>(null);
  const requestRef = useRef<PendingChatRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const speechRunRef = useRef(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false); const [busyCopy, setBusyCopy] = useState(false);
  const scrollRef = useRef<ScrollView>(null); const inputRef = useRef<TextInput>(null); const followsBottom = useRef(true);
  const drawerWidth = Math.round(width * 0.8); const drawerProgress = useSharedValue(0); const gestureStartX = useSharedValue(0);
  const legacyRequestPending = Boolean(activeSession.pendingLiveRequest);

  useEffect(() => {
    if (!hydrated) return;
    const pending = activeSession.pendingChatRequest;
    if (!pending) { requestRef.current = null; setRequestStatus('idle'); setRequestError(null); return; }
    requestRef.current = pending; setRequestError(pending.error ?? 'interrupted'); setRequestStatus('error');
  }, [hydrated, activeChatId]);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => undefined); const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion); return () => sub.remove(); }, []);
  useEffect(() => { const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true)); const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false)); return () => { show.remove(); hide.remove(); }; }, []);
  useEffect(() => () => { abortRef.current?.abort(); speechRunRef.current += 1; void Speech.stop(); if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current); }, []);
  useEffect(() => { speechRunRef.current += 1; setSpeakingTurnId(null); setMoreTurnId(null); setChatActionsOpen(false); void Speech.stop(); }, [activeChatId]);
  useEffect(() => { drawerProgress.value = withTiming(drawerOpen ? 1 : 0, { duration: reducedMotion ? 1 : drawerOpen ? 240 : 190, easing: Easing.out(Easing.cubic) }); }, [drawerOpen, reducedMotion, drawerProgress]);
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (attachmentSheetOpen) { setAttachmentSheetOpen(false); return true; }
      if (drawerOpen) { setDrawerOpen(false); Keyboard.dismiss(); return true; }
      if (profileOpen) { setProfileOpen(false); return true; }
      if (keyboardVisible) { Keyboard.dismiss(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [attachmentSheetOpen, drawerOpen, profileOpen, keyboardVisible]));

  const showNotice = useCallback((message: string) => { setNotice(message); if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current); noticeTimerRef.current = setTimeout(() => setNotice(''), 1800); }, []);
  const runChatRequest = useCallback(async (request: PendingChatRequest) => {
    if (abortRef.current || requestRef.current?.status === 'loading') return;
    const previousRequest = requestRef.current;
    requestRef.current = { ...request, status: 'loading', error: undefined };
    const activeRequest = requestRef.current;
    setActiveSession(current => {
      let retryable = current.retryableChatRequests;
      if (previousRequest && previousRequest.pendingTurnId !== activeRequest.pendingTurnId) retryable = rememberRetryableRequest(retryable, previousRequest);
      retryable = forgetRetryableRequest(retryable, activeRequest.pendingTurnId ?? '');
      return { ...current, retryableChatRequests: retryable.length ? retryable : undefined, pendingChatRequest: activeRequest };
    });
    setRequestStatus('loading'); setRequestError(null);
    const controller = new AbortController(); abortRef.current = controller;
    const requestDocument = request.documentAttachment ?? request.documentContextAttachment;
    try {
      const lastMessage = request.messages[request.messages.length - 1];
      const messages = requestDocument
        ? [...request.messages.slice(0, -1), { ...lastMessage, document: await documentAttachmentPayload(requestDocument) }]
        : request.attachment
          ? [...request.messages.slice(0, -1), { ...lastMessage, image: await imageAttachmentDataUri(request.attachment) }]
          : request.messages;
      const result = await sendChatCompletion(messages, { baseUrl: CHAT_PROXY_URL, signal: controller.signal });
      const id = request.pendingTurnId ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const rich = result.message.rich ? await persistRichReply(result.message.rich, id) : undefined;
      const turn: Turn = { id, prompt: request.prompt, locale: request.locale, status: 'complete', answer: result.message.content, ...(request.attachment ? { imageAttachment: request.attachment } : {}), ...(request.documentAttachment ? { documentAttachment: request.documentAttachment } : {}), ...(request.documentAttachment && result.documentInfo ? { documentInfo: result.documentInfo } : {}), ...(rich ? { rich } : {}) };
      followsBottom.current = true;
      setConversation(previous => {
        if (request.pendingTurnId) return completePendingTurn(previous, turn);
        const replacementIndex = request.replacementTurnId ? previous.findIndex(item => item.id === request.replacementTurnId) : -1;
        if (replacementIndex === previous.length - 1 && replacementIndex >= 0) return [...previous.slice(0, replacementIndex), turn];
        return [...previous, turn];
      });
      if (requestRef.current?.pendingTurnId === request.pendingTurnId) requestRef.current = null;
      setActiveSession(current => ({ ...current, activeDocumentContext: documentContextAfterSuccess(current.activeDocumentContext, request.documentAttachment, Boolean(request.attachment)), retryableChatRequests: forgetRetryableRequest(current.retryableChatRequests, request.pendingTurnId ?? ''), pendingChatRequest: current.pendingChatRequest?.pendingTurnId === request.pendingTurnId ? undefined : current.pendingChatRequest }));
      setRequestStatus('idle'); setRequestError(null);
    } catch (error) {
      const cancelled = (error as { name?: string } | null)?.name === 'AbortError';
      const disconnected = error instanceof ChatClientError && error.code === 'PROXY_UNREACHABLE';
      const code = error instanceof ChatClientError || error instanceof DocumentAttachmentError ? error.code : '';
      const documentError: ChatRequestError | undefined = code === 'DOCUMENT_TOO_MANY_PAGES' ? 'document_too_many_pages'
        : code === 'DOCUMENT_PASSWORD' ? 'document_password'
          : code === 'DOCUMENT_NO_TEXT' ? 'document_no_text'
            : code === 'DOCUMENT_ENCODING' ? 'document_encoding'
              : code === 'DOCUMENT_INVALID' ? 'document_invalid'
              : (code === 'DOCUMENT_TOO_LARGE' || (code === 'REQUEST_TOO_LARGE' && Boolean(requestDocument))) ? 'document_too_large' : undefined;
      const kind: ChatRequestError = cancelled ? 'cancelled' : disconnected ? 'disconnected' : documentError ?? 'failed';
      const failed: PendingChatRequest = { ...request, status: 'error', error: kind };
      requestRef.current = failed; setActiveSession(current => ({ ...current, pendingChatRequest: failed }));
      if (request.pendingTurnId) setConversation(previous => failPendingTurn(previous, request.pendingTurnId!, kind));
      setRequestError(kind); setRequestStatus('error');
    } finally { if (abortRef.current === controller) abortRef.current = null; }
  }, [setActiveSession, setConversation]);

  const send = useCallback(() => {
    const draftSnapshot = draft; const prompt = draftSnapshot.trim() || (documentAttachment ? locale === 'de' ? 'Fasse diese Datei zusammen.' : 'Summarize this file.' : locale === 'de' ? 'Was ist auf diesem Bild zu sehen?' : 'What is in this image?');
    if ((!draftSnapshot.trim() && !imageAttachment && !documentAttachment) || abortRef.current || requestRef.current?.status === 'loading') return;
    const requestDocument = documentRequestForPrompt(documentAttachment, Boolean(imageAttachment), activeSession.activeDocumentContext);
    const pendingTurnId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const request: PendingChatRequest = { messages: buildChatContext(conversation, prompt), prompt, locale, draftSnapshot, pendingTurnId, ...(imageAttachment ? { attachment: imageAttachment } : {}), ...requestDocument, status: 'loading' };
    const sendStart = beginChatSend(request, pendingTurnId);
    setConversation(previous => [...previous, sendStart.turn]);
    setDraft(sendStart.composerDraft);
    setImageAttachment(current => current?.uri === sendStart.imageUri ? undefined : current);
    setDocumentAttachment(current => current?.uri === sendStart.documentUri ? undefined : current);
    void runChatRequest(request);
  }, [draft, imageAttachment, documentAttachment, activeSession.activeDocumentContext, conversation, locale, runChatRequest, setConversation, setDraft, setImageAttachment, setDocumentAttachment]);
  const retryRequest = useCallback((turnId?: string) => {
    if (abortRef.current || requestRef.current?.status === 'loading') return;
    const current = requestRef.current;
    const pending = current?.pendingTurnId === turnId || !turnId ? current
      : activeSession.retryableChatRequests?.find(item => item.pendingTurnId === turnId);
    if (!pending) return;
    if (pending.pendingTurnId) setConversation(previous => updatePendingTurn(previous, pending.pendingTurnId!, 'streaming'));
    void runChatRequest(pending);
  }, [activeSession.retryableChatRequests, runChatRequest, setConversation]);
  const stopRequest = useCallback(() => abortRef.current?.abort(), []);
  const newChat = useCallback(() => {
    startNewChat(); setDrawerOpen(false); setProfileOpen(false); Keyboard.dismiss();
  }, [startNewChat]);
  const openDrawer = useCallback(() => { Keyboard.dismiss(); setProfileOpen(false); setDrawerOpen(true); void Haptics.selectionAsync().catch(() => undefined); }, []);
  const closeDrawer = useCallback(() => { setDrawerOpen(false); setProfileOpen(false); }, []);
  const openSettings = useCallback(() => { Keyboard.dismiss(); setProfileOpen(true); setDrawerOpen(true); }, []);
  const copyAnswer = useCallback(async (text: string) => {
    if (busyCopy) return;
    setBusyCopy(true);
    try { await Clipboard.setStringAsync(text); showNotice(locale === 'de' ? 'Kopiert' : 'Copied'); }
    catch { showNotice(locale === 'de' ? 'Kopieren nicht möglich' : 'Could not copy'); }
    finally { setTimeout(() => setBusyCopy(false), 750); }
  }, [busyCopy, locale, showNotice]);
  const shareText = useCallback(async (text: string) => {
    try { await Share.share({ message: text }); }
    catch { showNotice(locale === 'de' ? 'Teilen nicht möglich' : 'Could not share'); }
  }, [locale, showNotice]);
  const readAloud = useCallback(async (turnId: string, text: string, turnLocale: Locale) => {
    if (speakingTurnId === turnId) {
      speechRunRef.current += 1; setSpeakingTurnId(null); await Speech.stop(); return;
    }
    const runId = ++speechRunRef.current;
    setSpeakingTurnId(null);
    await Speech.stop();
    if (speechRunRef.current !== runId) return;
    setSpeakingTurnId(turnId);
    Speech.speak(text, {
      language: turnLocale === 'de' ? 'de-DE' : 'en-US',
      onDone: () => { if (speechRunRef.current === runId) setSpeakingTurnId(null); },
      onStopped: () => { if (speechRunRef.current === runId) setSpeakingTurnId(null); },
      onError: () => { if (speechRunRef.current === runId) { setSpeakingTurnId(null); showNotice(locale === 'de' ? 'Vorlesen nicht möglich' : 'Could not read aloud'); } },
    });
  }, [locale, showNotice, speakingTurnId]);
  const regenerateTurn = useCallback((turn: Turn) => {
    if (requestStatus === 'loading' || conversation.at(-1)?.id !== turn.id || draft.trim() || imageAttachment || documentAttachment
      || turn.status !== 'complete' || turn.imageAttachment || turn.documentAttachment || turn.rich || turn.id.startsWith('sample-') || turn.liveActivity || turn.liveProgress || !turn.prompt.trim() || !turn.answer.trim()) return;
    const request: PendingChatRequest = {
      messages: buildChatContext(conversation.slice(0, -1), turn.prompt),
      prompt: turn.prompt,
      locale: turn.locale,
      draftSnapshot: draft,
      replacementTurnId: turn.id,
      status: 'loading',
    };
    setMoreTurnId(null);
    void runChatRequest(request);
  }, [conversation, draft, imageAttachment, documentAttachment, requestStatus, runChatRequest]);
  const shareConversation = useCallback(() => {
    const transcript = conversation.map(turn => `${locale === 'de' ? 'Du' : 'You'}: ${turn.prompt}\n\nDaimon: ${turn.answer}`).join('\n\n');
    if (transcript) void shareText(transcript);
    setChatActionsOpen(false);
  }, [conversation, locale, shareText]);

  const hasCurrentContent = Boolean(conversation.length || draft.trim() || imageAttachment || documentAttachment || activeSession.activeDocumentContext || activeSession.pendingChatRequest || activeSession.pendingLiveRequest || activeSession.sampleSourceSelected);
  const retryAllowed = Boolean(requestRef.current && !requestError?.startsWith('document_'));
  const requestErrorMessage = requestError ? errorText(locale, requestError) : '';
  const showGlobalRequestError = shouldShowGlobalChatError(requestRef.current, requestStatus === 'error' && Boolean(requestError));
  const currentTitle = conversation[0]?.prompt ?? activeSession.pendingChatRequest?.prompt ?? activeSession.pendingLiveRequest?.request.prompt ?? (draft.trim().slice(0, 60) || (documentAttachment?.name || (imageAttachment ? (locale === 'de' ? 'Bild' : 'Image') : activeSession.sampleSourceSelected ? locale === 'de' ? 'Gespeicherter Chat' : 'Saved conversation' : '')));
  const showCurrent = hasCurrentContent && currentTitle.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const filteredSaved = savedConversations.filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const isEmpty = conversation.length === 0;
  const rootStyle = useMemo(() => ({ flex: 1, backgroundColor: c.canvas }), [c.canvas]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: drawerProgress.value * 0.38 }));
  const drawerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(drawerProgress.value, [0, 1], [-drawerWidth, 0]) }] }));
  const edgeGesture = useMemo(() => Gesture.Pan().activeOffsetX(12).failOffsetY([-10, 10]).onStart(event => { gestureStartX.value = event.absoluteX; }).onEnd(event => { if (gestureStartX.value < 26 && event.translationX > 52) runOnJS(openDrawer)(); }).enabled(!drawerOpen), [drawerOpen, gestureStartX, openDrawer]);
  const drawerGesture = useMemo(() => Gesture.Pan().activeOffsetX(-12).failOffsetY([-10, 10]).onEnd(event => { if (event.translationX < -48) runOnJS(closeDrawer)(); }).enabled(drawerOpen), [closeDrawer, drawerOpen]);

  const retryableRequestForTurn = (turnId: string) => {
    const active = requestRef.current;
    if (active?.pendingTurnId === turnId && active.status === 'error') return active.error?.startsWith('document_') ? undefined : active;
    const stored = activeSession.retryableChatRequests?.find(item => item.pendingTurnId === turnId);
    return stored?.error?.startsWith('document_') ? undefined : stored;
  };

  const chooseAttachment = useCallback(async (kind: 'camera' | 'photos' | 'files') => {
    setAttachmentSheetOpen(false);
    try {
      let uri = ''; let name = ''; let mimeType: string | null | undefined; let width = 0; let height = 0; let sizeBytes: number | null | undefined;
      if (kind === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { showNotice(locale === 'de' ? 'Kamerazugriff wurde nicht erlaubt' : 'Camera access was not allowed'); return; }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0]; uri = asset.uri; name = asset.fileName || 'camera.jpg'; mimeType = asset.mimeType; width = asset.width; height = asset.height;
      } else if (kind === 'photos') {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0]; uri = asset.uri; name = asset.fileName || 'photo'; mimeType = asset.mimeType; width = asset.width; height = asset.height;
      } else {
        const result = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'application/pdf', 'text/plain', 'text/markdown'], copyToCacheDirectory: true, multiple: false });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0]; uri = asset.uri; name = asset.name; mimeType = asset.mimeType; sizeBytes = asset.size; width = 0; height = 0;
      }
      const documentMime = kind === 'files' ? supportedDocumentMimeType(mimeType, name) : undefined;
      if (documentMime) {
        const attachment = await persistDocumentAttachment(uri, name, documentMime, sizeBytes);
        setImageAttachment(undefined); setDocumentAttachment(attachment);
        return;
      }
      if (!isSupportedImage(mimeType, name)) { showNotice(locale === 'de' ? 'Bitte eine PNG- oder JPEG-Datei auswählen' : 'Choose a PNG or JPEG image'); return; }
      if (!width || !height) {
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject));
        width = dimensions.width; height = dimensions.height;
      }
      const attachment = await persistImageAttachment(uri, name, width, height);
      setDocumentAttachment(undefined); setImageAttachment(attachment);
    } catch {
      showNotice(kind === 'files'
        ? (locale === 'de' ? 'Datei konnte nicht hinzugefügt werden. Erlaubt sind PDF, TXT und Markdown bis 8 MiB.' : 'Could not attach that file. PDF, TXT, and Markdown up to 8 MiB are supported.')
        : (locale === 'de' ? 'Bild konnte nicht hinzugefügt werden' : 'Could not attach that image'));
    }
  }, [locale, setActiveSession, setDocumentAttachment, setImageAttachment, showNotice]);
  const removeImageAttachment = useCallback(() => setImageAttachment(undefined), [setImageAttachment]);
  const removeDocumentAttachment = useCallback(() => setDocumentAttachment(undefined), [setDocumentAttachment]);
  const forgetDocumentContext = useCallback(() => setActiveSession(current => ({ ...current, activeDocumentContext: undefined })), [setActiveSession]);

  const renderAnswer = (turn: Turn) => {
    const legacySample = turn.id.startsWith('sample-') && !turn.liveActivity;
    const answer = legacySample
      ? (locale === 'de' ? 'Diese gespeicherte Lernaktivität stammt aus einer früheren Version.' : 'This saved study activity comes from an earlier version.')
      : turn.answer.trim() || getLegacyActivityText(turn);
    const rich = legacySample ? undefined : turn.rich;
    const hasAnswerContent = Boolean(answer || rich);
    const saveQuiz = (update: (quiz: Extract<NonNullable<Turn['rich']>, { type: 'quiz' }>) => Extract<NonNullable<Turn['rich']>, { type: 'quiz' }>) => updateTurnById(turn.id, current => current.rich?.type === 'quiz' ? { ...current, rich: update(current.rich) } : current);
    const validatedQuiz = rich?.type === 'quiz' ? validateQuizCardData({ questions: rich.questions }) : undefined;
    return <View key={turn.id}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 10 }}><View style={{ backgroundColor: c.user, maxWidth: '84%', borderRadius: 19, paddingHorizontal: 12, paddingVertical: 11 }}>
        {turn.imageAttachment ? <Image source={{ uri: turn.imageAttachment.uri }} accessibilityLabel={locale === 'de' ? 'Angehängtes Bild' : 'Attached image'} resizeMode="cover" style={{ width: 188, height: 142, borderRadius: 12, marginBottom: 8 }} /> : null}
        {turn.documentAttachment ? <View accessible accessibilityLabel={turn.documentAttachment.name} style={{ width: '100%', maxWidth: '100%', minWidth: 0, alignSelf: 'stretch', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, backgroundColor: c.surface }}><View style={{ width: 28, height: 28, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}><Feather name="file-text" size={17} color={c.accent} /></View><Text numberOfLines={1} ellipsizeMode="middle" style={{ flex: 1, minWidth: 0, flexShrink: 1, color: c.text, fontFamily: 'Inter_500Medium', fontSize: 12 }}>{turn.documentAttachment.name}</Text></View> : null}
        <Text selectable style={{ color: c.text, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 23 }}>{turn.prompt}</Text></View></View>
      {hasAnswerContent ? <View style={{ marginTop: 20, marginBottom: 28, paddingHorizontal: 20 }}>
        {turn.documentInfo?.truncated ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: c.raised }}><Feather name="info" size={15} color={c.accent} style={{ marginTop: 2 }} /><Text style={{ flex: 1, color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 }}>{turn.documentInfo.pagesRead && turn.documentInfo.pagesTotal
          ? (locale === 'de' ? `Es wurde nur ein Teil der Datei gelesen: ${turn.documentInfo.characters} Zeichen; ${turn.documentInfo.pagesRead} von ${turn.documentInfo.pagesTotal} Seiten. Um den Rest zu besprechen, füge einen kürzeren oder extrahierten Abschnitt hinzu.` : `Only part of this file was read: ${turn.documentInfo.characters} characters; ${turn.documentInfo.pagesRead} of ${turn.documentInfo.pagesTotal} pages. To discuss the rest, attach a shorter file or an extracted section.`)
          : (locale === 'de' ? 'Es wurden nur die ersten 24.000 Zeichen der Datei gelesen. Um den Rest zu besprechen, füge einen kürzeren oder extrahierten Abschnitt hinzu.' : 'Only the first 24,000 characters of this file were read. To discuss the rest, attach a shorter file or an extracted section.')}</Text></View> : null}
        {answer ? <View accessibilityLabel={t.assistantLabel}><ReadableMessage text={answer} palette={c} /></View> : null}
        {rich?.type === 'generated_image' ? <GeneratedImage image={rich} palette={c} locale={turn.locale} showNotice={showNotice} /> : null}
        {rich?.type === 'quiz' && validatedQuiz?.ok ? <QuizCard data={validatedQuiz.data} currentIndex={rich.currentIndex} answers={rich.answers} completed={rich.completed} onAnswerChange={(questionId, choiceId) => saveQuiz(quiz => ({ ...quiz, answers: { ...quiz.answers, [questionId]: choiceId } }))} onIndexChange={currentIndex => saveQuiz(quiz => ({ ...quiz, currentIndex }))} onComplete={() => saveQuiz(quiz => ({ ...quiz, completed: true }))} palette={{ text: c.text, muted: c.muted, surface: c.canvas, line: c.line, accent: c.accent, correct: '#6CCB8A', incorrect: '#EF7777' }} /> : null}
        {answer ? <>
          <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Pressable onPress={() => void copyAnswer(answer)} accessibilityRole="button" accessibilityLabel={t.copy} style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' }}><Feather name={busyCopy ? 'check' : 'copy'} size={17} color={c.muted} /></Pressable>
            <Pressable onPress={() => void readAloud(turn.id, answer, turn.locale)} accessibilityRole="button" accessibilityLabel={speakingTurnId === turn.id ? (locale === 'de' ? 'Vorlesen anhalten' : 'Stop read aloud') : (locale === 'de' ? 'Vorlesen' : 'Read aloud')} accessibilityState={{ selected: speakingTurnId === turn.id }} style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' }}><Feather name={speakingTurnId === turn.id ? 'volume-x' : 'volume-2'} size={18} color={c.muted} /></Pressable>
            <Pressable onPress={() => setMoreTurnId(current => current === turn.id ? null : turn.id)} accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Weitere Antwortaktionen' : 'More answer actions'} accessibilityState={{ expanded: moreTurnId === turn.id }} style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' }}><Feather name="more-vertical" size={18} color={c.muted} /></Pressable>
          </View>
          {moreTurnId === turn.id ? <View style={{ alignSelf: 'flex-start', minWidth: 210, marginTop: 3, backgroundColor: c.raised, borderRadius: 16, padding: 6 }}>
            <Pressable onPress={() => { setMoreTurnId(null); void shareText(answer); }} accessibilityRole="button" style={{ minHeight: 44, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 11 }}><Feather name="share" size={16} color={c.text} /><Text style={{ color: c.text, fontFamily: 'Inter_500Medium', fontSize: 14 }}>{locale === 'de' ? 'Antwort teilen' : 'Share answer'}</Text></Pressable>
            {conversation.at(-1)?.id === turn.id && turn.status === 'complete' && !turn.imageAttachment && !turn.rich && !turn.id.startsWith('sample-') && !turn.liveActivity && !turn.liveProgress && turn.prompt.trim() && turn.answer.trim() && !draft.trim() && !imageAttachment ? <Pressable disabled={requestStatus === 'loading'} onPress={() => regenerateTurn(turn)} accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Antwort neu generieren' : 'Regenerate answer'} accessibilityState={{ disabled: requestStatus === 'loading' }} style={{ minHeight: 44, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 11, opacity: requestStatus === 'loading' ? 0.45 : 1 }}><Feather name="rotate-cw" size={16} color={c.text} /><Text style={{ color: c.text, fontFamily: 'Inter_500Medium', fontSize: 14 }}>{locale === 'de' ? 'Neu generieren' : 'Regenerate'}</Text></Pressable> : null}
          </View> : null}
        </> : null}
      </View> : null}
      {isRegeneratingTurn(requestRef.current, turn.id, requestStatus === 'loading') ? <View accessibilityLiveRegion="polite" style={{ marginTop: 12, marginBottom: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}><ActivityIndicator color={c.accent} /><Text style={{ color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 14 }}>{locale === 'de' ? 'Antwort wird neu generiert…' : 'Regenerating response…'}</Text></View> : null}
      {turn.status === 'streaming' ? <View accessibilityLiveRegion="polite" style={{ marginTop: 15, marginBottom: 24, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}><ActivityIndicator color={c.accent} /><Text style={{ color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 14 }}>{t.thinking}</Text></View> : null}
      {turn.status === 'stopped' || turn.status === 'failed' ? <View style={{ marginHorizontal: 20, marginTop: 10, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{turn.requestError ? errorText(locale, turn.requestError) : turn.status === 'stopped' ? (locale === 'de' ? 'Antwort angehalten' : 'Response stopped') : (locale === 'de' ? 'Antwort konnte nicht geladen werden' : 'Couldn’t get a response')}{!turn.requestError?.startsWith('document_') && !retryableRequestForTurn(turn.id) && turn.status === 'failed' ? (locale === 'de' ? ' · Erneut versuchen nicht mehr verfügbar' : ' · Retry is no longer available') : ''}</Text>
        {retryableRequestForTurn(turn.id) ? <Pressable disabled={requestStatus === 'loading'} onPress={() => retryRequest(turn.id)} accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Diese Nachricht erneut senden' : 'Retry this message'} accessibilityState={{ disabled: requestStatus === 'loading' }} style={{ minHeight: 44, paddingHorizontal: 11, borderRadius: 14, alignItems: 'center', justifyContent: 'center', opacity: requestStatus === 'loading' ? 0.45 : 1 }}><Text style={{ color: c.accent, fontFamily: 'Inter_500Medium', fontSize: 13 }}>{locale === 'de' ? 'Erneut' : 'Retry'}</Text></Pressable> : null}
      </View> : null}
    </View>;
  };

  return <GestureDetector gesture={edgeGesture}><SafeAreaView style={rootStyle} edges={['top', 'left', 'right']}>
    <View style={{ flex: 1 }} accessibilityElementsHidden={drawerOpen} importantForAccessibility={drawerOpen ? 'no-hide-descendants' : 'auto'} aria-hidden={drawerOpen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' || Platform.OS === 'android' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={{ flex: 1 }}>
          <View style={{ height: 56, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={openDrawer} accessibilityRole="button" accessibilityLabel={t.menu} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><Feather name="menu" size={20} color={c.text} /></Pressable>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setChatActionsOpen(value => !value)} accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Chataktionen' : 'Chat actions'} accessibilityState={{ expanded: chatActionsOpen }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><Feather name="more-vertical" size={20} color={c.text} /></Pressable>
          </View>
          {isEmpty ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: keyboardVisible ? 0 : 65, paddingHorizontal: 24 }}>
            {!keyboardVisible ? <><Text style={{ width: '100%', color: c.text, fontFamily: 'Inter_600SemiBold', fontSize: 26, lineHeight: 34, textAlign: 'center', marginBottom: 9 }}>{t.greeting}</Text><Text style={{ width: '100%', color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, textAlign: 'center' }}>{t.greetingHint}</Text></> : null}
          </View> : <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18 }} keyboardShouldPersistTaps="handled" onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; followsBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 128; }} scrollEventThrottle={80} onContentSizeChange={(_w, h) => { if (followsBottom.current) scrollRef.current?.scrollTo({ y: Math.max(0, h), animated: false }); }}>
            {conversation.map(renderAnswer)}
          </ScrollView>}
          <View style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: Math.max(insets.bottom, keyboardVisible ? 45 : 8) + (keyboardVisible ? 0 : 3) }}>
            {showGlobalRequestError && requestError ? <View accessibilityLiveRegion="polite" style={{ marginHorizontal: 8, marginBottom: 7, minHeight: 44, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, backgroundColor: c.raised, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 }}>{requestErrorMessage}</Text>
              {!requestError.startsWith('document_') ? <Pressable disabled={!retryAllowed} onPress={() => retryRequest()} accessibilityRole="button" accessibilityState={{ disabled: !retryAllowed }} style={{ minHeight: 38, paddingHorizontal: 8, justifyContent: 'center', opacity: retryAllowed ? 1 : 0.45 }}><Text style={{ color: c.accent, fontFamily: 'Inter_500Medium', fontSize: 12 }}>{locale === 'de' ? 'Erneut' : 'Retry'}</Text></Pressable> : null}
              <Pressable onPress={() => { setRequestStatus('idle'); setRequestError(null); }} accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Hinweis schließen' : 'Dismiss message'} style={{ width: 30, height: 36, alignItems: 'center', justifyContent: 'center' }}><Feather name="x" size={16} color={c.muted} /></Pressable>
            </View> : null}
            {legacyRequestPending && requestStatus === 'idle' ? <View style={{ marginHorizontal: 8, marginBottom: 7, minHeight: 40, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, backgroundColor: c.raised }}><Text style={{ color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 }}>{locale === 'de' ? 'Eine Anfrage aus einer früheren Version kann hier nicht wiederholt werden. Der Entwurf bleibt gespeichert.' : 'A request from an earlier version can’t be retried here. Its draft is still saved.'}</Text></View> : null}
            <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 28, paddingHorizontal: 8, paddingTop: 5, paddingBottom: 5 }}>
              {imageAttachment ? <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 3, paddingBottom: 7 }}>
                <Image source={{ uri: imageAttachment.uri }} accessibilityLabel={locale === 'de' ? 'Bild im Entwurf' : 'Image in draft'} resizeMode="cover" style={{ width: 58, height: 58, borderRadius: 11 }} />
                <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 12 }}>{imageAttachment.name}</Text>
                <Pressable onPress={removeImageAttachment} disabled={requestStatus === 'loading'} accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Bild entfernen' : 'Remove image'} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: requestStatus === 'loading' ? 0.45 : 1 }}><Feather name="x" size={18} color={c.muted} /></Pressable>
              </View> : null}
              {documentAttachment ? <View style={{ width: '100%', maxWidth: '100%', minWidth: 0, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 3, paddingBottom: 7, minHeight: 54 }}>
                <View style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 11, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}><Feather name="file-text" size={18} color={c.accent} /></View>
                <View style={{ flex: 1, minWidth: 0, flexShrink: 1, marginLeft: 10 }}><Text numberOfLines={1} ellipsizeMode="middle" style={{ minWidth: 0, flexShrink: 1, color: c.text, fontFamily: 'Inter_500Medium', fontSize: 12 }}>{documentAttachment.name}</Text><Text numberOfLines={1} style={{ minWidth: 0, flexShrink: 1, color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }}>{documentAttachment.mimeType === 'application/pdf' ? 'PDF' : documentAttachment.mimeType === 'text/markdown' ? 'Markdown' : 'Text'} · {(documentAttachment.sizeBytes / 1024 / 1024).toFixed(1)} MiB</Text></View>
                <Pressable onPress={removeDocumentAttachment} disabled={requestStatus === 'loading'} accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Datei entfernen' : 'Remove file'} style={{ width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', opacity: requestStatus === 'loading' ? 0.45 : 1 }}><Feather name="x" size={18} color={c.muted} /></Pressable>
              </View> : null}
              <View style={{ minHeight: 44, maxHeight: 136, flexDirection: 'row', alignItems: draft.includes('\n') ? 'flex-end' : 'center', gap: 4 }}>
                <Pressable disabled={requestStatus === 'loading'} onPress={() => setAttachmentSheetOpen(true)} accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Anhang hinzufügen' : 'Add attachment'} accessibilityState={{ disabled: requestStatus === 'loading', expanded: attachmentSheetOpen }} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', opacity: requestStatus === 'loading' ? 0.45 : 1 }}><Feather name="plus" size={23} color={c.muted} /></Pressable>
                <TextInput ref={inputRef} value={draft} onChangeText={setDraft} placeholder={t.composer} placeholderTextColor={c.faint} multiline maxLength={5000} returnKeyType="default" blurOnSubmit={false} accessibilityLabel={t.composer} selectionColor={c.accent} style={{ flex: 1, color: c.text, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 22, maxHeight: 136, paddingLeft: 5, paddingTop: 9, paddingBottom: 8, textAlignVertical: 'center' }} />
                {requestStatus === 'loading' ? <Pressable onPress={stopRequest} accessibilityRole="button" accessibilityLabel={t.stop} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' }}><Feather name="square" size={15} color={c.canvas} /></Pressable> : draft.trim() || imageAttachment || documentAttachment ? <Pressable onPress={send} accessibilityRole="button" accessibilityLabel={t.send} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Feather name="arrow-up" size={21} color="#17101F" /></Pressable> : <View accessible={false} style={{ width: 44, height: 44 }} />}
              </View>
            </View>
          </View>
          {chatActionsOpen ? <View pointerEvents="box-none" style={{ position: 'absolute', zIndex: 80, elevation: 18, left: 0, right: 0, top: 0, bottom: 0 }}>
            <Pressable onPress={() => setChatActionsOpen(false)} accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Chataktionen schließen' : 'Close chat actions'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
            <View style={{ position: 'absolute', top: 56, right: 12, minWidth: 220, backgroundColor: c.raised, borderRadius: 18, padding: 7, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 15, shadowOffset: { width: 0, height: 7 } }}>
              <Pressable disabled={requestStatus === 'loading'} onPress={() => { setChatActionsOpen(false); newChat(); }} accessibilityRole="button" accessibilityState={{ disabled: requestStatus === 'loading' }} style={{ minHeight: 48, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: requestStatus === 'loading' ? 0.45 : 1 }}><Feather name="edit-3" size={17} color={c.text} /><Text style={{ color: c.text, fontFamily: 'Inter_500Medium', fontSize: 15 }}>{t.newChat}</Text></Pressable>
              <Pressable disabled={!conversation.length} onPress={shareConversation} accessibilityRole="button" accessibilityState={{ disabled: !conversation.length }} style={{ minHeight: 48, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: conversation.length ? 1 : 0.45 }}><Feather name="share" size={17} color={c.text} /><Text style={{ color: c.text, fontFamily: 'Inter_500Medium', fontSize: 15 }}>{locale === 'de' ? 'Transkript teilen' : 'Share transcript'}</Text></Pressable>
              {activeSession.activeDocumentContext ? <Pressable onPress={() => { forgetDocumentContext(); setChatActionsOpen(false); }} accessibilityRole="button" style={{ minHeight: 48, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Feather name="file-minus" size={17} color={c.text} /><Text numberOfLines={1} style={{ flex: 1, color: c.text, fontFamily: 'Inter_500Medium', fontSize: 14 }}>{locale === 'de' ? 'Dateikontext entfernen' : 'Forget document context'}</Text></Pressable> : null}
              <Pressable onPress={() => { setChatActionsOpen(false); openSettings(); }} accessibilityRole="button" style={{ minHeight: 48, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Feather name="settings" size={17} color={c.text} /><Text style={{ color: c.text, fontFamily: 'Inter_500Medium', fontSize: 15 }}>{t.profile}</Text></Pressable>
            </View>
          </View> : null}
          {attachmentSheetOpen ? <View pointerEvents="box-none" style={{ position: 'absolute', zIndex: 100, elevation: 24, left: 0, right: 0, top: 0, bottom: 0 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Anhangmenü schließen' : 'Dismiss attachment menu'} onPress={() => setAttachmentSheetOpen(false)} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#00000055' }} />
            <View accessibilityViewIsModal style={{ position: 'absolute', left: 22, bottom: Math.max(insets.bottom, keyboardVisible ? 45 : 8) + (keyboardVisible ? 0 : 3) + (imageAttachment || documentAttachment ? 128 : 62) + 10, width: 255, backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 15, shadowOffset: { width: 0, height: 7 } }}>
              {([
                { key: 'camera' as const, label: locale === 'de' ? 'Kamera' : 'Camera', icon: 'camera' as const },
                { key: 'photos' as const, label: locale === 'de' ? 'Fotos' : 'Photos', icon: 'image' as const },
                { key: 'files' as const, label: locale === 'de' ? 'Dateien' : 'Files', icon: 'folder' as const },
              ]).map(item => <Pressable key={item.key} onPress={() => void chooseAttachment(item.key)} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 66, borderRadius: 14, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 17, backgroundColor: pressed ? c.surface : 'transparent' })}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><Feather name={item.icon} size={19} color={c.text} /></View>
                <Text style={{ color: c.text, fontFamily: 'Inter_500Medium', fontSize: 16 }}>{item.label}</Text>
              </Pressable>)}
            </View>
          </View> : null}
        </View>
      </KeyboardAvoidingView>
    </View>

    <Animated.View pointerEvents={drawerOpen ? 'auto' : 'none'} accessibilityElementsHidden={!drawerOpen} importantForAccessibility={drawerOpen ? 'auto' : 'no-hide-descendants'} aria-hidden={!drawerOpen} style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#000000' }, backdropStyle]}><Pressable onPress={closeDrawer} accessibilityLabel={t.close} accessibilityRole="button" style={{ flex: 1, marginLeft: drawerWidth }} /></Animated.View>
    <GestureDetector gesture={drawerGesture}><Animated.View pointerEvents={drawerOpen ? 'auto' : 'none'} accessibilityViewIsModal={drawerOpen} accessibilityElementsHidden={!drawerOpen} importantForAccessibility={drawerOpen ? 'auto' : 'no-hide-descendants'} aria-hidden={!drawerOpen} style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: drawerWidth, backgroundColor: theme === 'dark' ? '#0D0D0D' : '#F7F7F5', paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }, drawerStyle]}>
      <View style={{ paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 62 }}>
        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, marginRight: 12, color: c.text, fontFamily: 'Inter_600SemiBold', fontSize: 25 }}>{profileOpen ? t.profileTitle : t.drawerTitle}</Text>
        {profileOpen ? <Pressable onPress={() => setProfileOpen(false)} accessibilityRole="button" accessibilityLabel={t.back} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Feather name="arrow-left" size={21} color={c.text} /></Pressable> : <Pressable onPress={() => setSearchOpen(value => !value)} accessibilityRole="button" accessibilityLabel={t.search} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><Feather name="search" size={20} color={c.text} /></Pressable>}
      </View>
      {!profileOpen && searchOpen ? <View style={{ marginHorizontal: 20, marginBottom: 9, height: 48, borderRadius: 15, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 }}><Feather name="search" size={17} color={c.muted} /><TextInput value={query} onChangeText={setQuery} placeholder={t.searchPlaceholder} placeholderTextColor={c.faint} accessibilityLabel={t.searchPlaceholder} autoFocus style={{ marginLeft: 9, color: c.text, flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14 }} /></View> : null}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 18 }} style={{ flex: 1 }}>
        {profileOpen ? <>
          <Text style={{ color: c.muted, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 19, marginBottom: 8, paddingHorizontal: 9 }}>{t.theme}</Text>
          <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderRadius: 16, padding: 4, gap: 3 }}>{(['dark', 'light'] as ThemeMode[]).map(mode => <Pressable key={mode} onPress={() => setTheme(mode)} accessibilityRole="button" accessibilityLabel={mode === 'dark' ? t.dark : t.light} accessibilityState={{ selected: theme === mode }} style={{ flex: 1, minHeight: 48, borderRadius: 13, backgroundColor: theme === mode ? c.selected : 'transparent', justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: c.text, fontFamily: 'Inter_500Medium', fontSize: 14 }}>{mode === 'dark' ? t.dark : t.light}</Text></Pressable>)}</View>
          <Text style={{ color: c.muted, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 25, marginBottom: 8, paddingHorizontal: 9 }}>{t.language}</Text>
          <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderRadius: 16, padding: 4, gap: 3 }}>{(['en', 'de'] as Locale[]).map(code => <Pressable key={code} onPress={() => setLocale(code)} accessibilityRole="button" accessibilityLabel={code === 'en' ? t.english : t.german} accessibilityState={{ selected: locale === code }} style={{ flex: 1, minHeight: 48, borderRadius: 13, backgroundColor: locale === code ? c.selected : 'transparent', justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: c.text, fontFamily: 'Inter_500Medium', fontSize: 14 }}>{code === 'en' ? t.english : t.german}</Text></Pressable>)}</View>
        </> : <>
          <Pressable disabled={requestStatus === 'loading'} onPress={newChat} accessibilityRole="button" accessibilityLabel={t.newChat} accessibilityState={{ disabled: requestStatus === 'loading' }} style={{ minHeight: 52, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 18, opacity: requestStatus === 'loading' ? 0.55 : 1 }}><Feather name="edit-3" size={21} color={c.accent} /><Text style={{ flex: 1, color: c.text, fontFamily: 'Inter_500Medium', fontSize: 15 }}>{t.newChat}</Text></Pressable>
          <Text style={{ color: c.muted, fontFamily: 'Inter_500Medium', fontSize: 14, marginTop: 24, marginBottom: 7, paddingHorizontal: 10 }}>{t.recents}</Text>
          {showCurrent ? <Pressable key={activeChatId} onPress={closeDrawer} accessibilityRole="button" style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 14 }}><Text numberOfLines={1} style={{ flex: 1, minWidth: 0, flexShrink: 1, color: c.text, fontFamily: 'Inter_400Regular', fontSize: 14 }}>{currentTitle}</Text><View style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, backgroundColor: c.accent }} /></Pressable> : null}
          {filteredSaved.map(saved => <Pressable key={saved.id} disabled={requestStatus === 'loading'} onPress={() => { openSavedConversation(saved.id); setDrawerOpen(false); }} accessibilityRole="button" accessibilityState={{ disabled: requestStatus === 'loading' }} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 14, opacity: requestStatus === 'loading' ? 0.5 : 1 }}><Text numberOfLines={1} style={{ color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 14, flex: 1, minWidth: 0, flexShrink: 1 }}>{saved.title || (locale === 'de' ? 'Unterhaltung' : 'Conversation')}</Text></Pressable>)}
          {!showCurrent && !filteredSaved.length ? <Text style={{ color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 14, paddingHorizontal: 10, paddingVertical: 12 }}>{t.noResults}</Text> : null}
        </>}
      </ScrollView>
      <View style={{ paddingHorizontal: 19, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={closeDrawer} accessibilityRole="button" accessibilityLabel={t.chat} style={{ width: 136, minHeight: 48, paddingHorizontal: 16, borderRadius: 25, backgroundColor: c.accent, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' }}><Feather name="message-circle" size={16} color="#17101F" /><Text style={{ width: 60, minWidth: 60, flexShrink: 0, textAlign: 'center', color: '#17101F', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>{t.chat}</Text></Pressable>
        <Pressable onPress={() => { setProfileOpen(value => !value); setSearchOpen(false); }} accessibilityRole="button" accessibilityLabel={t.profile} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><Feather name={profileOpen ? 'x' : 'user'} size={20} color={c.text} /></Pressable>
      </View>
    </Animated.View></GestureDetector>
    {notice ? <View pointerEvents="none" style={{ position: 'absolute', bottom: Math.max(insets.bottom, 12) + 72, alignSelf: 'center', backgroundColor: c.raised, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 18 }}><Text style={{ color: c.text, fontFamily: 'Inter_500Medium', fontSize: 13 }}>{notice}</Text></View> : null}
    {hydrationStatus !== 'ready' ? <View accessibilityViewIsModal style={{ position: 'absolute', zIndex: 1000, elevation: 20, left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.canvas, paddingHorizontal: 28, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, justifyContent: 'center', alignItems: 'center' }}>
      {hydrationStatus === 'loading' ? <><ActivityIndicator color={c.accent} /><Text style={{ color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 14, textAlign: 'center' }}>{locale === 'de' ? 'Gespeicherte Chats werden geladen …' : 'Loading saved chats …'}</Text></> : <>
        <Text style={{ color: c.text, fontFamily: 'Inter_600SemiBold', fontSize: 19, lineHeight: 26, textAlign: 'center' }}>{locale === 'de' ? 'Gespeicherte Daten konnten nicht geladen werden' : 'Saved data could not be loaded'}</Text>
        <Text style={{ color: c.muted, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 }}>{locale === 'de' ? 'Die gespeicherten Daten wurden nicht ersetzt. Versuche, sie erneut zu laden.' : 'Stored data has not been replaced. Try loading it again.'}</Text>
        <Pressable onPress={retryHydration} accessibilityRole="button" style={{ marginTop: 18, minHeight: 48, minWidth: 150, paddingHorizontal: 16, borderRadius: 16, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.canvas, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>{locale === 'de' ? 'Erneut versuchen' : 'Try again'}</Text></Pressable>
      </>}
    </View> : null}
  </SafeAreaView></GestureDetector>;
}
