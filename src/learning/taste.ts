import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodeTaste, emptyTaste, reduceTaste, tasteWeights } from './tasteMath';
import type { LearningKind, TasteEvent } from './tasteMath';

const KEY = 'daimon:learning-taste:v1';
let profile = emptyTaste();
let ready = false;
let hydration: Promise<void> | undefined;
let writes: Promise<unknown> = Promise.resolve();
const pending: { kind: LearningKind; event: TasteEvent }[] = [];

function persist(): void {
  const snapshot = JSON.stringify(profile);
  // Serialize writes so a slow older write cannot replace newer feedback.
  writes = writes.then(() => AsyncStorage.setItem(KEY, snapshot)).catch(() => undefined);
}

export function hydrateLearningTaste(): Promise<void> {
  if (!hydration) hydration = (async () => {
    try { profile = decodeTaste(JSON.parse(await AsyncStorage.getItem(KEY) ?? 'null')); }
    catch { profile = emptyTaste(); }
    for (const { kind, event } of pending) profile = reduceTaste(profile, kind, event);
    const changed = pending.length > 0;
    pending.length = 0;
    ready = true;
    if (changed) persist();
  })();
  return hydration;
}

function record(kind: LearningKind, event: TasteEvent): void {
  if (!ready) { pending.push({ kind, event }); void hydrateLearningTaste(); return; }
  profile = reduceTaste(profile, kind, event);
  persist();
}

export const recordTasteShown = (kind: LearningKind): void => record(kind, { type: 'shown' });
export const recordTasteCompleted = (kind: LearningKind, correct: boolean, ms: number): void => record(kind, { type: 'completed', correct, ms });
export const recordTasteFeedback = (kind: LearningKind, signal: 'more' | 'less'): void => record(kind, { type: 'feedback', signal });

/** Stored locally only. The research harness decides per participant, as a blind
 * study condition, whether these weights are sent to the model. Nothing applies them yet. */
export function learningTaste(): ReturnType<typeof tasteWeights> {
  void hydrateLearningTaste();
  const current = pending.reduce((value, item) => reduceTaste(value, item.kind, item.event), profile);
  return tasteWeights(current);
}
