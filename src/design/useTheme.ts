import { useColorScheme } from 'react-native';
import { useApp } from '../state/appStore';
import { palettes, type Palette, type ThemeMode } from './tokens';

export function useThemeMode(): ThemeMode {
  const preference = useApp(state => state.theme);
  const system = useColorScheme();
  if (preference !== 'system') return preference;
  return system === 'light' ? 'light' : 'dark';
}

export function usePalette(): Palette { return palettes[useThemeMode()]; }
