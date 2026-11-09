import type { PoseFrame } from './halpe26.ts'
import type { QualityConfig } from './quality-config.ts'
import type { QualityCheck, ReasonCode } from './quality-checks.ts'
import type { Readiness } from './readiness.ts'

export type RecordingStopReason = 'user-stopped' | 'camera-stopped' | 'camera-ended' | 'recorder-error' | 'recorder-ended'
export type RecordingReason = ReasonCode | 'PAGE_HIDDEN' | 'MODELS_UNAVAILABLE' | 'MONITORING_GAP'
export type QualityInterval = { startMs: number; endMs: number; reasonCodes: RecordingReason[] }
export type RecordingSnapshot = {
  frame: PoseFrame | null; readiness: Readiness; visible: boolean; modelsReady: boolean
}
export type RecordingFrame = PoseFrame & {
  capturedOffsetMs: number; observedOffsetMs: number; configVersion: string
  checks: QualityCheck[]; status: Readiness['status']; canStartRecording: boolean
}
export type RecordingQualityReport = {
  schemaVersion: 1; purpose: 'experimental-video-quality'; config: QualityConfig
  clock: 'performance.now'; startedAt: number; startedAtIso: string
  durationMs: number; stopReason: RecordingStopReason; mimeType: string
  source: { width: number; height: number }; frames: RecordingFrame[]; issueIntervals: QualityInterval[]
}

export function collectRecordingQuality(startedAt: number, config: QualityConfig, source: { width: number; height: number }, startedAtIso: string) {
  const activeConfig = { ...config }
  const frames: RecordingFrame[] = [], intervals: QualityInterval[] = []
  const open = new Map<RecordingReason, number>()
  let lastObserved = startedAt, lastFrame = '', finished: RecordingQualityReport | null = null
  const offset = (now: number) => Math.max(0, now - startedAt)
  function observe(snapshot: RecordingSnapshot, now: number) {
    if (finished) return
    if (!Number.isFinite(now) || now < lastObserved) throw new Error('Recording observations must use a monotonic clock.')
    if (now - lastObserved > activeConfig.maxFrameAgeMs) {
      intervals.push({ startMs: offset(lastObserved), endMs: offset(now), reasonCodes: ['MONITORING_GAP'] })
    }
    lastObserved = now
    const reasons = new Set<RecordingReason>(snapshot.readiness.issues.map((issue) => issue.reason))
    if (!snapshot.visible) reasons.add('PAGE_HIDDEN')
    if (!snapshot.modelsReady) reasons.add('MODELS_UNAVAILABLE')
    for (const [reason, startMs] of open) if (!reasons.has(reason)) {
      intervals.push({ startMs, endMs: offset(now), reasonCodes: [reason] }); open.delete(reason)
    }
    for (const reason of reasons) if (!open.has(reason)) open.set(reason, offset(now))
    const frame = snapshot.frame
    const key = frame ? `${frame.generation}/${frame.runtime.revision}/${frame.capturedAt}` : ''
    // Results captured before recording started can inform warnings, but are not recorded as clip frames.
    if (frame && frame.capturedAt >= startedAt && frame.capturedAt <= now && key !== lastFrame) {
      lastFrame = key
      frames.push(structuredClone({ ...frame, capturedOffsetMs: offset(frame.capturedAt), observedOffsetMs: offset(now),
        configVersion: activeConfig.version, checks: snapshot.readiness.checks, status: snapshot.readiness.status,
        canStartRecording: snapshot.readiness.canStartRecording }))
    }
  }
  function finish(now: number, stopReason: RecordingStopReason, mimeType: string): RecordingQualityReport {
    if (finished) return finished
    if (!Number.isFinite(now) || now < lastObserved) throw new Error('Recording end precedes its last observation.')
    for (const [reason, startMs] of open) intervals.push({ startMs, endMs: offset(now), reasonCodes: [reason] })
    open.clear()
    // Combine concurrent reasons without moving their individual onset/recovery boundaries.
    const grouped = new Map<string, QualityInterval>()
    for (const interval of intervals.filter((item) => item.endMs > item.startMs)) {
      const key = `${interval.startMs}/${interval.endMs}`, existing = grouped.get(key)
      if (existing) existing.reasonCodes.push(...interval.reasonCodes)
      else grouped.set(key, { ...interval, reasonCodes: [...interval.reasonCodes] })
    }
    finished = { schemaVersion: 1, purpose: 'experimental-video-quality', config: activeConfig, clock: 'performance.now',
      startedAt, startedAtIso, durationMs: offset(now), stopReason, mimeType, source: { ...source }, frames,
      issueIntervals: [...grouped.values()].sort((a, b) => a.startMs - b.startMs) }
    return finished
  }
  return { observe, finish }
}
