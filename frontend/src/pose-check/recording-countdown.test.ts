import test from 'node:test'
import assert from 'node:assert/strict'
import { recordingCountdown } from './recording-countdown.ts'

test('counts five seconds across frequent fresh frames and starts exactly once', () => {
  const countdown = recordingCountdown()
  for (let now = 0; now < 5000; now += 100) {
    assert.deepEqual(countdown.tick(now, true, 'run', 1000), { seconds: Math.ceil((5000 - now) / 1000), start: false })
  }
  assert.deepEqual(countdown.tick(5000, true, 'run', 1000), { seconds: null, start: true })
  assert.deepEqual(countdown.tick(5100, true, 'run', 1000), { seconds: null, start: false })
})

test('failed eligibility cancels and recovery requires a full new countdown', () => {
  const countdown = recordingCountdown()
  countdown.tick(0, true, 'run', 1000)
  assert.deepEqual(countdown.tick(500, false, 'run', 1000), { seconds: null, start: false })
  assert.deepEqual(countdown.tick(600, true, 'run', 1000), { seconds: 5, start: false })
  for (let now = 700; now < 5600; now += 100) assert.equal(countdown.tick(now, true, 'run', 1000).start, false)
  assert.equal(countdown.tick(5600, true, 'run', 1000).start, true)
})

test('session/config resets, scheduling gaps, and explicit cancellation restart at five', () => {
  const countdown = recordingCountdown()
  countdown.tick(0, true, 'first', 1000)
  assert.equal(countdown.tick(500, true, 'new', 1000).seconds, 5)
  assert.equal(countdown.tick(6000, true, 'new', 1000).seconds, 5)
  countdown.reset()
  assert.equal(countdown.tick(6100, true, 'new', 1000).seconds, 5)
})
