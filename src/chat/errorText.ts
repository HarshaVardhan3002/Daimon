import type { Locale } from '../design/tokens';
import type { ChatRequestError } from '../state/types';

export function errorText(locale: Locale, error: ChatRequestError): string {
  const de = locale === 'de';
  switch (error) {
    case 'disconnected': return de ? 'Daimon ist gerade nicht erreichbar. Deine Nachricht bleibt im Chat und kann erneut gesendet werden.' : 'Daimon can’t be reached right now. Your message stays in the chat and can be retried.';
    case 'cancelled': return de ? 'Antwort angehalten. Deine Nachricht bleibt im Chat und kann erneut gesendet werden.' : 'Response stopped. Your message stays in the chat and can be retried.';
    case 'interrupted': return de ? 'Die Antwort wurde unterbrochen. Du kannst es erneut versuchen.' : 'The response was interrupted. You can try again.';
    case 'reasoning_unavailable': return de ? 'Das Modell hat diese Denkstufe abgelehnt. Schalte „Gründlicher nachdenken“ im Plus-Menü aus und versuche es erneut.' : 'The model did not accept this effort level. Turn off Think harder in the plus menu, then retry.';
    case 'reasoning_image_unsupported': return de ? 'Bildanfragen funktionieren nur ohne „Gründlicher nachdenken“. Schalte es im Plus-Menü aus; Entwurf und Bild bleiben erhalten.' : 'Image requests only work with Think harder off. Turn it off in the plus menu; your draft and image are still here.';
    case 'document_too_large': return de ? 'Die Datei ist größer als 8 MiB. Wähle eine kleinere Datei aus.' : 'This file is larger than 8 MiB. Choose a smaller file.';
    case 'document_too_many_pages': return de ? 'Das PDF hat mehr als 60 Seiten. Teile es in kleinere Dateien auf.' : 'This PDF has more than 60 pages. Split it into smaller files.';
    case 'document_password': return de ? 'Dieses PDF ist passwortgeschützt. Entferne den Passwortschutz und füge die Datei erneut hinzu.' : 'This PDF is password-protected. Remove the password and attach it again.';
    case 'document_no_text': return de ? 'In dieser Datei wurde kein lesbarer Text gefunden. Gescannte PDFs können noch nicht per OCR gelesen werden.' : 'No selectable text was found. Scanned PDFs are not supported because OCR is not available yet.';
    case 'document_encoding': return de ? 'Die Textdatei ist nicht UTF-8-codiert. Speichere sie als UTF-8 und füge sie erneut hinzu.' : 'This text file is not UTF-8 encoded. Save it as UTF-8 and attach it again.';
    case 'document_invalid': return de ? 'Die Datei konnte nicht gelesen werden. Exportiere sie erneut und füge die neue Datei hinzu.' : 'This file could not be read. Export it again and attach the new file.';
    default: return de ? 'Die Antwort konnte nicht geladen werden. Versuche es erneut.' : 'The response couldn’t be loaded. Try again.';
  }
}

export const imageNeedsDefault = (locale: Locale) => locale === 'de'
  ? 'Bilder gehen nur ohne „Gründlicher nachdenken“. Schalte es im Plus-Menü aus; Entwurf und Bild bleiben erhalten.'
  : 'Images only work with Think harder off. Turn it off in the plus menu; your draft and image are still here.';
