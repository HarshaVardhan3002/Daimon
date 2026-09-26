import assert from 'node:assert/strict';
import test from 'node:test';
import { canCapture, canDismissFromOutside, cameraFlowReducer, initialCameraFlow, isCameraMounted } from '../src/chat/cameraFlow.ts';

const run = (state, ...events) => events.reduce(cameraFlowReducer, state);
const photo = { uri: 'file:///cache/Camera/shot.jpg', width: 1536, height: 2048 };
const opened = () => run(initialCameraFlow, { type: 'open' });
const live = () => {
  const state = opened();
  const next = run(state, { type: 'expanded', session: state.session }, { type: 'permission', session: state.session, permission: 'granted' });
  return run(next, { type: 'ready', session: next.session, mountKey: next.mountKey });
};

test('The preview mounts only after the sheet expands and permission is granted', () => {
  const state = opened();
  assert.equal(state.phase, 'checking');
  assert.equal(isCameraMounted(run(state, { type: 'permission', session: state.session, permission: 'granted' })), false, 'sheet still moving');
  assert.equal(isCameraMounted(run(state, { type: 'expanded', session: state.session })), false, 'permission unknown');
  const ready = live();
  assert.equal(isCameraMounted(ready), true);
  assert.equal(canCapture(ready), true);
});

test('Ready events from a replaced preview do not reveal the new one early', () => {
  const state = run(opened(), { type: 'background' });
  const back = run(state, { type: 'foreground' });
  const staleMount = back.mountKey - 1;
  assert.equal(run(back, { type: 'expanded', session: back.session }, { type: 'permission', session: back.session, permission: 'granted' }, { type: 'ready', session: back.session, mountKey: staleMount }).ready, false);
});

test('Late results from a closed session are ignored after a rapid close and reopen', () => {
  const first = opened();
  const reopened = run(first, { type: 'close' }, { type: 'open' });
  assert.notEqual(reopened.session, first.session);
  const afterStale = run(reopened, { type: 'permission', session: first.session, permission: 'blocked' }, { type: 'expanded', session: first.session });
  assert.equal(afterStale.phase, 'checking');
  assert.equal(afterStale.expanded, false);
  assert.equal(afterStale.permission, 'unknown');
});

test('Denied and blocked permission stop at the explanation, and a later grant starts the preview', () => {
  const state = opened();
  const denied = run(state, { type: 'expanded', session: state.session }, { type: 'permission', session: state.session, permission: 'blocked' });
  assert.equal(denied.phase, 'denied');
  assert.equal(isCameraMounted(denied), false);
  const granted = run(denied, { type: 'permission', session: denied.session, permission: 'granted' });
  assert.equal(granted.phase, 'camera');
  assert.equal(granted.ready, false, 'preview still warms in');
});

test('A remembered grant opens straight to the camera but a revoked one falls back to the explanation', () => {
  const closed = run(live(), { type: 'close' });
  const reopened = run(closed, { type: 'open' });
  assert.equal(reopened.phase, 'camera');
  assert.equal(run(reopened, { type: 'permission', session: reopened.session, permission: 'denied' }).phase, 'denied');
});

test('Capture moves to review, retake returns to a fresh preview, and double taps are ignored', () => {
  const capturing = run(live(), { type: 'captureStart' });
  assert.equal(capturing.capturing, true);
  assert.equal(run(capturing, { type: 'captureStart' }), run(capturing, { type: 'clearNotice' }), 'second tap is a no-op');
  const review = run(capturing, { type: 'captured', session: capturing.session, photo });
  assert.equal(review.phase, 'review');
  assert.equal(isCameraMounted(review), false, 'camera released while reviewing');
  assert.deepEqual(review.photo, photo);
  const retake = run(review, { type: 'retake' });
  assert.equal(retake.phase, 'camera');
  assert.equal(retake.photo, undefined);
  assert.equal(retake.ready, false);
  assert.notEqual(retake.mountKey, review.mountKey);
});

test('Capture and save failures keep the user in place with a notice', () => {
  const capturing = run(live(), { type: 'captureStart' });
  const failed = run(capturing, { type: 'captureFailed', session: capturing.session });
  assert.equal(failed.phase, 'camera');
  assert.equal(failed.notice, 'capture');
  assert.equal(canCapture(failed), true);
  const review = run(run(failed, { type: 'captureStart' }), { type: 'captured', session: failed.session, photo });
  const saving = run(review, { type: 'saveStart' });
  assert.equal(saving.phase, 'saving');
  assert.equal(canDismissFromOutside(saving), false);
  const saveFailed = run(saving, { type: 'saveFailed', session: saving.session });
  assert.equal(saveFailed.phase, 'review');
  assert.equal(saveFailed.notice, 'save');
  assert.deepEqual(saveFailed.photo, photo);
});

test('Backgrounding releases the camera and returning warms up a fresh preview; a kept photo survives', () => {
  const background = run(live(), { type: 'background' });
  assert.equal(isCameraMounted(background), false);
  assert.equal(background.ready, false);
  const foreground = run(background, { type: 'foreground' });
  assert.equal(isCameraMounted(foreground), true);
  assert.equal(canCapture(foreground), false, 'waits for ready');
  const capturing = run(live(), { type: 'captureStart' });
  const review = run(capturing, { type: 'captured', session: capturing.session, photo });
  const resumed = run(review, { type: 'background' }, { type: 'foreground' });
  assert.equal(resumed.phase, 'review');
  assert.deepEqual(resumed.photo, photo);
});

test('Start failures can be retried with a new preview', () => {
  const state = live();
  const failed = run(state, { type: 'mountError', session: state.session, mountKey: state.mountKey });
  assert.equal(failed.phase, 'error');
  const retry = run(failed, { type: 'retry' });
  assert.equal(retry.phase, 'camera');
  assert.equal(retry.mountKey, failed.mountKey + 1);
});

test('Outside taps dismiss the live camera but never a photo under review', () => {
  assert.equal(canDismissFromOutside(live()), true);
  const capturing = run(live(), { type: 'captureStart' });
  assert.equal(canDismissFromOutside(capturing), false);
  assert.equal(canDismissFromOutside(run(capturing, { type: 'captured', session: capturing.session, photo })), false);
});
