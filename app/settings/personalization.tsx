import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { font, motion, radius, type } from '../../src/design/tokens';
import { usePalette } from '../../src/design/useTheme';
import { useScreenStrings } from '../../src/i18n/screens';
import { useAccount, updateProfile, type BaseStyle, type Level, type Profile } from '../../src/state/accountStore';
import { confirm, toast } from '../../src/ui/overlays';
import { PressableScale } from '../../src/ui/PressableScale';
import { ScreenHeader } from '../../src/ui/ScreenHeader';
import { SettingsGroup, SettingsRow } from '../../src/ui/SettingsList';

const styles: BaseStyle[] = ['default', 'professional', 'friendly', 'candid', 'quirky', 'efficient'];
const levels: Level[] = ['less', 'default', 'more'];
const PREFERENCE_KEYS = { warmth: true, enthusiasm: true, headers: true, emoji: true } as const;
type PreferenceKey = keyof typeof PREFERENCE_KEYS;

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

  const [fineTuneOpen, setFineTuneOpen] = useState(() => (Object.keys(PREFERENCE_KEYS) as PreferenceKey[]).some(key => profile[key] !== 'default'));
  const tuned = (Object.keys(PREFERENCE_KEYS) as PreferenceKey[]).filter(key => draft[key] !== 'default');
  const tuneSummary = tuned.length ? tuned.map(key => `${t.personalization[key]} ${t.personalization.levels[draft[key]].toLocaleLowerCase()}`).join(' · ') : t.personalization.allDefault;

  return <View style={{ flex: 1, backgroundColor: c.canvas }}>
    <ScreenHeader title={t.personalization.title} onBack={() => router.back()} onSave={save} canSave={isDirty} />
    <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={24} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: insets.bottom + 28 }}>
      <Text accessibilityRole="header" style={{ ...type.helper, color: c.muted, marginHorizontal: 14, marginBottom: 9 }}>{t.personalization.voice}</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {styles.map(value => <VoiceTile key={value} value={value} label={t.personalization.styles[value]} hint={t.personalization.styleHints[value]} selected={draft.baseStyle === value} onSelect={update} />)}
      </View>
      <View accessibilityLiveRegion="polite" style={{ marginTop: 14, marginBottom: 8, gap: 8 }}>
        <View style={{ alignSelf: 'flex-end', maxWidth: '80%', backgroundColor: c.user, borderRadius: radius.bubble, paddingHorizontal: 14, paddingVertical: 9 }}>
          <Text style={{ ...type.labelRegular, color: c.userText }}>{t.personalization.sampleQuestion}</Text>
        </View>
        <Animated.Text key={draft.baseStyle} entering={FadeIn.duration(motion.local)} style={{ ...type.labelRegular, color: c.text, paddingHorizontal: 4 }}>{t.personalization.samples[draft.baseStyle]}</Animated.Text>
      </View>
      <Text style={{ ...type.helper, color: c.muted, marginHorizontal: 14, marginTop: 6, marginBottom: 26 }}>{t.personalization.voiceHelper}</Text>

      <SettingsGroup helper={fineTuneOpen ? t.personalization.fineTuneHelper : undefined}>
        <SettingsRow first last={!fineTuneOpen} label={t.personalization.fineTune} subtitle={tuneSummary} chevron={fineTuneOpen ? 'down' : true} onPress={() => setFineTuneOpen(open => !open)} />
        {fineTuneOpen ? (Object.keys(PREFERENCE_KEYS) as PreferenceKey[]).map((key, index, keys) => <Animated.View key={key} entering={FadeIn.duration(motion.local).delay(index * 30)}>
          <LevelRow preference={key} label={t.personalization[key]} value={draft[key]} levelLabels={t.personalization.levels} last={index === keys.length - 1} onSelect={update} />
        </Animated.View>) : null}
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
        style={{ minHeight: 120, backgroundColor: c.surface, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 16, color: c.text, ...type.body, fontFamily: font.regular }}
      />
    </KeyboardAwareScrollView>
  </View>;
}

const VoiceTile = React.memo(function VoiceTile({ value, label, hint, selected, onSelect }: { value: BaseStyle; label: string; hint: string; selected: boolean; onSelect: (key: 'baseStyle', value: BaseStyle) => void }) {
  const c = usePalette();
  return <PressableScale
    accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${label}, ${hint}`}
    onPress={() => onSelect('baseStyle', value)} haptic="selection" scaleTo={0.98}
    style={{ width: '48.6%', minHeight: 68, borderRadius: radius.row, paddingHorizontal: 14, paddingVertical: 11, justifyContent: 'center', backgroundColor: selected ? c.raised : c.surface, borderWidth: 1.5, borderColor: selected ? c.accent : 'transparent' }}
  >
    <Text style={{ ...type.label, color: c.text }}>{label}</Text>
    <Text numberOfLines={1} style={{ ...type.helper, color: c.muted, marginTop: 2 }}>{hint}</Text>
  </PressableScale>;
});

type LevelRowProps = {
  preference: PreferenceKey;
  label: string;
  value: Level;
  levelLabels: Record<Level, string>;
  last: boolean;
  onSelect: (key: PreferenceKey, value: Level) => void;
};

/** Less · Default · More as an inline segmented control: every choice is visible, nothing hides in a menu. */
const LevelRow = React.memo(function LevelRow({ preference, label, value, levelLabels, last, onSelect }: LevelRowProps) {
  const c = usePalette();
  return <View style={{ backgroundColor: c.surface, borderRadius: 6, borderBottomLeftRadius: last ? radius.card : 6, borderBottomRightRadius: last ? radius.card : 6, paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
    <Text style={{ ...type.body, color: c.text }}>{label}</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: c.selected, borderRadius: radius.pill, padding: 3 }}>
      {levels.map(level => {
        const selected = value === level;
        return <PressableScale key={level} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${label}: ${levelLabels[level]}`} onPress={() => onSelect(preference, level)} haptic="selection" scaleTo={0.98}
          style={{ flex: 1, minHeight: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? c.raised : 'transparent' }}>
          <Text style={{ ...type.label, fontSize: 14, color: selected ? c.text : c.muted }}>{levelLabels[level]}</Text>
        </PressableScale>;
      })}
    </View>
  </View>;
});
