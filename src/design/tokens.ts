import { Easing } from 'react-native-reanimated';

export type ThemeMode = 'dark' | 'light';
export type ThemePreference = ThemeMode | 'system';
export type Locale = 'en' | 'de';

/**
 * Semantic colour roles. Everything on screen reads from these, so the planned colour overhaul is a change to
 * this file only. Dark values are sampled from the ChatGPT Android reference (see forensics/phone-audit).
 */
export type Palette = {
  canvas: string;
  /** Composer, menus, grouped settings rows. */
  surface: string;
  /** Pressed rows, icon wells on a surface. */
  raised: string;
  /** Selected segment inside a surface. */
  selected: string;
  /** Drawer background. */
  drawer: string;
  text: string;
  muted: string;
  /** Placeholders and disabled glyphs. */
  faint: string;
  accent: string;
  /** Glyphs drawn on the accent (send, stop). */
  onAccent: string;
  /** User message bubble. */
  user: string;
  userText: string;
  line: string;
  danger: string;
  success: string;
  /** Backdrop behind menus, sheets and the drawer. */
  scrim: string;
  /** Code blocks. */
  code: string;
};

export const palettes: Record<ThemeMode, Palette> = {
  dark: {
    canvas: '#000000', surface: '#303030', raised: '#414141', selected: '#212121', drawer: '#000000',
    text: '#F7F7F5', muted: '#A7A7A7', faint: '#8A8A8A', accent: '#A67DF3', onAccent: '#FFFFFF',
    user: '#3A2465', userText: '#F7F7F5', line: '#FFFFFF1A', danger: '#FF7A73', success: '#6CCB8A',
    scrim: '#000000', code: '#171717',
  },
  light: {
    canvas: '#FFFFFF', surface: '#F2F2F2', raised: '#E5E5E5', selected: '#FFFFFF', drawer: '#F9F9F9',
    text: '#0D0D0D', muted: '#5D5D5D', faint: '#8F8F8F', accent: '#7652B7', onAccent: '#FFFFFF',
    user: '#EDE4FC', userText: '#0D0D0D', line: '#0D0D0D14', danger: '#D92D20', success: '#1E8E3E',
    scrim: '#000000', code: '#F4F4F4',
  },
};

export const font = {
  light: 'Inter_300Light',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Type roles (size/line height in dp). */
export const type = {
  display: { fontFamily: font.semibold, fontSize: 26, lineHeight: 32 },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26 },
  heading: { fontFamily: font.semibold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: font.medium, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  labelRegular: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  helper: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16 },
} as const;

export const radius = { chip: 12, row: 14, bubble: 20, card: 22, composer: 26, sheet: 30, pill: 999 } as const;

/** Minimum touch target. */
export const HIT = 44;

/**
 * Motion vocabulary. Press 120–180 ms, local menus 160–240 ms, containers 220–320 ms, exits shorter than entries.
 * Reanimated honours the system reduce-motion setting for all of these by default.
 */
export const motion = {
  press: 120,
  quick: 160,
  local: 200,
  container: 280,
  exit: 150,
  /** Material "emphasized decelerate": fast start, long settle. */
  enter: Easing.bezier(0.05, 0.7, 0.1, 1),
  /** Material "emphasized accelerate". */
  leave: Easing.bezier(0.3, 0, 0.8, 0.15),
  standard: Easing.bezier(0.2, 0, 0, 1),
  spring: { damping: 24, stiffness: 280, mass: 1 },
  snappy: { damping: 30, stiffness: 420, mass: 1 },
  /** Critically damped: sheets and the drawer settle without overshoot. */
  settle: { damping: 36, stiffness: 320, mass: 1, overshootClamping: true },
} as const;
