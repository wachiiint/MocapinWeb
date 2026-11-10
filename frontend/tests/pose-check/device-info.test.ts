import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultRuntimeMode, estimateDevice } from '../../src/pose-check/device-info.ts'

test('recognizes iPhone Chrome, Android phones and explicit tablets', () => {
  assert.deepEqual(estimateDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0 Mobile/15E148 Safari/604.1' }),
    { kind: 'phone', source: 'user-agent' })
  assert.equal(estimateDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36' }).kind, 'phone')
  assert.equal(estimateDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' }).kind, 'tablet')
  assert.equal(estimateDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Safari/537.36',
    userAgentData: { mobile: false } }).kind, 'tablet')
})

test('Mac desktop user agent with multitouch is a tablet estimate; desktop and touch laptops remain desktop', () => {
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
  assert.deepEqual(estimateDevice({ userAgent, maxTouchPoints: 5 }), { kind: 'tablet', source: 'touch-heuristic' })
  assert.equal(estimateDevice({ userAgent, maxTouchPoints: 0 }).kind, 'desktop')
  for (const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Mozilla/5.0 (X11; Linux x86_64)', 'Mozilla/5.0 (X11; CrOS x86_64)']) {
    assert.equal(estimateDevice({ userAgent: ua, maxTouchPoints: 10 }).kind, 'desktop')
  }
})

test('uses an affirmative mobile hint; negative or missing hints do not prove desktop', () => {
  assert.deepEqual(estimateDevice({ userAgentData: { mobile: true } }), { kind: 'phone', source: 'client-hints' })
  for (const signals of [{}, { userAgentData: { mobile: false } }, { userAgent: 'Unknown Browser', maxTouchPoints: 5 }]) {
    assert.deepEqual(estimateDevice(signals), { kind: 'unknown', source: 'unavailable' })
  }
})

test('phones and unrecognized devices start with WASM without opting into WebGPU', () => {
  for (const signals of [
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0 Mobile/15E148 Safari/604.1' },
    { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36' },
    { userAgentData: { mobile: true } },
    {},
    { userAgent: 'Unknown Browser', maxTouchPoints: 5 },
    { userAgentData: { mobile: false } },
  ]) assert.equal(defaultRuntimeMode(signals), 'wasm')
})

test('tablets and desktops retain Auto, including desktop-mode iPads and touch laptops', () => {
  for (const signals of [
    { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' },
    { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Safari/537.36' },
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 },
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 },
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 10 },
  ]) assert.equal(defaultRuntimeMode(signals), 'auto')
})
