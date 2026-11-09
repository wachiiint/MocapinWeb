import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateReadiness, type GateInput, type Readiness } from './readiness.ts'
import { QUALITY_CONFIG } from './quality-config.ts'
import { goodFrame } from './quality.fixture.ts'

function input(now: number): GateInput {
  return { mode: 'camera', models: 'ready', error: '', frame: goodFrame(now), cameraFrameAt: now, visible: true, config: QUALITY_CONFIG }
}
function ready() {
  let gate: Readiness | null = null
  for (let t = 0; t <= 2000; t += 500) gate = evaluateReadiness(gate, input(t), t)
  return gate!
}

test('requires two seconds of new passing results; watchdog reuse never advances readiness', () => {
  let gate = evaluateReadiness(null, input(0), 0)
  gate = evaluateReadiness(gate, input(500), 500)
  const repeated = evaluateReadiness(gate, { ...input(900), frame: goodFrame(500) }, 900)
  assert.equal(repeated.passingMs, 500); assert.equal(repeated.canStartRecording, false)
  assert.equal(ready().status, 'Ready — Experimental')
  assert.equal(ready().canStartRecording, true)
})

test('any failed or unknown check immediately cancels readiness and restarts the hold', () => {
  for (const change of ['dark', 'missing', 'multiple', 'unknown'] as const) {
    const next = input(2100)
    if (change === 'dark') next.frame!.quality.personLuma = 0
    if (change === 'missing') { next.frame!.people = []; next.frame!.keypoints = [] }
    if (change === 'multiple') next.frame!.people.push({ ...next.frame!.people[0] })
    if (change === 'unknown') next.frame!.quality.backgroundLuma = null
    const bad = evaluateReadiness(ready(), next, 2100)
    assert.equal(bad.canStartRecording, false); assert.equal(bad.passingSince, null)
    const recovered = evaluateReadiness(bad, input(2200), 2200)
    assert.equal(recovered.passingMs, 0); assert.equal(recovered.canStartRecording, false)
  }
})

test('stale pose and stopped camera are distinct; old overlays and eligibility are cleared', () => {
  const stale = evaluateReadiness(ready(), { ...input(3001), frame: goodFrame(2000) }, 3001)
  assert.equal(stale.status, 'Checking'); assert.equal(stale.showOverlay, false)
  assert.ok(stale.issues.some((c) => c.reason === 'POSE_STALE'))
  const stalled = evaluateReadiness(ready(), { ...input(3001), cameraFrameAt: 2000 }, 3001)
  assert.equal(stalled.canStartRecording, false); assert.equal(stalled.showOverlay, false)
  assert.ok(stalled.issues.some((c) => c.reason === 'CAMERA_STALLED'))
  const boundary = evaluateReadiness(ready(), { ...input(3000), frame: goodFrame(2000) }, 3000)
  assert.equal(boundary.showOverlay, true)
})

test('camera stop, runtime revision, generation, config changes, recovery, hidden page and clock gaps reset the hold', () => {
  const variants: GateInput[] = [
    { ...input(2100), mode: 'off', frame: null },
    { ...input(2100), models: 'recovering', frame: null },
    { ...input(2100), visible: false },
    { ...input(2100), config: { ...QUALITY_CONFIG, minSharpness: 50 } },
    { ...input(2100), frame: { ...goodFrame(2100), generation: 2 } },
    { ...input(2100), frame: { ...goodFrame(2100), runtime: { ...goodFrame().runtime, revision: 1 } } },
    input(4000),
  ]
  for (const variant of variants) {
    const gate = evaluateReadiness(ready(), variant, variant.frame?.capturedAt ?? 2100)
    assert.equal(gate.canStartRecording, false)
    assert.equal(gate.passingMs, 0)
  }
})

test('error outranks other reasons, loading/off labels are stable, and still images can never permit recording', () => {
  const error = evaluateReadiness(ready(), { ...input(2100), error: 'Camera disconnected' }, 2100)
  assert.equal(error.status, 'Error'); assert.equal(error.primaryReason?.reason, 'ERROR'); assert.equal(error.showOverlay, false)
  assert.equal(evaluateReadiness(null, { ...input(0), models: 'loading' }, 0).status, 'Loading Models')
  assert.equal(evaluateReadiness(null, { ...input(0), mode: 'off' }, 0).status, 'Camera Off')
  const image = evaluateReadiness(ready(), { ...input(0), mode: 'image' }, 10000)
  assert.equal(image.status, 'Checking'); assert.equal(image.canStartRecording, false); assert.equal(image.showOverlay, true)
})
