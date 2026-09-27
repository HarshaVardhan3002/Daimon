import assert from 'node:assert/strict';
import test from 'node:test';
import { acknowledge, decodeQueue, enqueue, sanitizeProps, wordCount } from '../src/telemetry/events.ts';

const event = (id, seq = 1) => ({ v: 1, id, seq, t: 0, tz: 0, session: 's', install: 'i', participant: null, app: '1', platform: 'test', locale: 'en', theme: 'dark', name: 'drawer', props: {} });

test('Props keep only short primitives, so a probe cannot leak message text', () => {
  const props = sanitizeProps({ chars: 12.3456789, on: true, code: 'x'.repeat(500), nested: { text: 'secret' }, list: ['a'], missing: undefined, nan: Number.NaN });
  assert.deepEqual(Object.keys(props).sort(), ['chars', 'code', 'on']);
  assert.equal(props.chars, 12.346);
  assert.equal(props.code.length, 40);
});

test('The queue drops the oldest events beyond its cap and counts them', () => {
  let queue = { events: [], dropped: 0 };
  for (let index = 0; index < 5; index += 1) queue = enqueue(queue, event(`e${index}`, index), 3);
  assert.deepEqual(queue.events.map(item => item.id), ['e2', 'e3', 'e4']);
  assert.equal(queue.dropped, 2);
});

test('Acknowledging a batch keeps events recorded while it was in flight', () => {
  const queue = { events: [event('a'), event('b'), event('c')], dropped: 0 };
  assert.deepEqual(acknowledge(queue, [event('a'), event('b')]).events.map(item => item.id), ['c']);
});

test('A damaged stored queue decodes to its valid events', () => {
  assert.deepEqual(decodeQueue(null), { events: [], dropped: 0 });
  const decoded = decodeQueue({ events: [event('a'), { v: 2, id: 'x', name: 'y' }, 'junk', null], dropped: 4 });
  assert.deepEqual(decoded.events.map(item => item.id), ['a']);
  assert.equal(decoded.dropped, 4);
});

test('Word counts ignore surrounding and repeated whitespace', () => {
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount('   '), 0);
  assert.equal(wordCount(' explain  black holes\nsimply '), 4);
});
