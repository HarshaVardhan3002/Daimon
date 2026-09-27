import { Camera } from 'expo-camera';

export type CameraAccess = 'granted' | 'denied' | 'blocked';

let pendingRequest: ReturnType<typeof Camera.requestCameraPermissionsAsync> | null = null;

/**
 * Reads camera access and, when `ask` is set and access isn't granted, asks the system for it.
 * It always asks rather than trusting canAskAgain: on Android that reads false after "Ask every time" or a denial in
 * Settings although the system would still show its dialog, and when the system won't ask, the request returns at once.
 * A second call while the dialog is up joins that request instead of stacking another dialog.
 */
export async function cameraAccess(ask: boolean): Promise<CameraAccess> {
  let result = await Camera.getCameraPermissionsAsync();
  if (!result.granted && ask) {
    pendingRequest ??= Camera.requestCameraPermissionsAsync().finally(() => { pendingRequest = null; });
    result = await pendingRequest;
  }
  return result.granted ? 'granted' : result.canAskAgain ? 'denied' : 'blocked';
}
