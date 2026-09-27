import { router } from 'expo-router';
import React, { memo, useCallback, useMemo, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { font, radius, type } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { useStrings } from '../i18n/strings';
import { useAccount } from '../state/accountStore';
import { activeChatTitle, appStore, deleteChat, hasActiveContent, openSavedConversation, renameChat, useApp } from '../state/appStore';
import { track } from '../telemetry/telemetry';
import { ComposeGlyph, Icon } from '../ui/icons';
import { IconButton } from '../ui/IconButton';
import { confirm, openMenuFrom, prompt, toast } from '../ui/overlays';
import { PressableScale, haptic } from '../ui/PressableScale';

type Props = { width: number; topInset: number; bottomInset: number; onClose: () => void; onNewChat: () => void; busy: boolean };

const Row = memo(function Row({ id, title, active, disabled, onOpen }: { id: string; title: string; active: boolean; disabled: boolean; onOpen: (id: string) => void }) {
  const c = usePalette(); const t = useStrings();
  const ref = useRef<View>(null);
  const actions = () => {
    haptic('medium');
    openMenuFrom(ref.current, {
      align: 'left',
      items: [
        { key: 'rename', label: t.rename, icon: 'edit-3', onPress: () => { void prompt({ title: t.renameTitle, initial: title, placeholder: t.renamePlaceholder, confirmLabel: t.save, cancelLabel: t.cancel }).then(value => { if (value) { renameChat(id, value); track('chat_rename', {}); } }); } },
        { key: 'delete', label: t.delete, icon: 'trash-2', danger: true, onPress: () => { void confirm({ title: t.deleteTitle, message: t.deleteMessage(title), confirmLabel: t.delete, cancelLabel: t.cancel, destructive: true }).then(ok => { if (ok) { track('chat_delete', { active: id === appStore.get().activeChatId }); deleteChat(id); toast(t.deleted); } }); } },
      ],
    });
  };
  return <PressableScale ref={ref} disabled={disabled} onPress={() => onOpen(id)} onLongPress={actions} delayLongPress={350} scaleTo={0.98} highlight={c.surface} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected: active, disabled }}
    style={{ minHeight: 46, borderRadius: radius.row, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: active ? c.surface : 'transparent', opacity: disabled ? 0.5 : 1 }}>
    <Text numberOfLines={1} style={{ ...type.body, flex: 1, color: active ? c.text : c.text, fontFamily: active ? font.medium : font.regular }}>{title}</Text>
    {active ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent }} /> : null}
  </PressableScale>;
});

/** Navigation rail: title and search, Recents, and the Chat pill and profile anchored at the bottom. */
export const ChatDrawer = memo(function ChatDrawer({ width, topInset, bottomInset, onClose, onNewChat, busy }: Props) {
  const c = usePalette(); const t = useStrings();
  const saved = useApp(state => state.savedConversations);
  const activeId = useApp(state => state.activeChatId);
  const showActive = useApp(hasActiveContent);
  const activeTitle = useApp(state => showActive ? activeChatTitle(state) : '');
  const participant = useAccount(state => state.profile.nickname || state.session?.participantId || '');
  const open = useCallback((id: string) => {
    if (id !== appStore.get().activeChatId) openSavedConversation(id);
    onClose();
  }, [onClose]);
  const rows = useMemo(() => [
    ...(showActive ? [{ id: activeId, title: activeTitle }] : []),
    ...saved.map(chat => ({ id: chat.id, title: chat.title || t.chat })),
  ], [activeId, activeTitle, saved, showActive, t.chat]);

  return <View style={{ width, flex: 1, backgroundColor: c.drawer, paddingTop: topInset }}>
    <View style={{ height: 64, paddingLeft: 22, paddingRight: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text accessibilityRole="header" style={{ ...type.title, fontSize: 22, color: c.text }}>{t.appName}</Text>
      <IconButton label={t.searchChats} variant="surface" size={44} onPress={() => router.push('/search')}><Icon name="search" size={20} color={c.text} /></IconButton>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 96 }} showsVerticalScrollIndicator={false}>
      <Text style={{ ...type.label, color: c.muted, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 }}>{t.recents}</Text>
      {rows.length ? rows.map(row => <Row key={row.id} id={row.id} title={row.title} active={row.id === activeId} disabled={busy && row.id !== activeId} onOpen={open} />)
        : <Text style={{ ...type.labelRegular, color: c.faint, paddingHorizontal: 12, paddingVertical: 8 }}>{t.noChats}</Text>}
    </ScrollView>
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: bottomInset + 14, paddingTop: 28, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', experimental_backgroundImage: `linear-gradient(180deg, ${c.drawer}00 0%, ${c.drawer} 45%)` }}>
      <PressableScale onPress={onNewChat} disabled={busy} haptic="light" accessibilityRole="button" accessibilityLabel={t.newChat} style={{ height: 48, paddingHorizontal: 20, borderRadius: 24, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', gap: 9, opacity: busy ? 0.6 : 1 }}>
        <ComposeGlyph size={18} color={c.onAccent} />
        <Text style={{ ...type.label, fontFamily: font.semibold, color: c.onAccent }}>{t.chat}</Text>
      </PressableScale>
      <PressableScale onPress={() => router.push('/settings')} haptic="selection" accessibilityRole="button" accessibilityLabel={t.profile} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        {participant ? <Text style={{ ...type.label, fontFamily: font.semibold, color: c.text }}>{participant.slice(0, 1).toUpperCase()}</Text> : <Icon name="user" size={19} color={c.text} />}
      </PressableScale>
    </View>
  </View>;
});
