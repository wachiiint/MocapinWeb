import test from 'node:test'
import assert from 'node:assert/strict'
import { newTimingWindow, recordTiming, summarizeTimings } from '../../src/pose-check/runtime-stats.ts'
import type { TimingSample } from '../../src/pose-check/halpe26.ts'

function sample(value: number): TimingSample {
  return { readPixelsMs: value, detectorPreMs: value, detectorRunMs: value, detectorDecodeMs: value,
    posePreMs: value, poseRunMs: value, poseDecodeMs: value, totalWorkerMs: value, frameAgeMs: value }
}

test('three warm-up frames are excluded, then median and nearest-rank P95 are reported', () => {
  const window = newTimingWindow()
  for (let i = 1; i <= 3; i++) recordTiming(window, 0, sample(i))
  assert.deepEqual(summarizeTimings(window), {})
  recordTiming(window, 0, sample(4)); recordTiming(window, 0, sample(5))
  assert.deepEqual(summarizeTimings(window).frameAgeMs, { median: 4.5, p95: 5 })
})

test('only the latest 60 measured camera frames remain', () => {
  const window = newTimingWindow()
  for (let i = 1; i <= 64; i++) recordTiming(window, 0, sample(i))
  assert.equal(window.samples.length, 60)
  assert.deepEqual(summarizeTimings(window).totalWorkerMs, { median: 34.5, p95: 61 })
})

test('changing a model session resets the window and restarts warm-up', () => {
  const window = newTimingWindow()
  for (let i = 0; i < 10; i++) recordTiming(window, 0, sample(100))
  recordTiming(window, 1, sample(200))
  assert.equal(window.samples.length, 0); assert.equal(window.seen, 1)
  recordTiming(window, 1, sample(200)); recordTiming(window, 1, sample(200))
  assert.equal(window.samples.length, 0)
  recordTiming(window, 1, sample(20))
  assert.equal(summarizeTimings(window).poseRunMs?.median, 20)
  assert.deepEqual(newTimingWindow().samples, [])
})
