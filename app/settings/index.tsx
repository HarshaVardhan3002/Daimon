import React, { useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type } from '../../src/design/tokens';
import { usePalette } from '../../src/design/useTheme';
import { useScreenStrings } from '../../src/i18n/screens';
import { setLocale, setTheme, useApp } from '../../src/state/appStore';
import { setDevFlags, signOut, useAccount } from '../../src/state/accountStore';
import { SettingsGroup, SettingsRow } from '../../src/ui/SettingsList';
import { IconButton } from '../../src/ui/IconButton';
import { Icon } from '../../src/ui/icons';
import { confirm, openMenuFrom, toast } from '../../src/ui/overlays';
import { PressableScale } from '../../src/ui/PressableScale';
import { Switch } from '../../src/ui/feedback';

export default function SettingsScreen() {
  const c = usePalette();
  const t = useScreenStrings();
  const insets = useSafeAreaInsets();
  const appearanceRef = useRef<View>(null);
  const languageRef = useRef<View>(null);
  const theme = useApp(state => state.theme);
  const locale = useApp(state => state.locale);
  const session = useAccount(state => state.session);
  const nickname = useAccount(state => state.profile.nickname);
  const unlocked = useAccount(state => state.dev.unlocked);
  const preview = useAccount(state => state.dev.previewFixtures);
  const footerTaps = useRef(0);
  const participantId = session?.participantId ?? '';
  const displayName = nickname.trim() || participantId;
  const themeLabel = t.settings.themes[theme];

  const showThemeMenu = useCallback(() => openMenuFrom(appearanceRef.current, {
    items: (['system', 'dark', 'light'] as const).map(value => ({
      key: value, label: t.settings.themes[value], checked: theme === value,
      onPress: () => setTheme(value),
    })),
  }), [theme, t]);
  const showLanguageMenu = useCallback(() => openMenuFrom(languageRef.current, {
    items: ([{ value: 'en' as const, label: t.common.english }, { value: 'de' as const, label: t.common.german }]).map(item => ({
      key: item.value, label: item.label, checked: locale === item.value, onPress: () => setLocale(item.value),
    })),
  }), [locale, t]);
  const handleSignOut = useCallback(async () => {
    if (await confirm({ title: t.settings.signOutTitle, message: t.settings.signOutMessage, confirmLabel: t.settings.signOut, cancelLabel: t.common.cancel, destructive: true })) signOut();
  }, [t]);
  const tapVersion = useCallback(() => {
    footerTaps.current += 1;
    if (footerTaps.current >= 7 && !unlocked) {
      setDevFlags({ unlocked: true });
      toast(t.settings.developerOn);
    }
  }, [t, unlocked]);

  return <View style={{ flex: 1, backgroundColor: c.canvas, paddingTop: insets.top }}>
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      <IconButton label={t.common.back} variant="surface" size={44} onPress={() => router.back()}><Icon name="arrow-left" color={c.text} /></IconButton>
    </View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 24) + 24 }}>
      <View style={{ alignItems: 'center', paddingTop: 4, paddingBottom: 30 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ ...type.title, fontSize: 28, lineHeight: 34, color: c.onAccent }}>{(displayName[0] || 'D').toLocaleUpperCase()}</Text>
        </View>
        <Text accessibilityRole="header" numberOfLines={1} style={{ ...type.title, color: c.text, marginTop: 12, maxWidth: '92%' }}>{displayName}</Text>
        <Text style={{ ...type.helper, color: c.muted, marginTop: 3 }}>{participantId}</Text>
      </View>

      <SettingsGroup title={t.settings.myDaimon}>
        <SettingsRow first label={t.settings.personalization} icon="smile" chevron onPress={() => router.push('/settings/personalization')} />
        <SettingsRow last label={t.settings.memory} icon="book-open" chevron onPress={() => router.push('/settings/memory')} />
      </SettingsGroup>

      <SettingsGroup title={t.settings.app}>
        <SettingsRow ref={appearanceRef} first label={t.settings.appearance} icon="sun" value={themeLabel} chevron onPress={showThemeMenu} />
        <SettingsRow ref={languageRef} last label={t.settings.language} icon="globe" value={locale === 'en' ? t.common.english : t.common.german} chevron onPress={showLanguageMenu} />
      </SettingsGroup>

      <SettingsGroup title={t.settings.account}>
        <SettingsRow first label={t.settings.participantId} icon="user" value={participantId} />
        <SettingsRow last label={t.settings.signOut} icon="log-out" danger onPress={handleSignOut} />
      </SettingsGroup>

      {unlocked ? <SettingsGroup title={t.settings.developer}>
        <SettingsRow first last label={t.settings.previewFixtures} subtitle={t.settings.previewHelper} trailing={<Switch label={t.settings.previewFixtures} value={preview} onValueChange={value => setDevFlags({ previewFixtures: value })} />} />
      </SettingsGroup> : null}

      <PressableScale accessibilityRole="button" accessibilityLabel={t.settings.version} onPress={tapVersion} scaleTo={0.98} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
        <Text style={{ ...type.helper, color: c.muted }}>{t.settings.version}</Text>
      </PressableScale>
    </ScrollView>
  </View>;
}
