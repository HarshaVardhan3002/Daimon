import type { Locale } from '../design/tokens';

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number { const date = new Date(ms); date.setHours(0, 0, 0, 0); return date.getTime(); }

/** "Today, 12:17 am" / "Heute, 00:17" and similar, as in the reference's message menus. */
export function formatWhen(ms: number, locale: Locale, now = Date.now()): string {
  const tag = locale === 'de' ? 'de-DE' : 'en-US';
  const time = new Date(ms).toLocaleTimeString(tag, { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (days === 0) return `${locale === 'de' ? 'Heute' : 'Today'}, ${time}`;
  if (days === 1) return `${locale === 'de' ? 'Gestern' : 'Yesterday'}, ${time}`;
  const date = new Date(ms).toLocaleDateString(tag, { day: 'numeric', month: 'short', ...(new Date(ms).getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
  return `${date}, ${time}`;
}

export type Bucket = 'today' | 'yesterday' | 'previous7' | 'older';
export function dayBucket(ms: number | undefined, now = Date.now()): Bucket {
  if (!ms) return 'older';
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? 'previous7' : 'older';
}
