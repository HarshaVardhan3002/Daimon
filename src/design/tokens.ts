import { Easing } from 'react-native-reanimated';

export type ThemeMode = 'dark' | 'light';
export type ThemePreference = ThemeMode | 'system';
export type Locale = 'en' | 'de';

/**
 * Semantic colour roles. Everything on screen reads from these.
 *
 * Daimon's identity is the night sky: dark is deep space (true AMOLED black, indigo nebula surfaces, a starlight-gold
 * accent taken from the star in the mark); light is dawn (moonlit paper, ink-navy text, a twilight-indigo accent).
 * Both are designed as first-class themes, not inversions of each other.
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
    canvas: '#000000', surface: '#1B1C27', raised: '#2A2C3B', selected: '#12131B', drawer: '#000000',
    text: '#F3F1EA', muted: '#A4A6B9', faint: '#7F8298', accent: '#EDD7A4', onAccent: '#0B0C14',
    user: '#1B2040', userText: '#F3F1EA', line: '#FFFFFF17', danger: '#FF8A7E', success: '#7ED8B4',
    scrim: '#000000', code: '#0D0E16',
  },
  light: {
    canvas: '#FBFAF6', surface: '#F0F0F5', raised: '#E4E5EE', selected: '#FFFFFF', drawer: '#F5F4EF',
    text: '#15162B', muted: '#585B72', faint: '#8A8CA2', accent: '#2F3A8F', onAccent: '#FFFFFF',
    user: '#E6E9F8', userText: '#15162B', line: '#15162B14', danger: '#C7362C', success: '#17795D',
    scrim: '#0B0C1A', code: '#F1F1F6',
  },
};

/**
 * Cosmic colours shared by both themes: they only appear on dark HUD surfaces (the effort dial, learning cards'
 * celebratory states), so they are not part of the light/dark palette.
 */
export const cosmos = {
  /** Deep-space HUD surface the dial sits on. */
  hud: { capsule: '#161724', border: '#2C2E44', rail: '#262840', dot: 'rgba(233,230,255,0.28)', thumb: '#FFFFFF', text: '#F3F1EA', muted: '#A4A6B9' },
  /** Energy ramp from calm to intense: moonlit teal, nebula indigo, stellar violet, solar gold. */
  energy: ['#5CC8D6', '#7C8CFF', '#B287F8', '#F2B872'] as const,
  /** Fixed star positions (fractions of the rail) so the starfield is the same on every render. */
  stars: [
    [0.04, 0.3, 1.2], [0.09, 0.72, 0.9], [0.15, 0.42, 1.5], [0.21, 0.18, 0.8], [0.27, 0.64, 1.1], [0.33, 0.35, 0.9],
    [0.39, 0.8, 1.3], [0.45, 0.24, 1], [0.51, 0.58, 1.6], [0.57, 0.3, 0.8], [0.63, 0.74, 1.1], [0.69, 0.44, 0.9],
    [0.75, 0.2, 1.3], [0.81, 0.62, 1], [0.87, 0.36, 1.4], [0.93, 0.7, 0.9], [0.97, 0.26, 1.1],
  ] as const,
} as const;

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
