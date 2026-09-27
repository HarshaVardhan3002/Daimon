import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { accountStore } from '../state/accountStore';
import { appStore } from '../state/appStore';
import { acknowledge, decodeQueue, enqueue, sanitizeProps, SESSION_GAP_MS, type Queue, type TelemetryEnvelope, type TelemetryEventMap, type TelemetryName } from './events';

export type { TelemetryEnvelope, TelemetryName } from './events';
export { wordCount } from './events';

/**
 * Study telemetry: typed events are queued on the phone and persisted, then handed to a sink in batches.
 * No sink is installed yet, so nothing leaves the device; the harness will register one that posts to the
 * university endpoint (`setTelemetrySink`). Events recorded before hydration are merged, not lost.
 */
export type TelemetrySink = (batch: readonly TelemetryEnvelope[]) => Promise<void>;

const KEY = 'daimon.telemetry.v1';
const INSTALL_KEY = 'daimon.telemetry.install';
const APP_VERSION = '1.0.0';
const BATCH = 100;
const PERSIST_DELAY_MS = 4000;

let queue: Queue = { events: [], dropped: 0 };
let seq = 0;
let install = '';
let session = randomId();
let hydrated = false;
let sink: TelemetrySink | null = null;
let flushing = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let foregroundAt = Date.now();
let backgroundAt = 0;

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

function schedulePersist(): void {
  if (persistTimer || !hydrated) return;
  persistTimer = setTimeout(() => { persistTimer = null; persist(); }, PERSIST_DELAY_MS);
}

function persist(): void {
  if (!hydrated) return;
  AsyncStorage.setItem(KEY, JSON.stringify({ ...queue, seq })).catch(() => undefined);
}

/** Record one event. Cheap and synchronous; never throws into the caller. */
export function track<N extends TelemetryName>(name: N, props: TelemetryEventMap[N]): void {
  try {
    const app = appStore.get();
    seq += 1;
    const event: TelemetryEnvelope = {
      v: 1, id: randomId(), seq, t: Date.now(), tz: -new Date().getTimezoneOffset(), session, install,
      participant: accountStore.get().session?.participantId ?? null,
      app: APP_VERSION, platform: `${Platform.OS}-${String(Platform.Version)}`, locale: app.locale, theme: app.theme,
      name, props: sanitizeProps(props),
    };
    queue = enqueue(queue, event);
    if (__DEV__) console.log('[telemetry]', name, event.props);
    schedulePersist();
    if (sink && queue.events.length >= BATCH) void flushTelemetry();
  } catch {
    // Telemetry must never break the app.
  }
}

export async function hydrateTelemetry(): Promise<void> {
  try {
    const [raw, storedInstall] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(INSTALL_KEY)]);
    install = storedInstall ?? randomId();
    if (!storedInstall) AsyncStorage.setItem(INSTALL_KEY, install).catch(() => undefined);
    const parsed = raw ? JSON.parse(raw) as { seq?: unknown } : undefined;
    const stored = decodeQueue(parsed);
    const storedSeq = typeof parsed?.seq === 'number' ? parsed.seq : 0;
    // Events recorded before hydration get the install id and continue the stored sequence.
    const early = queue.events.map((event, index) => ({ ...event, install, seq: storedSeq + index + 1 }));
    seq = storedSeq + early.length;
    queue = early.reduce(enqueue, stored);
  } catch {
    install = install || randomId();
  }
  hydrated = true;
  persist();
}

/** Install the delivery sink (the harness's uploader). Pass null to keep events on the phone. */
export function setTelemetrySink(next: TelemetrySink | null): void {
  sink = next;
  if (sink) void flushTelemetry();
}

export async function flushTelemetry(): Promise<void> {
  const target = sink;
  if (!target || flushing || !queue.events.length) return;
  flushing = true;
  try {
    // A sink swapped mid-flush takes over on its own flush.
    while (sink === target && queue.events.length) {
      const batch = queue.events.slice(0, BATCH);
      await target(batch);
      queue = acknowledge(queue, batch);
    }
  } catch {
    // Keep the batch; the next flush retries it.
  } finally {
    flushing = false;
    persist();
  }
}

/** A read-only copy of the queue, for the developer export. */
export function telemetrySnapshot(): Queue { return { events: [...queue.events], dropped: queue.dropped }; }

AppState.addEventListener('change', state => {
  const now = Date.now();
  if (state === 'background') {
    backgroundAt = now;
    track('app_background', { foregroundMs: now - foregroundAt });
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    persist();
    void flushTelemetry();
  } else if (state === 'active' && backgroundAt) {
    const away = now - backgroundAt;
    if (away > SESSION_GAP_MS) session = randomId();
    foregroundAt = now;
    backgroundAt = 0;
    track('app_foreground', { backgroundMs: away });
  }
});
