/**
 * The study's telemetry vocabulary. Every probe in the app emits one of these, so the schema is reviewable in one place.
 *
 * Privacy by construction: props hold counts, durations, flags and short enum strings only. Message text, file names,
 * memory text and profile fields never enter an event; `sanitizeProps` also clips any string to a short token.
 */
export type Screen = 'welcome' | 'sign_in' | 'chat' | 'search' | 'settings' | 'personalization' | 'memory';
export type Effort = 'default' | 'instant' | 'medium' | 'high';
export type LearnFormat = string;

export type TelemetryEventMap = {
  app_open: { cold: boolean };
  app_background: { foregroundMs: number };
  app_foreground: { backgroundMs: number };
  screen_view: { screen: Screen };
  sign_in: Record<string, never>;
  sign_out: Record<string, never>;
  chat_new: { fromTurns: number };
  chat_open: { turns: number; ageDays: number };
  chat_rename: Record<string, never>;
  chat_delete: { active: boolean };
  chat_branch: { atTurn: number };
  drawer: { open: boolean };
  search: { queryChars: number; results: number; opened: boolean };
  message_send: { chars: number; words: number; image: boolean; document: boolean; effort: Effort; edit: boolean; turnIndex: number };
  /** `effort` is the request's reasoning effort (low/medium/high) or 'default'. */
  reply_done: { ms: number; chars: number; rich: string; effort: string };
  reply_error: { code: string; ms: number };
  reply_stop: { ms: number };
  reply_regenerate: { effort: Effort };
  reply_copy: { target: 'answer' | 'prompt' | 'code' };
  reply_share: Record<string, never>;
  reply_read_aloud: { on: boolean };
  prompt_edit: Record<string, never>;
  effort_change: { from: Effort; to: Effort };
  attach: { kind: 'camera' | 'photo' | 'file'; ok: boolean };
  theme_change: { to: string };
  locale_change: { to: string };
  profile_change: { field: string };
  memory_toggle: { on: boolean };
  memory_delete: { all: boolean };
  /** One interaction with a learning card. `format` is the card kind; `deck` is an opaque per-reply id. */
  learn: { deck: string; format: LearnFormat; action: 'shown' | 'answer' | 'flip' | 'swipe' | 'skip' | 'reveal' | 'hint' | 'done'; correct?: boolean; ms?: number; index?: number };
  /** Explicit taste signal from the learner ("more like this" / "less like this"). Feeds personalization. */
  learn_feedback: { deck: string; format: LearnFormat; signal: 'more' | 'less' };
};

export type TelemetryName = keyof TelemetryEventMap;
export type PropValue = string | number | boolean;

export type TelemetryEnvelope = {
  /** Schema version of the envelope and vocabulary. */
  v: 1;
  id: string;
  /** Monotonic per install; gaps reveal dropped events. */
  seq: number;
  /** Epoch ms on the device clock, plus its UTC offset in minutes. */
  t: number;
  tz: number;
  session: string;
  install: string;
  /** Team-issued study login (already a pseudonym); null before sign-in. */
  participant: string | null;
  app: string;
  platform: string;
  locale: string;
  theme: string;
  name: TelemetryName;
  props: Record<string, PropValue>;
};

const MAX_STRING = 40;
const MAX_PROPS = 12;

/** Keep only primitive props, clip strings and round numbers, so a probe cannot leak free text by mistake. */
export function sanitizeProps(props: object): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  let count = 0;
  for (const [key, value] of Object.entries(props)) {
    if (count >= MAX_PROPS) break;
    if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.round(value * 1000) / 1000;
    else if (typeof value === 'string') out[key] = value.slice(0, MAX_STRING);
    else continue;
    count += 1;
  }
  return out;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export type Queue = { events: TelemetryEnvelope[]; dropped: number };
export const MAX_QUEUE = 5000;

/** Append, dropping the oldest events beyond the cap and counting them. */
export function enqueue(queue: Queue, event: TelemetryEnvelope, max = MAX_QUEUE): Queue {
  const events = [...queue.events, event];
  const overflow = Math.max(0, events.length - max);
  return { events: overflow ? events.slice(overflow) : events, dropped: queue.dropped + overflow };
}

/** Remove a delivered batch by id (events recorded while it was in flight stay queued). */
export function acknowledge(queue: Queue, delivered: readonly TelemetryEnvelope[]): Queue {
  const ids = new Set(delivered.map(event => event.id));
  return { events: queue.events.filter(event => !ids.has(event.id)), dropped: queue.dropped };
}

export function decodeQueue(value: unknown): Queue {
  if (!value || typeof value !== 'object') return { events: [], dropped: 0 };
  const record = value as { events?: unknown; dropped?: unknown };
  const events = Array.isArray(record.events)
    ? record.events.filter((event): event is TelemetryEnvelope => Boolean(event) && typeof event === 'object' && (event as TelemetryEnvelope).v === 1 && typeof (event as TelemetryEnvelope).id === 'string' && typeof (event as TelemetryEnvelope).name === 'string')
    : [];
  return { events: events.slice(-MAX_QUEUE), dropped: typeof record.dropped === 'number' ? record.dropped : 0 };
}

/** A session ends after this long in the background. */
export const SESSION_GAP_MS = 30 * 60 * 1000;
