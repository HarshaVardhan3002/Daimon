export type StorageHydration<T> =
  | { status: 'ready'; value: T | null }
  | { status: 'read_error' }
  | { status: 'parse_error'; raw: string };

let quarantineSequence = 0;

/** Read and decode without writing. Any read/decode failure is returned to the owner. */
export async function readStoredJSON<T>(
  key: string,
  getItem: (key: string) => Promise<string | null>,
  decode: (value: unknown) => T,
): Promise<StorageHydration<T>> {
  let raw: string | null;
  try { raw = await getItem(key); }
  catch { return { status: 'read_error' }; }
  if (raw === null) return { status: 'ready', value: null };
  try { return { status: 'ready', value: decode(JSON.parse(raw) as unknown) }; }
  catch { return { status: 'parse_error', raw }; }
}

/** Keep a uniquely named recovery copy; callers must still leave the source key untouched. */
export async function quarantineRawPayload(
  key: string,
  raw: string,
  setItem: (key: string, value: string) => Promise<void>,
): Promise<string | null> {
  const quarantineKey = `${key}:quarantine:${Date.now()}:${quarantineSequence++}`;
  try { await setItem(quarantineKey, raw); return quarantineKey; }
  catch { return null; }
}
