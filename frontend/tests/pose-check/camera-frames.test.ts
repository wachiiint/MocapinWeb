import test from 'node:test'
import assert from 'node:assert/strict'
import { observeCameraFrames } from '../../src/pose-check/camera-frames.ts'
import { evaluateReadiness } from '../../src/pose-check/readiness.ts'
import { goodFrame } from '../../src/pose-check/quality.fixture.ts'
import { QUALITY_CONFIG } from '../../src/pose-check/quality-config.ts'
import { newFramePacing, recordFrameCompletion, takeCameraFrame } from '../../src/pose-check/frame-pacing.ts'

function video() {
  return { readyState: 2, videoWidth: 640, videoHeight: 480, paused: false, ended: false, currentTime: 0 }
}

test('presented frames keep keypoints visible without a playback-quality counter; stop cancels callbacks', () => {
  const source = video()
  let pending: VideoFrameRequestCallback = () => {}
  let requests = 0, cancelled = -1, cameraFrameAt: number | null = null
  const stop = observeCameraFrames({ ...source,
    requestVideoFrameCallback(callback) { pending = callback; return ++requests },
    cancelVideoFrameCallback(id) { cancelled = id },
  }, (now) => { cameraFrameAt = now })
  const gate = (now: number) => evaluateReadiness(null, { mode: 'camera', models: 'ready', error: '',
    frame: goodFrame(now), cameraFrameAt, visible: true, config: QUALITY_CONFIG }, now)
  assert.equal(gate(0).showOverlay, false)
  const metadata = { mediaTime: 0, presentedFrames: 1, width: 640, height: 480,
    presentationTime: 100, expectedDisplayTime: 100, processingDuration: 0 }
  pending(100, metadata)
  assert.equal(gate(100).showOverlay, true)
  pending(200, { ...metadata, mediaTime: 0.1, presentedFrames: 2 })
  assert.equal(cameraFrameAt, 200)
  assert.equal(gate(200 + QUALITY_CONFIG.cameraStallMs + 1).showOverlay, false)
  stop()
  assert.equal(cancelled, requests)
  const before = requests
  pending(300, metadata)
  assert.equal(cameraFrameAt, 200)
  assert.equal(requests, before)
})

test('older browsers use advancing video time and never count timer ticks or paused video as new frames', (t) => {
  const originalRequest = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame')
  const originalCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame')
  let pending: FrameRequestCallback = () => {}
  let requests = 0, cancelled = -1
  globalThis.requestAnimationFrame = (callback) => { pending = callback; return ++requests }
  globalThis.cancelAnimationFrame = (id) => { cancelled = id }
  t.after(() => {
    if (originalRequest) Object.defineProperty(globalThis, 'requestAnimationFrame', originalRequest)
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame')
    if (originalCancel) Object.defineProperty(globalThis, 'cancelAnimationFrame', originalCancel)
    else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame')
  })
  const source = video(), observed: number[] = []
  const stop = observeCameraFrames(source, (now) => observed.push(now))
  pending(0); pending(10)
  assert.deepEqual(observed, [])
  source.currentTime = 0.03; pending(30); pending(40)
  assert.deepEqual(observed, [30])
  source.paused = true; source.currentTime = 0.06; pending(60)
  source.paused = false; source.readyState = 1; pending(70)
  source.readyState = 2; source.videoWidth = 0; pending(80)
  assert.deepEqual(observed, [30])
  source.videoWidth = 640; source.currentTime = 0.09; pending(90)
  assert.deepEqual(observed, [30, 90])
  stop()
  assert.equal(cancelled, requests)
  source.currentTime = 0.12; pending(120)
  assert.deepEqual(observed, [30, 90])
})

test('pacing skips inference while busy without losing camera freshness or weakening stall detection', () => {
  let pending: VideoFrameRequestCallback = () => {}
  let cameraFrameAt: number | null = null, busy = false
  const sent: number[] = [], pacing = newFramePacing('phone')
  const stop = observeCameraFrames({ ...video(),
    requestVideoFrameCallback(callback) { pending = callback; return 1 },
    cancelVideoFrameCallback() {},
  }, (now) => {
    cameraFrameAt = now
    if (busy || !takeCameraFrame(pacing, now)) return
    busy = true; sent.push(now)
  })
  const metadata = { mediaTime: 0, presentedFrames: 1, width: 640, height: 480,
    presentationTime: 0, expectedDisplayTime: 0, processingDuration: 0 }
  for (let now = 0; now <= 400; now += 20) pending(now, metadata)
  assert.deepEqual(sent, [0])
  assert.equal(cameraFrameAt, 400)
  recordFrameCompletion(pacing, 400, 0, 0); busy = false
  pending(420, metadata)
  assert.deepEqual(sent, [0, 420])
  const gateAt = (now: number) => evaluateReadiness(null, { mode: 'camera', models: 'ready', error: '',
    frame: goodFrame(now), cameraFrameAt, visible: true, config: QUALITY_CONFIG }, now)
  assert.equal(gateAt(420).showOverlay, true)
  const stalled = gateAt(420 + QUALITY_CONFIG.cameraStallMs + 1)
  assert.equal(stalled.showOverlay, false)
  assert.equal(stalled.canStartRecording, false)
  assert.ok(stalled.issues.some((issue) => issue.reason === 'CAMERA_STALLED'))
  stop()
})
