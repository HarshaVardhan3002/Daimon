import { useApp } from '../state/appStore';
import type { Locale } from '../design/tokens';

const en = {
  appName: 'Daimon',
  // Chat shell
  openMenu: 'Open navigation', newChat: 'New chat', chatActions: 'Chat actions', greeting: 'What can I help with?',
  composerPlaceholder: 'Ask Daimon', replyPlaceholder: 'Reply to Daimon', composerLabel: 'Message Daimon',
  addAttachment: 'Add attachment', closeAttachmentMenu: 'Dismiss attachment menu', camera: 'Camera', photos: 'Photos', files: 'Files',
  thinkHarder: 'Think harder', thinkHarderHint: 'Uses more reasoning for harder questions',
  send: 'Send message', stop: 'Stop response', dictate: 'Dictate', thinkingDial: 'Thinking dial', closeDial: 'Close reasoning effort',
  scrollToBottom: 'Scroll to latest message', thinking: 'Thinking', working: 'Working on it',
  thoughtFor: (seconds: number) => `Thought for ${seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`}`,
  effortLabel: { instant: 'Instant', medium: 'Medium', high: 'High', default: 'Default' },
  effortWord: 'effort', chooseEffort: 'Choose effort',
  // Messages
  copy: 'Copy', copied: 'Copied', copyFailed: 'Could not copy', readAloud: 'Read aloud', stopReading: 'Stop reading', share: 'Share', more: 'More actions',
  retry: 'Retry', regenerate: 'Regenerate', branch: 'Branch in new chat', branched: 'Opened a branch of this chat', selectText: 'Select text', editMessage: 'Edit message', sharePrompt: 'Share prompt',
  usedModel: (label: string) => `Used ${label}`, defaultModel: 'Default model', thinkingModel: (effort: string) => `Thinking · ${effort}`,
  sources: 'Sources', moreSources: 'More', assistantLabel: 'Daimon response', yourMessage: 'Your message',
  editing: 'Editing message', editingHint: 'Sending replaces this message and everything after it.', cancelEdit: 'Cancel editing',
  regenerating: 'Regenerating…', responseStopped: 'Response stopped', responseFailed: 'Couldn’t get a response', retryUnavailable: ' · Retry is no longer available',
  readAloudFailed: 'Could not read aloud', shareFailed: 'Could not share', attachedImage: 'Attached image', imageInDraft: 'Image in draft', removeImage: 'Remove image', removeFile: 'Remove file',
  // Header menu
  shareChat: 'Share', rename: 'Rename', delete: 'Delete', forgetDocument: 'Forget document context', settings: 'Settings',
  renameTitle: 'Rename chat', renamePlaceholder: 'Chat name', save: 'Save', cancel: 'Cancel', close: 'Close', closeMenu: 'Close menu',
  deleteTitle: 'Delete chat?', deleteMessage: (title: string) => `This will delete “${title}”.`, deleted: 'Chat deleted',
  you: 'You',
  // Drawer
  searchChats: 'Search chats', recents: 'Recents', noChats: 'No chats yet', chat: 'Chat', profile: 'Profile and settings', today: 'Today', yesterday: 'Yesterday', previous7: 'Previous 7 days', older: 'Older',
  // Dictation
  dictationPreview: 'Dictation preview · not transcribing yet', cancelDictation: 'Cancel dictation', stopDictation: 'Stop dictation', dictationUnavailable: 'Dictation isn’t connected yet',
  // Loading / errors
  loadingChats: 'Loading saved chats …', loadFailedTitle: 'Saved data could not be loaded', loadFailedBody: 'Stored data has not been replaced. Try loading it again.', tryAgain: 'Try again',
  lesson: {
    next: 'Next', finish: 'Finish deck', score: (correct: number, total: number) => `${correct} of ${total}`,
    more: 'More like this', less: 'Less like this', reviewMissed: 'Review missed', reviewDone: 'Finish review',
    completed: 'Completed', cardPosition: (index: number, total: number) => `Card ${index} of ${total}`,
    deckFinished: 'Lesson complete', previewIntro: 'A short lesson about black holes',
    flipHint: 'Tap to turn over', knewIt: 'Knew it', notYet: 'Not yet',
    moreShort: 'More', lessShort: 'Less', tasteTitle: 'Which kinds of cards should Daimon use more?',
    swipeNext: 'Swipe for the next card', answerFirst: 'Answer to continue', flipFirst: 'Tap the card to turn it over',
    howSure: 'How sure are you?', guess: 'Guess', thinkSo: 'Think so', sure: 'Sure',
    true: 'True', false: 'False', chooseAnswer: 'Choose an answer', blank: 'blank', option: (index: number) => `Option ${index}`,
    showOrder: 'Show order', yourOrder: 'Your order', addStep: 'Add step', matchLeft: 'Choose an item', matchRight: 'Choose its match',
    correct: 'Correct', notQuite: 'Not quite', reveal: 'Show answer',
    kind: { idea: 'Idea', flip: 'Recall', mcq: 'Multiple choice', swipe: 'True or false', cloze: 'Fill the blank', order: 'Order', match: 'Match' },
  },
};

export type Strings = typeof en;

const de: Strings = {
  appName: 'Daimon',
  openMenu: 'Navigation öffnen', newChat: 'Neuer Chat', chatActions: 'Chataktionen', greeting: 'Wobei kann ich helfen?',
  composerPlaceholder: 'Frag Daimon', replyPlaceholder: 'Daimon antworten', composerLabel: 'Nachricht an Daimon',
  addAttachment: 'Anhang hinzufügen', closeAttachmentMenu: 'Anhangmenü schließen', camera: 'Kamera', photos: 'Fotos', files: 'Dateien',
  thinkHarder: 'Gründlicher nachdenken', thinkHarderHint: 'Mehr Denkaufwand für schwierige Fragen',
  send: 'Nachricht senden', stop: 'Antwort anhalten', dictate: 'Diktieren', thinkingDial: 'Denkstufe', closeDial: 'Denkstufe schließen',
  scrollToBottom: 'Zur neuesten Nachricht', thinking: 'Denkt nach', working: 'Wird bearbeitet',
  thoughtFor: (seconds: number) => `${seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`} nachgedacht`,
  effortLabel: { instant: 'Sofort', medium: 'Mittel', high: 'Hoch', default: 'Standard' },
  effortWord: 'Aufwand', chooseEffort: 'Denkaufwand wählen',
  copy: 'Kopieren', copied: 'Kopiert', copyFailed: 'Kopieren nicht möglich', readAloud: 'Vorlesen', stopReading: 'Vorlesen anhalten', share: 'Teilen', more: 'Weitere Aktionen',
  retry: 'Erneut versuchen', regenerate: 'Neu generieren', branch: 'In neuem Chat abzweigen', branched: 'Abzweigung dieses Chats geöffnet', selectText: 'Text auswählen', editMessage: 'Nachricht bearbeiten', sharePrompt: 'Prompt teilen',
  usedModel: (label: string) => `Verwendet: ${label}`, defaultModel: 'Standardmodell', thinkingModel: (effort: string) => `Denken · ${effort}`,
  sources: 'Quellen', moreSources: 'Weitere', assistantLabel: 'Antwort von Daimon', yourMessage: 'Deine Nachricht',
  editing: 'Nachricht bearbeiten', editingHint: 'Beim Senden werden diese Nachricht und alles danach ersetzt.', cancelEdit: 'Bearbeiten abbrechen',
  regenerating: 'Wird neu generiert…', responseStopped: 'Antwort angehalten', responseFailed: 'Antwort konnte nicht geladen werden', retryUnavailable: ' · Erneut versuchen nicht mehr verfügbar',
  readAloudFailed: 'Vorlesen nicht möglich', shareFailed: 'Teilen nicht möglich', attachedImage: 'Angehängtes Bild', imageInDraft: 'Bild im Entwurf', removeImage: 'Bild entfernen', removeFile: 'Datei entfernen',
  shareChat: 'Teilen', rename: 'Umbenennen', delete: 'Löschen', forgetDocument: 'Dateikontext entfernen', settings: 'Einstellungen',
  renameTitle: 'Chat umbenennen', renamePlaceholder: 'Name des Chats', save: 'Speichern', cancel: 'Abbrechen', close: 'Schließen', closeMenu: 'Menü schließen',
  deleteTitle: 'Chat löschen?', deleteMessage: (title: string) => `„${title}“ wird gelöscht.`, deleted: 'Chat gelöscht',
  you: 'Du',
  searchChats: 'Chats durchsuchen', recents: 'Zuletzt', noChats: 'Noch keine Chats', chat: 'Chat', profile: 'Profil und Einstellungen', today: 'Heute', yesterday: 'Gestern', previous7: 'Letzte 7 Tage', older: 'Älter',
  dictationPreview: 'Diktiervorschau · noch keine Transkription', cancelDictation: 'Diktieren abbrechen', stopDictation: 'Diktieren beenden', dictationUnavailable: 'Diktieren ist noch nicht verbunden',
  loadingChats: 'Gespeicherte Chats werden geladen …', loadFailedTitle: 'Gespeicherte Daten konnten nicht geladen werden', loadFailedBody: 'Die gespeicherten Daten wurden nicht ersetzt. Versuche, sie erneut zu laden.', tryAgain: 'Erneut versuchen',
  lesson: {
    next: 'Weiter', finish: 'Lektion beenden', score: (correct: number, total: number) => `${correct} von ${total}`,
    more: 'Mehr davon', less: 'Weniger davon', reviewMissed: 'Falsche Karten wiederholen', reviewDone: 'Wiederholung beenden',
    completed: 'Abgeschlossen', cardPosition: (index: number, total: number) => `Karte ${index} von ${total}`,
    deckFinished: 'Lektion abgeschlossen', previewIntro: 'Eine kurze Lektion über Schwarze Löcher',
    flipHint: 'Zum Umdrehen tippen', knewIt: 'Gewusst', notYet: 'Noch nicht',
    moreShort: 'Mehr', lessShort: 'Weniger', tasteTitle: 'Welche Kartenarten soll Daimon öfter nutzen?',
    swipeNext: 'Wischen für die nächste Karte', answerFirst: 'Erst antworten, dann weiter', flipFirst: 'Tippe auf die Karte, um sie umzudrehen',
    howSure: 'Wie sicher bist du?', guess: 'Geraten', thinkSo: 'Ziemlich sicher', sure: 'Sicher',
    true: 'Wahr', false: 'Falsch', chooseAnswer: 'Wähle eine Antwort', blank: 'Lücke', option: (index: number) => `Option ${index}`,
    showOrder: 'Reihenfolge zeigen', yourOrder: 'Deine Reihenfolge', addStep: 'Schritt hinzufügen', matchLeft: 'Wähle einen Eintrag', matchRight: 'Wähle die passende Seite',
    correct: 'Richtig', notQuite: 'Nicht ganz', reveal: 'Antwort zeigen',
    kind: { idea: 'Idee', flip: 'Abruf', mcq: 'Auswahlfrage', swipe: 'Wahr oder falsch', cloze: 'Lückentext', order: 'Reihenfolge', match: 'Zuordnen' },
  },
};

export const strings: Record<Locale, Strings> = { en, de };
export function useStrings(): Strings { return strings[useApp(state => state.locale)]; }
