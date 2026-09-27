import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, type } from '../../src/design/tokens';
import { usePalette } from '../../src/design/useTheme';
import { useScreenStrings } from '../../src/i18n/screens';
import { clearMemories, deleteMemory, updateProfile, useAccount } from '../../src/state/accountStore';
import { confirm, openMenuFrom, toast } from '../../src/ui/overlays';
import { IconButton } from '../../src/ui/IconButton';
import { Icon } from '../../src/ui/icons';
import { ScreenHeader } from '../../src/ui/ScreenHeader';
import { SettingsGroup, SettingsRow } from '../../src/ui/SettingsList';
import { Switch } from '../../src/ui/feedback';

export default function MemoryScreen() {
  const c = usePalette();
  const t = useScreenStrings();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const profile = useAccount(state => state.profile);
  const memories = useAccount(state => state.memories);
  const previewFixtures = useAccount(state => state.dev.previewFixtures);
  const [aboutDraft, setAboutDraft] = useState(() => ({ nickname: profile.nickname, occupation: profile.occupation, about: profile.about }));
  const isDirty = aboutDraft.nickname !== profile.nickname || aboutDraft.occupation !== profile.occupation || aboutDraft.about !== profile.about;
  const pendingAction = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const pendingBack = useRef(false);
  const discardPending = useRef(false);
  const visibleMemories = memories.length ? memories : previewFixtures ? t.memory.fixtures.map((text, index) => ({ id: `preview-${index}`, text, createdAt: 0 })) : [];

  const save = useCallback(() => {
    pendingBack.current = true;
    updateProfile({ nickname: aboutDraft.nickname, occupation: aboutDraft.occupation, about: aboutDraft.about });
    toast(t.common.saved);
  }, [aboutDraft, t.common.saved]);

  const requestDiscard = useCallback(async (action: Parameters<typeof navigation.dispatch>[0]) => {
    if (discardPending.current) return;
    discardPending.current = true;
    const discard = await confirm({
      title: t.common.discardTitle,
      message: t.common.discardMessage,
      confirmLabel: t.common.discard,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    discardPending.current = false;
    if (!discard) return;
    pendingAction.current = action;
    setAboutDraft({ nickname: profile.nickname, occupation: profile.occupation, about: profile.about });
  }, [profile.about, profile.nickname, profile.occupation, t]);

  usePreventRemove(isDirty, ({ data }) => { void requestDiscard(data.action); });
  useEffect(() => {
    if (isDirty) return;
    if (pendingAction.current) {
      const action = pendingAction.current;
      pendingAction.current = null;
      navigation.dispatch(action);
    } else if (pendingBack.current) {
      pendingBack.current = false;
      router.back();
    }
  }, [isDirty, navigation]);

  const setAbout = useCallback((key: 'nickname' | 'occupation' | 'about', value: string) => {
    setAboutDraft(current => ({ ...current, [key]: value }));
  }, []);

  const removeMemory = useCallback(async (id: string, wrong: boolean) => {
    if (wrong) {
      deleteMemory(id);
      toast(t.memory.forgotten);
      return;
    }
    const approved = await confirm({
      title: t.memory.deleteTitle,
      message: t.memory.deleteMessage,
      confirmLabel: t.memory.delete,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (approved) deleteMemory(id);
  }, [t.common.cancel, t.memory.delete, t.memory.deleteMessage, t.memory.deleteTitle, t.memory.forgotten]);

  const deleteAll = useCallback(async () => {
    const approved = await confirm({
      title: t.memory.deleteAllTitle,
      message: t.memory.deleteAllMessage,
      confirmLabel: t.memory.deleteAll,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (approved) clearMemories();
  }, [t.common.cancel, t.memory.deleteAll, t.memory.deleteAllMessage, t.memory.deleteAllTitle]);

  return <View style={{ flex: 1, backgroundColor: c.canvas }}>
    <ScreenHeader title={t.memory.title} onBack={() => router.back()} onSave={save} canSave={isDirty} />
    <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={24} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: insets.bottom + 32 }}>
      <SettingsGroup helper={t.memory.enableHelper}>
        <SettingsRow first last label={t.memory.enable} trailing={<Switch value={profile.memoryEnabled} label={t.memory.enable} onValueChange={value => updateProfile({ memoryEnabled: value })} />} />
      </SettingsGroup>

      <SettingsGroup title={t.memory.knows}>
        {visibleMemories.length ? visibleMemories.map((item, index) => <MemoryRow
            key={item.id}
            id={item.id}
            text={item.text}
            preview={!memories.length && previewFixtures}
            first={index === 0}
            last={!memories.length && index === visibleMemories.length - 1}
            onAction={removeMemory}
            wrongLabel={t.memory.wrong}
            deleteLabel={t.memory.delete}
            menuLabel={t.memory.actions}
            previewLabel={t.memory.preview}
          />) : <View style={{ backgroundColor: c.surface, borderRadius: radius.card, padding: 18 }}>
          <Text style={{ ...type.bodyMedium, color: c.text }}>{t.memory.emptyTitle}</Text>
          <Text style={{ ...type.helper, color: c.muted, marginTop: 6 }}>{t.memory.emptyHelper}</Text>
        </View>}
        {memories.length > 0 ? <SettingsRow label={t.memory.deleteAll} danger last onPress={() => void deleteAll()} /> : null}
      </SettingsGroup>

      <SettingsGroup title={t.memory.aboutYou}>
        <ProfileField label={t.memory.nickname} value={aboutDraft.nickname} maxLength={60} onChangeText={value => setAbout('nickname', value)} />
        <ProfileField label={t.memory.occupation} value={aboutDraft.occupation} maxLength={120} onChangeText={value => setAbout('occupation', value)} />
        <ProfileField label={t.memory.about} value={aboutDraft.about} maxLength={1500} multiline onChangeText={value => setAbout('about', value)} />
      </SettingsGroup>
    </KeyboardAwareScrollView>
  </View>;
}

type MemoryRowProps = {
  id: string;
  text: string;
  preview: boolean;
  first: boolean;
  last: boolean;
  wrongLabel: string;
  deleteLabel: string;
  menuLabel: string;
  previewLabel: string;
  onAction: (id: string, wrong: boolean) => void;
};

const MemoryRow = React.memo(function MemoryRow({ id, text, preview, first, last, wrongLabel, deleteLabel, menuLabel, previewLabel, onAction }: MemoryRowProps) {
  const c = usePalette();
  const anchor = useRef<View>(null);
  const openActions = useCallback(() => {
    if (preview) return;
    openMenuFrom(anchor.current, { header: menuLabel, items: [
      { key: 'wrong', label: wrongLabel, onPress: () => onAction(id, true) },
      { key: 'delete', label: deleteLabel, danger: true, onPress: () => onAction(id, false) },
    ] });
  }, [deleteLabel, id, menuLabel, onAction, preview, wrongLabel]);

  return <View style={{ backgroundColor: c.surface, borderTopLeftRadius: first ? radius.card : 6, borderTopRightRadius: first ? radius.card : 6, borderBottomLeftRadius: last ? radius.card : 6, borderBottomRightRadius: last ? radius.card : 6, minHeight: 64, paddingLeft: 16, paddingRight: 8, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Text numberOfLines={4} style={{ ...type.labelRegular, color: c.text, flex: 1, flexShrink: 1 }}>{text}</Text>
    {preview ? <View style={{ borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: c.raised }}><Text style={{ ...type.caption, color: c.muted }}>{previewLabel}</Text></View> : <IconButton ref={anchor} size={40} label={menuLabel} variant="plain" onPress={openActions}><Icon name="more-vertical" color={c.muted} /></IconButton>}
  </View>;
});

type ProfileFieldProps = { label: string; value: string; maxLength: number; multiline?: boolean; onChangeText: (value: string) => void };
function ProfileField({ label, value, maxLength, multiline = false, onChangeText }: ProfileFieldProps) {
  const c = usePalette();
  return <View style={{ marginBottom: 14 }}>
    <Text style={{ ...type.helper, color: c.muted, marginHorizontal: 14, marginBottom: 8 }}>{label}</Text>
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      maxLength={maxLength}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      placeholder={label}
      placeholderTextColor={c.faint}
      selectionColor={c.accent}
      cursorColor={c.accent}
      style={{ minHeight: multiline ? 128 : 56, backgroundColor: c.surface, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: multiline ? 15 : 12, color: c.text, ...type.body, fontFamily: font.regular }}
    />
  </View>;
}
