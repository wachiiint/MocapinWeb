import type { PoseFrame } from './halpe26.ts'
import { evaluateQuality, sortIssues, type QualityCheck } from './quality-checks.ts'
import type { QualityConfig } from './quality-config.ts'

export type GateStatus = 'Camera Off' | 'Loading Models' | 'Checking' | 'Needs Adjustment' | 'Ready — Experimental' | 'Error'
export type GateInput = {
  mode: 'off' | 'starting' | 'camera' | 'image'
  models: 'loading' | 'recovering' | 'ready' | 'error'
  error: string
  frame: PoseFrame | null
  cameraFrameAt: number | null
  visible: boolean
  config: QualityConfig
}
export type Readiness = {
  status: GateStatus; canStartRecording: boolean; showOverlay: boolean
  checks: QualityCheck[]; issues: QualityCheck[]; primaryReason: QualityCheck | null
  clearCount: number; requiredClearCount: number; unclear: string[]; passingMs: number
  // Internal continuity state. Times use performance.now(), never wall-clock dates.
  runKey: string; passingSince: number | null; lastCapturedAt: number | null; evaluatedAt: number
}

export function evaluateReadiness(previous: Readiness | null, input: GateInput, now: number): Readiness {
  const { frame, config } = input
  const quality = evaluateQuality(frame, config)
  const cameraAge = input.cameraFrameAt === null ? null : now - input.cameraFrameAt
  const frameAge = frame ? now - frame.capturedAt : null
  const fresh = frameAge !== null && Number.isFinite(frameAge) && frameAge >= 0 && frameAge <= config.maxFrameAgeMs
  const cameraFresh = cameraAge !== null && Number.isFinite(cameraAge) && cameraAge >= 0 && cameraAge <= config.cameraStallMs
  const checks = [...quality.checks]
  if (input.mode !== 'image') checks.push(
    { state: cameraAge === null ? 'unknown' : cameraFresh ? 'pass' : 'fail', reason: cameraAge === null ? 'CAMERA_UNKNOWN' : 'CAMERA_STALLED', value: cameraAge, blocking: true },
    { state: frameAge === null ? 'unknown' : fresh ? 'pass' : 'fail', reason: frameAge === null ? 'POSE_UNKNOWN' : 'POSE_STALE', value: frameAge, blocking: true },
  )
  if (input.error || input.models === 'error') checks.unshift({ state: 'fail', reason: 'ERROR', value: null, blocking: true })
  const issues = sortIssues(checks)
  const blockers = issues.filter((check) => check.blocking)
  const runKey = JSON.stringify([frame?.generation, frame?.runtime.revision, input.mode, input.models, input.visible, config])
  let passingSince: number | null = null, passingMs = 0
  let status: GateStatus = 'Checking'
  if (input.error || input.models === 'error') status = 'Error'
  else if (input.models !== 'ready') status = 'Loading Models'
  else if (input.mode === 'off') status = 'Camera Off'
  else if (input.mode === 'starting' || !input.visible || (input.mode === 'camera' && !fresh)) status = 'Checking'
  else if (blockers.length) status = blockers.some((c) => c.state === 'fail') ? 'Needs Adjustment' : 'Checking'
  else if (input.mode === 'camera' && frame && cameraFresh) {
    const continuous = previous?.runKey === runKey && previous.passingSince !== null && previous.lastCapturedAt !== null &&
      now >= previous.evaluatedAt && now - previous.evaluatedAt <= config.maxFrameAgeMs &&
      frame.capturedAt >= previous.lastCapturedAt && frame.capturedAt - previous.lastCapturedAt <= config.maxFrameAgeMs
    // Repeated watchdog ticks cannot advance the passing interval without a new inference frame.
    passingSince = continuous ? previous.passingSince : now
    passingMs = Math.max(0, frame.capturedAt - passingSince!)
    if (passingMs >= config.readyHoldMs) status = 'Ready — Experimental'
  }
  return { status, canStartRecording: status === 'Ready — Experimental',
    showOverlay: !!frame && input.models === 'ready' && !input.error &&
      (input.mode === 'image' || (input.mode === 'camera' && input.visible && fresh && cameraFresh)),
    checks, issues, primaryReason: issues[0] ?? null, clearCount: quality.clearCount, unclear: quality.unclear,
    requiredClearCount: quality.requiredClearCount, passingMs, passingSince, runKey, lastCapturedAt: frame?.capturedAt ?? null, evaluatedAt: now }
}
