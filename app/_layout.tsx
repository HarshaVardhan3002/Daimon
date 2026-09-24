import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider, useAppSettings } from '../src/state/AppState';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const { theme } = useAppSettings();
  useEffect(() => {
    if (fontsLoaded || fontError) { void SplashScreen.hideAsync(); return; }
    const fallback = setTimeout(() => { void SplashScreen.hideAsync(); }, 2500);
    return () => clearTimeout(fallback);
  }, [fontsLoaded, fontError]);
  return <><StatusBar style={theme === 'dark' ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: theme === 'dark' ? '#000000' : '#F7F7F5' } }} /></>;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><AppProvider><RootNavigator /></AppProvider></GestureHandlerRootView>;
}
