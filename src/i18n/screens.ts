import type { Locale } from '../design/tokens';
import { useApp } from '../state/appStore';

const en = {
  common: {
    back: 'Back', save: 'Save', saved: 'Saved', cancel: 'Cancel', close: 'Close',
    discardTitle: 'Discard changes?', discardMessage: 'Your unsaved changes will be lost.', discard: 'Discard',
    english: 'English', german: 'Deutsch',
  },
  welcome: {
    phrases: ['Ask anything.', 'Think it through.', 'Learn something new.', 'Work it out step by step.'],
    signIn: 'Sign in', language: 'Language',
    helper: 'For study participants. Your study team gives you your sign-in details.',
  },
  signIn: {
    title: 'Sign in', subtitle: 'Use the participant ID and password from your study team.',
    participantId: 'Participant ID', password: 'Password', showPassword: 'Show password', hidePassword: 'Hide password',
    continue: 'Continue', loading: 'Signing in',
    invalidId: 'Enter a valid participant ID (3–32 letters, numbers, hyphens or underscores).',
    invalidPassword: 'Enter a password with at least 4 characters.', failed: 'Could not sign in. Please try again.',
    development: 'Development sign-in · no server check yet',
  },
  search: { placeholder: 'Search chats', recent: 'Recent', noResults: 'No chats found', clear: 'Clear search', openChat: (title: string) => `Open chat: ${title}` },
  settings: {
    title: 'Settings', myDaimon: 'My Daimon', personalization: 'Personalization', memory: 'Memory', app: 'App',
    appearance: 'Appearance', language: 'Language', themes: { system: 'System', dark: 'Dark', light: 'Light' },
    account: 'Account', participantId: 'Participant ID', signOut: 'Sign out', signOutTitle: 'Sign out?',
    signOutMessage: 'Your chats stay on this phone.', version: 'Daimon 1.0.0', developer: 'Developer',
    developerOn: 'Developer options on', previewFixtures: 'Preview fixtures',
    previewHelper: 'Shows sample sources, thinking and memories so the UI can be reviewed. Never shown to participants unless switched on here.',
  },
  personalization: {
    title: 'Personalization', voice: 'Daimon’s voice', voiceHelper: 'How Daimon sounds when it answers you.',
    styles: { default: 'Balanced', professional: 'Precise', friendly: 'Warm', candid: 'Direct', quirky: 'Playful', efficient: 'Brief' },
    styleHints: { default: 'Clear and even', professional: 'Exact, technical', friendly: 'Kind, encouraging', candid: 'Straight to the point', quirky: 'Light, with wit', efficient: 'As short as possible' },
    sampleQuestion: 'Why is the sky blue?',
    samples: {
      default: 'Sunlight scatters off the air, and blue light scatters the most, so it reaches your eyes from every direction.',
      professional: 'Rayleigh scattering: shorter wavelengths scatter far more strongly, so diffuse skylight is dominated by blue.',
      friendly: 'Good question. Sunlight bounces around in the air, and blue bounces the most, so the whole sky glows blue for you.',
      candid: 'Air scatters blue light much more than red. That scattered blue is what you see. It is not the ocean reflecting.',
      quirky: 'The atmosphere is a pinball machine for light, and blue photons rack up the most bounces.',
      efficient: 'Air scatters blue light the most.',
    },
    fineTune: 'Fine-tune', fineTuneHelper: 'Small adjustments on top of the voice.', allDefault: 'All default',
    warmth: 'Warmth', enthusiasm: 'Energy', headers: 'Structure', emoji: 'Emoji',
    levels: { less: 'Less', default: 'Default', more: 'More' },
    customInstructions: 'Anything else', instructionsPlaceholder: 'Anything Daimon should keep in mind when responding',
  },
  memory: {
    title: 'Memory', enable: 'Enable memory', enableHelper: 'Let Daimon remember useful details from your chats.',
    knows: 'What Daimon knows about you', actions: 'Memory actions', wrong: "That's wrong", delete: 'Delete',
    forgotten: 'Thanks. Daimon will forget this.', deleteTitle: 'Delete memory?', deleteMessage: 'This memory will be removed.',
    emptyTitle: 'Nothing saved yet',
    emptyHelper: 'When Daimon learns something useful about you, it shows up here. You can correct or delete it at any time.',
    preview: 'Preview', fixtures: ['You are studying biology.', 'You enjoy hiking in your free time.', 'You are learning Spanish.'],
    deleteAll: 'Delete all memories', deleteAllTitle: 'Delete all memories?', deleteAllMessage: 'All saved memories will be removed.',
    aboutYou: 'About you', nickname: 'Your nickname', occupation: 'Your occupation', about: 'More about you',
  },
};

export type ScreenStrings = typeof en;

const de: typeof en = {
  common: {
    back: 'Zurück', save: 'Speichern', saved: 'Gespeichert', cancel: 'Abbrechen', close: 'Schließen',
    discardTitle: 'Änderungen verwerfen?', discardMessage: 'Deine ungespeicherten Änderungen gehen verloren.', discard: 'Verwerfen',
    english: 'English', german: 'Deutsch',
  },
  welcome: {
    phrases: ['Frag, was du möchtest.', 'Denk es in Ruhe durch.', 'Lerne etwas Neues.', 'Finde Schritt für Schritt eine Lösung.'],
    signIn: 'Anmelden', language: 'Sprache',
    helper: 'Für Studienteilnehmende. Deine Zugangsdaten bekommst du vom Studienteam.',
  },
  signIn: {
    title: 'Anmelden', subtitle: 'Verwende die Teilnahme-ID und das Passwort von deinem Studienteam.',
    participantId: 'Teilnahme-ID', password: 'Passwort', showPassword: 'Passwort anzeigen', hidePassword: 'Passwort ausblenden',
    continue: 'Weiter', loading: 'Anmeldung läuft',
    invalidId: 'Gib eine gültige Teilnahme-ID ein (3–32 Buchstaben, Ziffern, Bindestriche oder Unterstriche).',
    invalidPassword: 'Gib ein Passwort mit mindestens 4 Zeichen ein.', failed: 'Anmeldung nicht möglich. Bitte versuche es erneut.',
    development: 'Entwicklungsanmeldung · noch keine Serverprüfung',
  },
  search: { placeholder: 'Chats durchsuchen', recent: 'Zuletzt', noResults: 'Keine Chats gefunden', clear: 'Suche löschen', openChat: (title: string) => `Chat öffnen: ${title}` },
  settings: {
    title: 'Einstellungen', myDaimon: 'Mein Daimon', personalization: 'Personalisierung', memory: 'Erinnerungen', app: 'App',
    appearance: 'Darstellung', language: 'Sprache', themes: { system: 'System', dark: 'Dunkel', light: 'Hell' },
    account: 'Konto', participantId: 'Teilnahme-ID', signOut: 'Abmelden', signOutTitle: 'Abmelden?',
    signOutMessage: 'Deine Chats bleiben auf diesem Handy gespeichert.', version: 'Daimon 1.0.0', developer: 'Entwicklung',
    developerOn: 'Entwicklungsoptionen aktiviert', previewFixtures: 'Beispieldaten anzeigen',
    previewHelper: 'Zeigt beispielhafte Quellen, Denkschritte und Erinnerungen zur Prüfung der Oberfläche. Teilnehmende sehen diese nur, wenn sie hier eingeschaltet werden.',
  },
  personalization: {
    title: 'Personalisierung', voice: 'Daimons Stimme', voiceHelper: 'Wie Daimon klingt, wenn es dir antwortet.',
    styles: { default: 'Ausgewogen', professional: 'Präzise', friendly: 'Herzlich', candid: 'Direkt', quirky: 'Verspielt', efficient: 'Knapp' },
    styleHints: { default: 'Klar und ruhig', professional: 'Genau und fachlich', friendly: 'Freundlich, ermutigend', candid: 'Ohne Umwege', quirky: 'Leicht, mit Witz', efficient: 'So kurz wie möglich' },
    sampleQuestion: 'Warum ist der Himmel blau?',
    samples: {
      default: 'Sonnenlicht wird an der Luft gestreut, blaues Licht am stärksten. Deshalb erreicht es dein Auge aus allen Richtungen.',
      professional: 'Rayleigh-Streuung: Kurze Wellenlängen werden deutlich stärker gestreut, daher dominiert Blau im diffusen Himmelslicht.',
      friendly: 'Gute Frage. Sonnenlicht prallt in der Luft hin und her, Blau am meisten, und so leuchtet der ganze Himmel blau für dich.',
      candid: 'Luft streut blaues Licht viel stärker als rotes. Dieses gestreute Blau siehst du. Das Meer spiegelt sich da nicht.',
      quirky: 'Die Atmosphäre ist ein Flipperautomat für Licht, und blaue Photonen sammeln die meisten Treffer.',
      efficient: 'Luft streut blaues Licht am stärksten.',
    },
    fineTune: 'Feinabstimmung', fineTuneHelper: 'Kleine Anpassungen zusätzlich zur Stimme.', allDefault: 'Alles Standard',
    warmth: 'Herzlichkeit', enthusiasm: 'Energie', headers: 'Struktur', emoji: 'Emojis',
    levels: { less: 'Weniger', default: 'Standard', more: 'Mehr' },
    customInstructions: 'Sonst noch etwas', instructionsPlaceholder: 'Was Daimon beim Antworten berücksichtigen soll',
  },
  memory: {
    title: 'Erinnerungen', enable: 'Erinnerungen aktivieren', enableHelper: 'Lass Daimon nützliche Details aus deinen Chats speichern.',
    knows: 'Was Daimon über dich weiß', actions: 'Aktionen für diese Erinnerung', wrong: 'Das stimmt nicht', delete: 'Löschen',
    forgotten: 'Danke. Daimon wird das vergessen.', deleteTitle: 'Erinnerung löschen?', deleteMessage: 'Diese Erinnerung wird entfernt.',
    emptyTitle: 'Noch nichts gespeichert',
    emptyHelper: 'Wenn Daimon etwas Nützliches über dich erfährt, erscheint es hier. Du kannst es jederzeit korrigieren oder löschen.',
    preview: 'Vorschau', fixtures: ['Du studierst Biologie.', 'Du gehst in deiner Freizeit gerne wandern.', 'Du lernst Spanisch.'],
    deleteAll: 'Alle Erinnerungen löschen', deleteAllTitle: 'Alle Erinnerungen löschen?', deleteAllMessage: 'Alle gespeicherten Erinnerungen werden entfernt.',
    aboutYou: 'Über dich', nickname: 'Dein Spitzname', occupation: 'Dein Beruf', about: 'Mehr über dich',
  },
};

export const screenStrings: Record<Locale, ScreenStrings> = { en, de };
export function useScreenStrings(): ScreenStrings { return screenStrings[useApp(state => state.locale)]; }
