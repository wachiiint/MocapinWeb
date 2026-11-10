import test from 'node:test'
import assert from 'node:assert/strict'
import { newFramePacing, recordFrameCompletion, takeCameraFrame } from '../../src/pose-check/frame-pacing.ts'

test('phone and unknown start at five updates/s, desktop and tablet at ten; skipped frames never queue', () => {
  for (const kind of ['phone', 'unknown', 'desktop', 'tablet'] as const) {
    const pacing = newFramePacing(kind)
    const interval = kind === 'phone' || kind === 'unknown' ? 200 : 100
    assert.equal(takeCameraFrame(pacing, 0), true)
    for (let now = 1; now < interval; now++) assert.equal(takeCameraFrame(pacing, now), false)
    assert.equal(takeCameraFrame(pacing, interval), true)
    assert.equal(takeCameraFrame(pacing, interval), false)
    // A long background gap allows one new frame, never a burst to catch up.
    assert.equal(takeCameraFrame(pacing, 10000), true)
    assert.equal(takeCameraFrame(pacing, 10000), false)
  }
})

test('ignores three warm-up timings, then fast mobile devices can reach ten updates/s', () => {
  const pacing = newFramePacing('phone')
  for (let i = 0; i < 3; i++) {
    const now = i * 2000
    assert.equal(takeCameraFrame(pacing, now), true)
    recordFrameCompletion(pacing, now + 1500, now, 0)
    assert.equal(pacing.intervalMs, 200)
  }
  assert.equal(takeCameraFrame(pacing, 6000), true)
  recordFrameCompletion(pacing, 6020, 6000, 0)
  assert.equal(pacing.intervalMs, 100)
  assert.equal(takeCameraFrame(pacing, 6099), false)
  assert.equal(takeCameraFrame(pacing, 6100), true)
})

test('slow frames leave recovery time and later speed improvements adjust the interval gradually', () => {
  const pacing = newFramePacing('desktop')
  for (let i = 0; i < 4; i++) {
    const now = i * 1000
    assert.equal(takeCameraFrame(pacing, now), true)
    recordFrameCompletion(pacing, now + 400, now, 0)
  }
  assert.equal(pacing.intervalMs, 600)
  assert.equal(takeCameraFrame(pacing, 3599), false)
  assert.equal(takeCameraFrame(pacing, 3600), true)
  recordFrameCompletion(pacing, 3700, 3600, 0)
  assert.equal(pacing.smoothedMs, 340)
  assert.equal(pacing.intervalMs, 510)
  assert.equal(takeCameraFrame(pacing, 4109), false)
  assert.equal(takeCameraFrame(pacing, 4110), true)
})

test('runtime revisions restart warm-up; old and invalid results cannot change scheduling', () => {
  const pacing = newFramePacing('phone')
  takeCameraFrame(pacing, 200)
  recordFrameCompletion(pacing, 250, 100, 0)
  recordFrameCompletion(pacing, 199, 200, 0)
  recordFrameCompletion(pacing, NaN, 200, 0)
  assert.equal(pacing.seen, 0)
  recordFrameCompletion(pacing, 250, 200, 0)
  assert.equal(pacing.seen, 1)
  takeCameraFrame(pacing, 400)
  recordFrameCompletion(pacing, 450, 400, 1)
  assert.equal(pacing.seen, 1)
  assert.equal(pacing.revision, 1)
  const restarted = newFramePacing('phone')
  assert.equal(takeCameraFrame(restarted, 0), true)
  assert.equal(takeCameraFrame(restarted, NaN), false)
})
