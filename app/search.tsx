import React, { memo, useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { KeyboardStickyView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, motion, radius, type } from '../src/design/tokens';
import { usePalette, useThemeMode } from '../src/design/useTheme';
import { useScreenStrings } from '../src/i18n/screens';
import { closeDrawerBehind } from '../src/chat/chatController';
import { activeChatTitle, hasActiveContent, openSavedConversation, useApp } from '../src/state/appStore';
import { turnTime, type SavedConversation, type Turn } from '../src/state/types';
import { IconButton } from '../src/ui/IconButton';
import { Icon } from '../src/ui/icons';
import { PressableScale } from '../src/ui/PressableScale';

type ChatResult = { id: string; title: string; turns: Turn[]; active: boolean };
type Match = { before: string; hit: string; after: string };

function compact(value: string): string { return value.replace(/\s+/g, ' ').trim(); }
function latestTurnTime(turns: Turn[]): number { return Math.max(0, ...turns.map(turn => turnTime(turn) ?? 0)); }

function snippetFor(chat: ChatResult, query: string): Match | null {
  const q = compact(query).toLocaleLowerCase();
  const candidates = [chat.title, ...chat.turns.flatMap(turn => [turn.prompt, turn.answer])].filter(Boolean);
  for (const raw of candidates) {
    const text = compact(raw);
    const at = text.toLocaleLowerCase().indexOf(q);
    if (at < 0) continue;
    const start = Math.max(0, at - 34);
    const end = Math.min(text.length, at + q.length + 52);
    return { before: `${start ? '…' : ''}${text.slice(start, at)}`, hit: text.slice(at, at + q.length), after: `${text.slice(at + q.length, end)}${end < text.length ? '…' : ''}` };
  }
  return null;
}

const ResultRow = memo(function ResultRow({ chat, index, query, onSelect }: { chat: ChatResult; index: number; query: string; onSelect: (chat: ChatResult) => void }) {
  const c = usePalette();
  const t = useScreenStrings();
  const snippet = query ? snippetFor(chat, query) : null;
  const turn = chat.turns[chat.turns.length - 1];
  const preview = compact(turn?.answer || turn?.prompt || '');
  return <Animated.View entering={index < 12 ? FadeInDown.delay(index * 28).duration(230).easing(motion.enter) : undefined}>
    <PressableScale accessibilityRole="button" accessibilityLabel={t.search.openChat(chat.title)} onPress={() => onSelect(chat)} highlight={c.raised} scaleTo={0.98} style={{ width: '100%', minHeight: 72, borderRadius: radius.row, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}><Icon name="message-circle" size={19} color={c.muted} /></View>
      <View style={{ flex: 1, minWidth: 0, paddingVertical: 10 }}>
        <Text numberOfLines={1} style={{ ...type.label, color: c.text }}>{chat.title}</Text>
        {snippet ? <Text numberOfLines={1} style={{ ...type.helper, color: c.muted }}><Text>{snippet.before}</Text><Text style={{ fontFamily: font.semibold, color: c.text }}>{snippet.hit}</Text><Text>{snippet.after}</Text></Text>
          : <Text numberOfLines={1} style={{ ...type.helper, color: c.muted }}>{preview || chat.title}</Text>}
      </View>
    </PressableScale>
  </Animated.View>;
});

export default function SearchScreen() {
  const c = usePalette();
  const mode = useThemeMode();
  const t = useScreenStrings();
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const [query, setQuery] = useState('');
  const [toolbarHeight, setToolbarHeight] = useState(62 + Math.max(insets.bottom, 10));
  const resultsStyle = useAnimatedStyle(() => ({ marginBottom: toolbarHeight + Math.max(0, -keyboardHeight.value) }), [toolbarHeight]);
  const conversation = useApp(state => state.conversation);
  const saved = useApp(state => state.savedConversations);
  const activeId = useApp(state => state.activeChatId);
  const title = useApp(state => activeChatTitle(state));
  const active = useApp(state => hasActiveContent(state));
  const results = useMemo<ChatResult[]>(() => {
    const chats: ChatResult[] = [
      ...(active ? [{ id: activeId, title, turns: conversation, active: true }] : []),
      ...[...saved].sort((a, b) => (b.updatedAt ?? latestTurnTime(b.turns)) - (a.updatedAt ?? latestTurnTime(a.turns))).filter((chat: SavedConversation) => chat.id !== activeId).map(chat => ({ id: chat.id, title: chat.title, turns: chat.turns, active: false })),
    ];
    const normalized = compact(query).toLocaleLowerCase();
    return normalized ? chats.filter(chat => compact(chat.title).toLocaleLowerCase().includes(normalized) || chat.turns.some(turn => compact(turn.prompt).toLocaleLowerCase().includes(normalized) || compact(turn.answer).toLocaleLowerCase().includes(normalized))) : chats;
  }, [active, activeId, conversation, query, saved, title]);
  const selectChat = useCallback((chat: ChatResult) => {
    if (!chat.active) openSavedConversation(chat.id);
    closeDrawerBehind();
    router.back();
  }, []);

  return <View style={{ flex: 1, backgroundColor: c.canvas, paddingTop: insets.top }}>
    {!query.trim() ? <Text accessibilityRole="header" style={{ ...type.heading, color: c.muted, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 }}>{t.search.recent}</Text> : null}
    <Animated.View style={[{ flex: 1 }, resultsStyle]}>
      {results.length ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {results.map((chat, index) => <ResultRow key={chat.id} chat={chat} index={index} query={query.trim()} onSelect={selectChat} />)}
      </ScrollView> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}><Text style={{ ...type.body, color: c.muted }}>{t.search.noResults}</Text></View>}
    </Animated.View>
    <KeyboardStickyView onLayout={event => setToolbarHeight(event.nativeEvent.layout.height)} offset={{ closed: 0, opened: 0 }} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.canvas, paddingHorizontal: 12, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minHeight: 52, borderRadius: 26, paddingHorizontal: 17, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="search" size={19} color={c.muted} />
          <TextInput autoFocus value={query} onChangeText={setQuery} placeholder={t.search.placeholder} placeholderTextColor={c.faint} returnKeyType="search" autoCorrect={false} autoCapitalize="none" accessibilityLabel={t.search.placeholder} keyboardAppearance={mode} selectionColor={c.accent} cursorColor={c.accent}
            style={{ flex: 1, minWidth: 0, minHeight: 44, ...type.body, color: c.text, paddingVertical: 0 }} />
          {query.length ? <IconButton size={36} label={t.search.clear} onPress={() => setQuery('')}><Icon name="x-circle" size={18} color={c.muted} /></IconButton> : null}
        </View>
        <IconButton label={t.common.close} variant="surface" size={48} onPress={() => router.back()}><Icon name="x" size={20} color={c.text} /></IconButton>
      </View>
    </KeyboardStickyView>
  </View>;
}
