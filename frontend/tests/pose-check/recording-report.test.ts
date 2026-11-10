import test from 'node:test'
import assert from 'node:assert/strict'
import { collectRecordingQuality, type RecordingSnapshot } from '../../src/pose-check/recording-report.ts'
import { evaluateReadiness, type Readiness } from '../../src/pose-check/readiness.ts'
import { QUALITY_CONFIG } from '../../src/pose-check/quality-config.ts'
import { goodFrame } from '../../src/pose-check/quality.fixture.ts'
import { isBlockingReason, type ReasonCode } from '../../src/pose-check/quality-checks.ts'

function snapshot(now: number, reasons: ReasonCode[] = []): RecordingSnapshot {
  const frame = goodFrame(now)
  const readiness = evaluateReadiness(null, { mode: 'camera', models: 'ready', error: '', frame,
    cameraFrameAt: now, visible: true, config: QUALITY_CONFIG }, now)
  return { frame, readiness: { ...readiness, canStartRecording: true,
    issues: reasons.map((reason) => ({ state: 'fail', reason, value: null, blocking: isBlockingReason(reason) })) }, visible: true, modelsReady: true }
}

test('quality intervals merge continuous reasons and preserve separate onset and recovery times', () => {
  const log = collectRecordingQuality(1000, QUALITY_CONFIG, { width: 640, height: 480 }, 'test')
  log.observe(snapshot(1000), 1000)
  log.observe(snapshot(1100, ['DARK']), 1100)
  log.observe(snapshot(1200, ['DARK', 'BLUR']), 1200)
  log.observe(snapshot(1300, ['DARK', 'BLUR']), 1300)
  log.observe(snapshot(1400, ['BLUR']), 1400)
  log.observe(snapshot(1500), 1500)
  const report = log.finish(1600, 'user-stopped', 'video/webm')
  assert.deepEqual(report.issueIntervals, [
    { startMs: 100, endMs: 400, reasonCodes: ['DARK'], blocking: true },
    { startMs: 200, endMs: 500, reasonCodes: ['BLUR'], blocking: false },
  ])
  assert.equal(report.durationMs, 600)
  assert.equal(report.frames[0].keypoints.length, 26)
  assert.equal(report.frames[0].configVersion, QUALITY_CONFIG.version)
  assert.equal(report.frames[1].capturedOffsetMs, 100)
  assert.equal(report.frames[1].checks.length, 9)
  assert.equal(report.schemaVersion, 2)
})

test('snapshot data and config are retained independently, repeated/pre-recording frames are omitted', () => {
  const config = { ...QUALITY_CONFIG }, log = collectRecordingQuality(1000, config, { width: 640, height: 480 }, 'test')
  const before = snapshot(900), first = snapshot(1050)
  log.observe(before, 1000); log.observe(first, 1100); log.observe(first, 1200)
  first.frame!.keypoints[0].x = 999; config.minSharpness = 999
  const report = log.finish(1300, 'camera-ended', 'video/webm')
  assert.equal(report.frames.length, 1)
  assert.equal(report.frames[0].capturedOffsetMs, 50)
  assert.equal(report.frames[0].observedOffsetMs, 100)
  assert.notEqual(report.frames[0].keypoints[0].x, 999)
  assert.equal(report.config.minSharpness, QUALITY_CONFIG.minSharpness)
  log.observe(snapshot(1400, ['DARK']), 1400)
  assert.equal(log.finish(1500, 'user-stopped', 'video/mp4'), report)
})

test('unknown checks, hidden pages, unavailable models and scheduling gaps are retained', () => {
  const log = collectRecordingQuality(0, QUALITY_CONFIG, { width: 640, height: 480 }, 'test')
  const hidden = snapshot(100)
  hidden.visible = false; hidden.modelsReady = false
  hidden.readiness.issues = [{ state: 'unknown', reason: 'POSE_UNKNOWN', value: null, blocking: true }]
  log.observe(snapshot(0), 0); log.observe(hidden, 100)
  log.observe(snapshot(2200), 2200)
  const report = log.finish(2300, 'recorder-error', 'video/webm')
  assert.deepEqual(report.issueIntervals.find((i) => i.startMs === 100 && i.endMs === 2200)?.reasonCodes,
    ['MONITORING_GAP', 'POSE_UNKNOWN', 'PAGE_HIDDEN', 'MODELS_UNAVAILABLE'])
  assert.equal(report.stopReason, 'recorder-error')
})

test('finishing closes ongoing warnings and rejects backwards observations', () => {
  const log = collectRecordingQuality(1000, QUALITY_CONFIG, { width: 640, height: 480 }, 'test')
  log.observe(snapshot(1100, ['DARK']), 1100)
  assert.throws(() => log.observe(snapshot(1050), 1050), /monotonic/)
  assert.throws(() => log.finish(1050, 'user-stopped', ''), /precedes/)
  assert.deepEqual(log.finish(1400, 'camera-stopped', 'video/webm').issueIntervals,
    [{ startMs: 100, endMs: 400, reasonCodes: ['DARK'], blocking: true }])
})

test('simultaneous warnings and blockers retain separate severity in intervals and frame checks', () => {
  const log = collectRecordingQuality(0, QUALITY_CONFIG, { width: 640, height: 480 }, 'test')
  log.observe(snapshot(100, ['DARK', 'BLUR', 'BACKLIGHT']), 100)
  log.observe(snapshot(200), 200)
  const report = log.finish(300, 'user-stopped', 'video/webm')
  assert.deepEqual(report.issueIntervals, [
    { startMs: 100, endMs: 200, reasonCodes: ['DARK'], blocking: true },
    { startMs: 100, endMs: 200, reasonCodes: ['BLUR', 'BACKLIGHT'], blocking: false },
  ])
  assert.ok(report.frames[0].checks.find((c) => c.reason === 'DARK')!.blocking)
  assert.equal(report.frames[0].checks.find((c) => c.reason === 'BLUR')!.blocking, false)
})

test('a previously Ready result cannot authorize a late click after the result has expired', () => {
  let ready: Readiness | null = null
  for (let time = 0; time <= 2000; time += 500) {
    ready = evaluateReadiness(ready, { mode: 'camera', models: 'ready', error: '', frame: goodFrame(time),
      cameraFrameAt: time, visible: true, config: QUALITY_CONFIG }, time)
  }
  assert.equal(ready!.canStartRecording, true)
  const atClick = evaluateReadiness(ready, { mode: 'camera', models: 'ready', error: '', frame: goodFrame(2000),
    cameraFrameAt: 2000, visible: true, config: QUALITY_CONFIG }, 3001)
  assert.equal(atClick.canStartRecording, false)
})
