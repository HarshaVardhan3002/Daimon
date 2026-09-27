import 'react-native-gesture-handler';
import { Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SplashOverlay } from '../src/brand/SplashOverlay';
import { type } from '../src/design/tokens';
import { usePalette, useThemeMode } from '../src/design/useTheme';
import { useStrings } from '../src/i18n/strings';
import { hydrateAccount, useAccount } from '../src/state/accountStore';
import { hydrateLearningTaste } from '../src/learning/taste';
import { hydrateApp, useApp } from '../src/state/appStore';
import { startProbes } from '../src/telemetry/probes';
import { hydrateTelemetry, track } from '../src/telemetry/telemetry';
import type { Screen } from '../src/telemetry/events';
import { OverlayHost } from '../src/ui/overlays';
import { PressableScale } from '../src/ui/PressableScale';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
// Start reading storage before the first render; the native splash covers the wait.
void hydrateApp();
void hydrateAccount();
void hydrateLearningTaste();
void hydrateTelemetry();
startProbes();
track('app_open', { cold: true });

const SCREENS: Record<string, Screen> = { '/': 'chat', '/search': 'search', '/settings': 'settings', '/settings/personalization': 'personalization', '/settings/memory': 'memory', '/welcome': 'welcome', '/sign-in': 'sign_in' };

function ScreenProbe() {
  const path = usePathname();
  useEffect(() => { const screen = SCREENS[path]; if (screen) track('screen_view', { screen }); }, [path]);
  return null;
}

const FONT_TIMEOUT_MS = 2500;

function HydrationProblem() {
  const c = usePalette(); const t = useStrings();
  const status = useApp(state => state.hydrationStatus);
  return <View style={{ flex: 1, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
    {status === 'loading' ? <><ActivityIndicator color={c.accent} /><Text style={{ ...type.labelRegular, color: c.muted, marginTop: 14 }}>{t.loadingChats}</Text></> : <>
      <Text accessibilityRole="header" style={{ ...type.title, color: c.text, textAlign: 'center' }}>{t.loadFailedTitle}</Text>
      <Text style={{ ...type.labelRegular, color: c.muted, textAlign: 'center', marginTop: 10 }}>{t.loadFailedBody}</Text>
      <PressableScale onPress={() => void hydrateApp()} accessibilityRole="button" style={{ marginTop: 20, minHeight: 48, paddingHorizontal: 22, borderRadius: 24, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ ...type.label, color: c.canvas }}>{t.tryAgain}</Text>
      </PressableScale>
    </>}
  </View>;
}

function RootNavigator() {
  const [fontsLoaded, fontError] = useFonts({ Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [fontTimeout, setFontTimeout] = useState(false);
  const hydration = useApp(state => state.hydrationStatus);
  const accountReady = useAccount(state => state.status === 'ready');
  const signedIn = useAccount(state => Boolean(state.session));
  const mode = useThemeMode();
  const c = usePalette();
  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timer = setTimeout(() => setFontTimeout(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [fontError, fontsLoaded]);
  const fontsReady = fontsLoaded || Boolean(fontError) || fontTimeout;
  const ready = fontsReady && hydration !== 'loading' && accountReady;
  // Only once the app renders (under the splash overlay): earlier, a light canvas would flash between splash frames.
  useEffect(() => { if (ready) void SystemUI.setBackgroundColorAsync(c.canvas).catch(() => undefined); }, [c.canvas, ready]);
  const healthy = hydration === 'ready';
  // The splash overlay renders from the first commit so it can take over from the native splash while fonts and
  // storage load; the app mounts under it once ready. It stays in one place in the tree so it never remounts.
  return <>
    {ready ? <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {healthy ? <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.canvas }, animation: 'slide_from_right', animationDuration: 280, gestureEnabled: true }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="search" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="settings/index" />
          <Stack.Screen name="settings/personalization" />
          <Stack.Screen name="settings/memory" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack> : <HydrationProblem />}
      {healthy ? <ScreenProbe /> : null}
      <OverlayHost />
    </> : <StatusBar style="light" />}
    <SplashOverlay background="#000000" ready={ready} />
  </>;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <KeyboardProvider>
        <RootNavigator />
      </KeyboardProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>;
}
