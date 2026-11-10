import test from 'node:test'
import assert from 'node:assert/strict'
import { recordVideo } from '../../src/pose-check/video-recorder.ts'
import { evaluateReadiness } from '../../src/pose-check/readiness.ts'
import { goodFrame } from '../../src/pose-check/quality.fixture.ts'
import { QUALITY_CONFIG } from '../../src/pose-check/quality-config.ts'
import type { RecordingSnapshot, RecordingQualityReport } from '../../src/pose-check/recording-report.ts'

class FakeRecorder extends EventTarget {
  state: RecordingState = 'inactive'
  mimeType = 'video/webm'
  failStart = false
  stops = 0
  start() {
    if (this.failStart) throw new Error('Encoder failed')
    this.state = 'recording'
  }
  stop() { this.stops++; this.state = 'inactive' }
  emitData(text: string) { this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: new Blob([text], { type: this.mimeType }) })) }
}

function setup() {
  const recorder = new FakeRecorder()
  let time = 0, allowed = true, alive = true, bad = false
  const completed: { video: Blob; report: RecordingQualityReport }[] = [], errors: string[] = []
  const options = { config: QUALITY_CONFIG, source: { width: 640, height: 480 }, now: () => time,
    sourceAlive: () => alive, onTick: () => {}, onError: (message: string) => errors.push(message),
    onComplete: (video: Blob, report: RecordingQualityReport) => completed.push({ video, report }),
    readSnapshot: (now: number): RecordingSnapshot => {
      const frame = goodFrame(now)
      const readiness = evaluateReadiness(null, { mode: 'camera', models: 'ready', error: '', frame,
        cameraFrameAt: now, visible: true, config: QUALITY_CONFIG }, now)
      return { frame, readiness: { ...readiness, canStartRecording: allowed,
        issues: bad ? [{ state: 'fail', reason: 'DARK', value: 0, blocking: true }] : [] }, visible: true, modelsReady: true }
    },
  }
  return { recorder, options, completed, errors,
    time: (value: number) => { time = value }, allow: (value: boolean) => { allowed = value },
    alive: (value: boolean) => { alive = value }, bad: () => { bad = true; allowed = false } }
}

test('records through quality failures and waits for final data before completing exactly once', async () => {
  const s = setup(), session = recordVideo(s.recorder, s.options)
  s.time(100); s.bad(); session.sample()
  assert.equal(s.recorder.state, 'recording'); assert.equal(s.recorder.stops, 0)
  s.recorder.emitData('first'); s.time(300); session.stop()
  assert.equal(s.completed.length, 0)
  s.recorder.emitData('last'); s.recorder.dispatchEvent(new Event('stop')); s.recorder.dispatchEvent(new Event('stop'))
  assert.equal(s.completed.length, 1)
  assert.equal(await s.completed[0].video.text(), 'firstlast')
  assert.equal(s.completed[0].report.durationMs, 300)
  assert.deepEqual(s.completed[0].report.issueIntervals, [{ startMs: 100, endMs: 300, reasonCodes: ['DARK'], blocking: true }])
})

test('ineligible or disconnected starts are rejected and encoder startup failures leave no live session', () => {
  const s = setup()
  s.allow(false); assert.throws(() => recordVideo(s.recorder, s.options), /Ready/)
  s.allow(true); s.alive(false); assert.throws(() => recordVideo(s.recorder, s.options), /Ready/)
  s.alive(true); s.recorder.failStart = true
  assert.throws(() => recordVideo(s.recorder, s.options), /Encoder failed/)
  s.recorder.dispatchEvent(new Event('stop')); assert.equal(s.completed.length, 0)
})

test('camera end and recorder errors retain available data with explicit end reasons', async () => {
  for (const failure of ['camera', 'recorder'] as const) {
    const s = setup(); recordVideo(s.recorder, s.options)
    s.recorder.emitData('partial'); s.time(200)
    if (failure === 'camera') s.alive(false)
    else s.recorder.dispatchEvent(new Event('error'))
    s.recorder.state = 'inactive'; s.recorder.dispatchEvent(new Event('stop'))
    assert.equal(await s.completed[0].video.text(), 'partial')
    assert.equal(s.completed[0].report.stopReason, failure === 'camera' ? 'camera-ended' : 'recorder-error')
    assert.equal(s.errors.length, failure === 'camera' ? 0 : 1)
  }
})

test('dispose stops the recorder and prevents callbacks; empty output still returns a report', () => {
  const s = setup(), session = recordVideo(s.recorder, s.options)
  session.dispose(); s.recorder.emitData('discarded'); s.recorder.dispatchEvent(new Event('stop'))
  assert.equal(s.completed.length, 0); assert.equal(s.recorder.stops, 1)
  const empty = setup(), emptySession = recordVideo(empty.recorder, empty.options)
  empty.time(100); emptySession.stop('camera-stopped'); empty.recorder.dispatchEvent(new Event('stop'))
  assert.equal(empty.completed[0].video.size, 0)
  assert.equal(empty.completed[0].report.stopReason, 'camera-stopped')
  assert.equal(empty.errors.length, 1)
})
