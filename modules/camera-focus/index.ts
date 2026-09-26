import { requireOptionalNativeModule } from 'expo';

type CameraFocusNative = { focusAt(x: number, y: number, facing: 'front' | 'back'): Promise<boolean> };

const native = requireOptionalNativeModule<CameraFocusNative>('CameraFocus');

/** Focuses and meters the live in-app camera at a point given as fractions of the viewfinder. Resolves false if unsupported. */
export async function focusCameraAt(x: number, y: number, facing: 'front' | 'back'): Promise<boolean> {
  if (!native) return false;
  try { return await native.focusAt(x, y, facing); }
  catch { return false; }
}
