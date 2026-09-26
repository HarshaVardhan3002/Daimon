import { requireOptionalNativeModule } from 'expo';

type DaimonCameraNative = {
  preferTexturePreview(): Promise<boolean>;
  focusAt(x: number, y: number, facing: 'front' | 'back'): Promise<boolean>;
};

const native = requireOptionalNativeModule<DaimonCameraNative>('DaimonCamera');

/** Makes the mounted camera preview composite like a normal view (clipping, fades, scaling). Call right after it mounts. */
export async function preferTexturePreview(): Promise<boolean> {
  if (!native) return false;
  try { return await native.preferTexturePreview(); }
  catch { return false; }
}

/** Focuses and meters the live in-app camera at a point given as fractions of the viewfinder. Resolves false if unsupported. */
export async function focusCameraAt(x: number, y: number, facing: 'front' | 'back'): Promise<boolean> {
  if (!native) return false;
  try { return await native.focusAt(x, y, facing); }
  catch { return false; }
}
