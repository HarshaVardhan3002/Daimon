import React, { memo, useRef } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { type } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { useStrings } from '../i18n/strings';
import { activeChatTitle, appStore, deleteChat, hasActiveContent, renameChat, setActiveSession, useApp } from '../state/appStore';
import { ComposeGlyph, Icon, MenuGlyph } from '../ui/icons';
import { IconButton } from '../ui/IconButton';
import { confirm, openMenuFrom, prompt, toast } from '../ui/overlays';
import { track } from '../telemetry/telemetry';
import { haptic } from '../ui/PressableScale';
import { shareText, transcript } from './chatController';

export const HEADER_HEIGHT = 56;

type Props = { topInset: number; onMenu: () => void; onNewChat: () => void };

/** Floating header: controls sit on their own circles over a fade, so the conversation scrolls underneath. */
export const ChatHeader = memo(function ChatHeader({ topInset, onMenu, onNewChat }: Props) {
  const c = usePalette(); const t = useStrings();
  const inChat = useApp(state => state.conversation.length > 0);
  const hasContent = useApp(hasActiveContent);
  const hasDocumentContext = useApp(state => Boolean(state.activeSession.activeDocumentContext));
  const moreRef = useRef<View>(null);

  const openActions = () => {
    const id = appStore.get().activeChatId;
    const title = activeChatTitle(appStore.get());
    openMenuFrom(moreRef.current, {
      align: 'right',
      items: [
        { key: 'share', label: t.shareChat, icon: 'share-2', disabled: !inChat, onPress: () => void shareText(transcript()) },
        { key: 'rename', label: t.rename, icon: 'edit-3', disabled: !hasContent, onPress: () => {
          void prompt({ title: t.renameTitle, initial: title, placeholder: t.renamePlaceholder, confirmLabel: t.save, cancelLabel: t.cancel }).then(value => { if (value) { renameChat(id, value); track('chat_rename', {}); } });
        } },
        ...(hasDocumentContext ? [{ key: 'forget', label: t.forgetDocument, icon: 'file-minus' as const, onPress: () => setActiveSession(current => ({ ...current, activeDocumentContext: undefined })) }] : []),
        { kind: 'divider', key: 'd' },
        { key: 'delete', label: t.delete, icon: 'trash-2', danger: true, disabled: !hasContent, onPress: () => {
          void confirm({ title: t.deleteTitle, message: t.deleteMessage(title), confirmLabel: t.delete, cancelLabel: t.cancel, destructive: true }).then(ok => { if (ok) { track('chat_delete', { active: true }); deleteChat(id); haptic('success'); toast(t.deleted); } });
        } },
      ],
    });
  };

  return <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingTop: topInset, zIndex: 10 }}>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: topInset + HEADER_HEIGHT + 22, experimental_backgroundImage: `linear-gradient(180deg, ${c.canvas} 0%, ${c.canvas} 62%, ${c.canvas}00 100%)` }} />
    <View pointerEvents="box-none" style={{ height: HEADER_HEIGHT, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <IconButton label={t.openMenu} variant="surface" size={44} onPress={onMenu}><MenuGlyph color={c.text} /></IconButton>
      {!inChat ? <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
        <Text accessibilityRole="header" style={{ ...type.heading, color: c.text }}>{t.appName}</Text>
      </Animated.View> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 22, backgroundColor: c.surface, paddingHorizontal: 2 }}>
        <IconButton label={t.newChat} size={40} onPress={onNewChat} disabled={!hasContent}><ComposeGlyph color={c.text} size={20} /></IconButton>
        <IconButton ref={moreRef} label={t.chatActions} size={40} onPress={openActions}><Icon name="more-vertical" size={19} color={c.text} /></IconButton>
      </View>
    </View>
  </View>;
});
