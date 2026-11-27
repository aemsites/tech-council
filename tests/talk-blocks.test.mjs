import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTalkTiming } from '../utils/talk-blocks.js';

test('talk metadata accepts zero starts and calculates a validated range', () => {
  assert.deepEqual(getTalkTiming({
    start: '00:00', end: '01:02', 'timing confidence': ' Exact ',
  }), {
    start: 0, end: 62, duration: 62, confidence: 'exact',
  });
  assert.deepEqual(getTalkTiming({
    start: '25:28', end: '38:01', 'timing confidence': 'segment',
  }), {
    start: 1528, end: 2281, duration: 753, confidence: 'segment',
  });
});

test('unknown timing is not inferred and an end alone is not a range', () => {
  assert.deepEqual(getTalkTiming({}), {
    start: null, end: null, duration: null, confidence: 'unverified',
  });
  assert.deepEqual(getTalkTiming({ end: '55:08' }), {
    start: null, end: null, duration: null, confidence: 'unverified',
  });
  assert.equal(getTalkTiming({ start: '10' }).confidence, 'unverified');
});

test('invalid ranges do not create negative, zero, or overflowing durations', () => {
  ['1:59', '2:00', '-1', '02:99', '9007199254740992'].forEach((end) => {
    const timing = getTalkTiming({ start: '2:00', end });
    assert.equal(timing.start, 120);
    assert.equal(timing.end, null);
    assert.equal(timing.duration, null);
  });
  assert.equal(getTalkTiming({ start: 'later', end: '3:00' }).start, null);
});
