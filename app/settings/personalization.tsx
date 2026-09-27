import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, type } from '../../src/design/tokens';
import { usePalette } from '../../src/design/useTheme';
import { useScreenStrings } from '../../src/i18n/screens';
import { useAccount, updateProfile, type BaseStyle, type Level, type Profile } from '../../src/state/accountStore';
import { confirm, openMenuFrom, toast } from '../../src/ui/overlays';
import { ScreenHeader } from '../../src/ui/ScreenHeader';
import { SettingsGroup, SettingsRow } from '../../src/ui/SettingsList';

const styles: BaseStyle[] = ['default', 'professional', 'friendly', 'candid', 'quirky', 'efficient'];
const levels: Level[] = ['less', 'default', 'more'];
type PreferenceKey = 'warmth' | 'enthusiasm' | 'headers' | 'emoji';

function changed(a: Profile, b: Profile): boolean {
  return a.baseStyle !== b.baseStyle || a.warmth !== b.warmth || a.enthusiasm !== b.enthusiasm
    || a.headers !== b.headers || a.emoji !== b.emoji || a.customInstructions !== b.customInstructions;
}

export default function PersonalizationScreen() {
  const c = usePalette();
  const t = useScreenStrings();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const profile = useAccount(state => state.profile);
  const [draft, setDraft] = useState<Profile>(profile);
  const isDirty = changed(draft, profile);
  const pendingAction = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const pendingBack = useRef(false);
  const discardPending = useRef(false);
  const baseRef = useRef<View>(null);
  const update = useCallback(<K extends keyof Profile>(key: K, value: Profile[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
  }, []);

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
    setDraft(profile);
  }, [profile, t]);

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

  const save = useCallback(() => {
    pendingBack.current = true;
    updateProfile({
      baseStyle: draft.baseStyle,
      warmth: draft.warmth,
      enthusiasm: draft.enthusiasm,
      headers: draft.headers,
      emoji: draft.emoji,
      customInstructions: draft.customInstructions,
    });
    toast(t.common.saved);
  }, [draft, t.common.saved]);

  const openStyleMenu = useCallback(() => openMenuFrom(baseRef.current, {
    items: styles.map(value => ({
      key: value,
      label: t.personalization.styles[value],
      checked: draft.baseStyle === value,
      onPress: () => update('baseStyle', value),
    })),
  }), [draft.baseStyle, t.personalization.styles, update]);

  const labels: Record<PreferenceKey, string> = {
    warmth: t.personalization.warmth,
    enthusiasm: t.personalization.enthusiasm,
    headers: t.personalization.headers,
    emoji: t.personalization.emoji,
  };

  return <View style={{ flex: 1, backgroundColor: c.canvas }}>
    <ScreenHeader title={t.personalization.title} onBack={() => router.back()} onSave={save} canSave={isDirty} />
    <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={24} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: insets.bottom + 28 }}>
      <SettingsGroup helper={t.personalization.styleHelper}>
        <SettingsRow ref={baseRef} first last label={t.personalization.baseStyle} subtitle={t.personalization.styles[draft.baseStyle]} chevron="down" onPress={openStyleMenu} />
      </SettingsGroup>
      <SettingsGroup>
        {(Object.keys(labels) as PreferenceKey[]).map((key, index) => <PreferenceRow
          key={key}
          preference={key}
          label={labels[key]}
          value={draft[key]}
          levels={levels}
          levelLabels={t.personalization.levels}
          first={index === 0}
          last={index === 3}
          onSelect={update}
        />)}
      </SettingsGroup>
      <Text accessibilityRole="header" style={{ ...type.helper, color: c.muted, marginHorizontal: 14, marginBottom: 9 }}>{t.personalization.customInstructions}</Text>
      <TextInput
        accessibilityLabel={t.personalization.customInstructions}
        value={draft.customInstructions}
        onChangeText={value => update('customInstructions', value)}
        placeholder={t.personalization.instructionsPlaceholder}
        placeholderTextColor={c.faint}
        selectionColor={c.accent}
        cursorColor={c.accent}
        multiline
        maxLength={1500}
        textAlignVertical="top"
        style={{ minHeight: 136, backgroundColor: c.surface, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 16, color: c.text, ...type.body, fontFamily: font.regular }}
      />
    </KeyboardAwareScrollView>
  </View>;
}

type PreferenceRowProps = {
  preference: PreferenceKey;
  label: string;
  value: Level;
  levels: Level[];
  levelLabels: Record<Level, string>;
  first: boolean;
  last: boolean;
  onSelect: (key: PreferenceKey, value: Level) => void;
};

const PreferenceRow = React.memo(function PreferenceRow({ preference, label, value, levels: choices, levelLabels, first, last, onSelect }: PreferenceRowProps) {
  const anchor = useRef<View>(null);
  const openChoices = useCallback(() => {
    openMenuFrom(anchor.current, { items: choices.map(option => ({ key: option, label: levelLabels[option], checked: value === option, onPress: () => onSelect(preference, option) })) });
  }, [choices, levelLabels, onSelect, preference, value]);
  return <SettingsRow ref={anchor} label={label} subtitle={levelLabels[value]} chevron="down" first={first} last={last} onPress={openChoices} />;
});
