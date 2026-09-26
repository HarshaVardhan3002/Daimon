export type CapturedPhoto = { uri: string; width: number; height: number };
export type CameraPermission = 'unknown' | 'granted' | 'denied' | 'blocked';
export type CameraPhase = 'closed' | 'checking' | 'denied' | 'camera' | 'review' | 'saving' | 'error';
export type CameraNotice = 'capture' | 'save';

export type CameraFlowState = {
  /** Bumped on every open/close so late permission, capture, and save results from an older session are ignored. */
  session: number;
  phase: CameraPhase;
  permission: CameraPermission;
  /** The sheet finished its entrance; the native preview only mounts after this so it never shows through a moving sheet. */
  expanded: boolean;
  /** App is in the background; the camera is released until it returns. */
  suspended: boolean;
  /** The mounted preview reported its first open state. Reset whenever the preview unmounts. */
  ready: boolean;
  capturing: boolean;
  /** Changing this remounts the preview after a start failure. */
  mountKey: number;
  photo?: CapturedPhoto;
  notice?: CameraNotice;
};

export type CameraFlowEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'expanded'; session: number }
  | { type: 'permission'; session: number; permission: Exclude<CameraPermission, 'unknown'> }
  | { type: 'ready'; session: number; mountKey: number }
  | { type: 'mountError'; session: number; mountKey: number }
  | { type: 'retry' }
  | { type: 'remount' }
  | { type: 'captureStart' }
  | { type: 'captured'; session: number; photo: CapturedPhoto }
  | { type: 'captureFailed'; session: number }
  | { type: 'retake' }
  | { type: 'saveStart' }
  | { type: 'saveFailed'; session: number }
  | { type: 'background' }
  | { type: 'foreground' }
  | { type: 'clearNotice' };

export const initialCameraFlow: CameraFlowState = { session: 0, phase: 'closed', permission: 'unknown', expanded: false, suspended: false, ready: false, capturing: false, mountKey: 0 };

export const isCameraMounted = (state: CameraFlowState) => state.phase === 'camera' && state.expanded && !state.suspended;
export const canCapture = (state: CameraFlowState) => isCameraMounted(state) && state.ready && !state.capturing;
/** Tapping the chat above the sheet dismisses it, except while a photo is being taken or kept. */
export const canDismissFromOutside = (state: CameraFlowState) => !state.capturing && state.phase !== 'review' && state.phase !== 'saving';

export function cameraFlowReducer(state: CameraFlowState, event: CameraFlowEvent): CameraFlowState {
  if ('session' in event && event.session !== state.session) return state;
  switch (event.type) {
    case 'open':
      return { ...initialCameraFlow, session: state.session + 1, phase: state.permission === 'granted' ? 'camera' : 'checking', permission: state.permission, mountKey: state.mountKey + 1 };
    case 'close':
      return state.phase === 'closed' ? state : { ...initialCameraFlow, session: state.session + 1, permission: state.permission, mountKey: state.mountKey };
    case 'expanded':
      return state.phase === 'closed' ? state : { ...state, expanded: true };
    case 'permission': {
      if (state.phase === 'closed') return state;
      const next = { ...state, permission: event.permission };
      if (event.permission === 'granted') return state.phase === 'checking' || state.phase === 'denied' ? { ...next, phase: 'camera', ready: false } : next;
      // Access revoked while the preview was up (for example from system settings) ends the preview but keeps a kept photo.
      return state.phase === 'review' || state.phase === 'saving' ? next : { ...next, phase: 'denied', ready: false, capturing: false };
    }
    case 'ready':
      return state.phase === 'camera' && event.mountKey === state.mountKey && isCameraMounted(state) ? { ...state, ready: true } : state;
    case 'mountError':
      return state.phase === 'camera' && event.mountKey === state.mountKey ? { ...state, phase: 'error', ready: false, capturing: false } : state;
    case 'retry':
      return state.phase === 'error' ? { ...state, phase: 'camera', ready: false, mountKey: state.mountKey + 1 } : state;
    case 'remount':
      // Switching lenses rebinds the camera; treat it like a fresh preview so it warms in again.
      return state.phase === 'camera' && !state.capturing ? { ...state, ready: false, mountKey: state.mountKey + 1 } : state;
    case 'captureStart':
      return canCapture(state) ? { ...state, capturing: true, notice: undefined } : state;
    case 'captured':
      return state.capturing && state.phase === 'camera' ? { ...state, phase: 'review', capturing: false, ready: false, photo: event.photo } : state;
    case 'captureFailed':
      return state.capturing ? { ...state, capturing: false, notice: 'capture' } : state;
    case 'retake':
      return state.phase === 'review' ? { ...state, phase: 'camera', photo: undefined, ready: false, notice: undefined, mountKey: state.mountKey + 1 } : state;
    case 'saveStart':
      return state.phase === 'review' && state.photo ? { ...state, phase: 'saving', notice: undefined } : state;
    case 'saveFailed':
      return state.phase === 'saving' ? { ...state, phase: 'review', notice: 'save' } : state;
    case 'background':
      return state.phase === 'closed' ? state : { ...state, suspended: true, ready: false };
    case 'foreground':
      return state.suspended ? { ...state, suspended: false, mountKey: state.mountKey + 1 } : state;
    case 'clearNotice':
      return state.notice ? { ...state, notice: undefined } : state;
  }
}
