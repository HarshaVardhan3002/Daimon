import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore, useStore } from './store';

/**
 * Participant session, the person's own profile and response preferences, and developer switches.
 *
 * Sign-in has no server yet: `developmentAuth` accepts any well-formed participant ID and says so on screen.
 * When the harness exists, swap it for a provider that checks credentials and keeps its token in secure storage.
 * Preferences are stored here only. They are deliberately NOT applied to requests from the app: whether they reach
 * the model is the study condition, which the harness decides (DAIMON_HARNESS_PLAN.md §6.5).
 */
export type Session = { participantId: string; signedInAt: number; provider: 'development' };
export type Level = 'less' | 'default' | 'more';
export type BaseStyle = 'default' | 'professional' | 'friendly' | 'candid' | 'quirky' | 'efficient';
export type Profile = {
  nickname: string;
  occupation: string;
  about: string;
  customInstructions: string;
  baseStyle: BaseStyle;
  warmth: Level;
  enthusiasm: Level;
  headers: Level;
  emoji: Level;
  memoryEnabled: boolean;
};
export type MemoryItem = { id: string; text: string; createdAt: number };
export type DevFlags = { unlocked: boolean; previewFixtures: boolean };

type AccountShape = {
  status: 'loading' | 'ready';
  session: Session | null;
  profile: Profile;
  memories: MemoryItem[];
  dev: DevFlags;
};

const KEYS = { session: 'daimon:session:v1', profile: 'daimon:profile:v1', memories: 'daimon:memories:v1', dev: 'daimon:dev:v1' } as const;
export const defaultProfile: Profile = { nickname: '', occupation: '', about: '', customInstructions: '', baseStyle: 'default', warmth: 'default', enthusiasm: 'default', headers: 'default', emoji: 'default', memoryEnabled: true };

export const accountStore = createStore<AccountShape>({ status: 'loading', session: null, profile: defaultProfile, memories: [], dev: { unlocked: false, previewFixtures: false } });
export function useAccount<S>(selector: (state: AccountShape) => S): S { return useStore(accountStore, selector); }

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const LEVELS: Level[] = ['less', 'default', 'more'];
const STYLES: BaseStyle[] = ['default', 'professional', 'friendly', 'candid', 'quirky', 'efficient'];

async function read(key: string): Promise<unknown> {
  try { const raw = await AsyncStorage.getItem(key); return raw === null ? undefined : JSON.parse(raw) as unknown; }
  catch { return undefined; }
}
function write(key: string, value: unknown): void { AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined); }

function decodeProfile(value: unknown): Profile {
  if (!isRecord(value)) return defaultProfile;
  const text = (field: unknown, max: number) => typeof field === 'string' ? field.slice(0, max) : '';
  const level = (field: unknown): Level => LEVELS.includes(field as Level) ? field as Level : 'default';
  return {
    nickname: text(value.nickname, 60), occupation: text(value.occupation, 120), about: text(value.about, 1500), customInstructions: text(value.customInstructions, 1500),
    baseStyle: STYLES.includes(value.baseStyle as BaseStyle) ? value.baseStyle as BaseStyle : 'default',
    warmth: level(value.warmth), enthusiasm: level(value.enthusiasm), headers: level(value.headers), emoji: level(value.emoji),
    memoryEnabled: value.memoryEnabled !== false,
  };
}

/** Never fails: a damaged entry falls back to its default rather than blocking the app. */
export async function hydrateAccount(): Promise<void> {
  const [session, profile, memories, dev] = await Promise.all([read(KEYS.session), read(KEYS.profile), read(KEYS.memories), read(KEYS.dev)]);
  accountStore.set({
    status: 'ready',
    session: isRecord(session) && typeof session.participantId === 'string' && typeof session.signedInAt === 'number' ? { participantId: session.participantId, signedInAt: session.signedInAt, provider: 'development' } : null,
    profile: decodeProfile(profile),
    memories: Array.isArray(memories) ? memories.filter((item): item is MemoryItem => isRecord(item) && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.createdAt === 'number') : [],
    dev: isRecord(dev) ? { unlocked: dev.unlocked === true, previewFixtures: dev.previewFixtures === true } : { unlocked: false, previewFixtures: false },
  });
}

export const PARTICIPANT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;
export class SignInError extends Error {
  constructor(readonly code: 'invalid_id' | 'invalid_password') { super(code); }
}

/** Development provider: checks the format only, never a server. The sign-in screen labels it as such. */
export async function signIn(participantId: string, password: string): Promise<Session> {
  const id = participantId.trim();
  if (!PARTICIPANT_ID.test(id)) throw new SignInError('invalid_id');
  if (password.length < 4) throw new SignInError('invalid_password');
  await new Promise(resolve => setTimeout(resolve, 650));
  const session: Session = { participantId: id, signedInAt: Date.now(), provider: 'development' };
  write(KEYS.session, session);
  accountStore.set({ session });
  return session;
}

/** Chats stay on the phone for now; only the session ends. */
export function signOut(): void {
  AsyncStorage.removeItem(KEYS.session).catch(() => undefined);
  accountStore.set({ session: null });
}

export function updateProfile(patch: Partial<Profile>): void {
  const profile = { ...accountStore.get().profile, ...patch };
  write(KEYS.profile, profile);
  accountStore.set({ profile });
}

export function deleteMemory(id: string): void {
  const memories = accountStore.get().memories.filter(item => item.id !== id);
  write(KEYS.memories, memories);
  accountStore.set({ memories });
}
export function clearMemories(): void {
  write(KEYS.memories, []);
  accountStore.set({ memories: [] });
}

export function setDevFlags(patch: Partial<DevFlags>): void {
  const dev = { ...accountStore.get().dev, ...patch };
  write(KEYS.dev, dev);
  accountStore.set({ dev });
}
