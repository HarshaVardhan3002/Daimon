export type ThemeMode = 'dark' | 'light';
export type Locale = 'en' | 'de';
export const themes = {
  dark: { canvas: '#000000', surface: '#303030', raised: '#414141', selected: '#212121', text: '#F7F7F5', muted: '#A7A7A7', faint: '#777777', accent: '#A67DF3', user: '#3A2465', line: '#FFFFFF1A', danger: '#FF827B' },
  light: { canvas: '#F7F7F5', surface: '#EAEAE7', raised: '#E0E0DC', selected: '#FFFFFF', text: '#191919', muted: '#666666', faint: '#81817D', accent: '#7652B7', user: '#E9DDFB', line: '#1B1B1A1A', danger: '#B42318' },
} as const;
export const copy = {
  en: {
    title: 'Daimon', newChat: 'New chat', composer: 'Message Daimon', menu: 'Open navigation', send: 'Send message', stop: 'Stop response', thinking: 'Thinking …', copy: 'Copy answer', greeting: 'What can I help with?', greetingHint: 'Ask a question, explore an idea, or work through something step by step.', drawerTitle: 'Daimon', search: 'Search', searchPlaceholder: 'Search conversations', recents: 'Recents', chat: 'Chat', profile: 'Profile and settings', theme: 'Appearance', language: 'Language', dark: 'Dark', light: 'Light', english: 'English', german: 'German', close: 'Close', noResults: 'No conversations found', profileTitle: 'Settings', back: 'Back', assistantLabel: 'Daimon response',
  },
  de: {
    title: 'Daimon', newChat: 'Neuer Chat', composer: 'Nachricht an Daimon', menu: 'Navigation öffnen', send: 'Nachricht senden', stop: 'Antwort anhalten', thinking: 'Denke nach …', copy: 'Antwort kopieren', greeting: 'Was kann ich für dich tun?', greetingHint: 'Stelle eine Frage, entwickle eine Idee oder arbeite etwas Schritt für Schritt durch.', drawerTitle: 'Daimon', search: 'Suche', searchPlaceholder: 'Unterhaltungen suchen', recents: 'Zuletzt verwendet', chat: 'Chat', profile: 'Profil und Einstellungen', theme: 'Darstellung', language: 'Sprache', dark: 'Dunkel', light: 'Hell', english: 'Englisch', german: 'Deutsch', close: 'Schließen', noResults: 'Keine Unterhaltungen gefunden', profileTitle: 'Einstellungen', back: 'Zurück', assistantLabel: 'Antwort von Daimon',
  },
} as const;
