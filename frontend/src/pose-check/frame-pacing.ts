import type { DeviceEstimate } from './device-info.ts'

export function newFramePacing(kind: DeviceEstimate['kind']) {
  return { intervalMs: kind === 'phone' || kind === 'unknown' ? 200 : 100,
    nextAt: 0, lastSentAt: -1, seen: 0, smoothedMs: 0, revision: -1 }
}
type FramePacing = ReturnType<typeof newFramePacing>

// Called only for a new camera frame when the worker is ready and idle.
export function takeCameraFrame(pacing: FramePacing, now: number) {
  if (!Number.isFinite(now) || now < pacing.nextAt) return false
  pacing.lastSentAt = now
  pacing.nextAt = now + pacing.intervalMs
  return true
}

export function recordFrameCompletion(pacing: FramePacing, now: number, capturedAt: number, revision: number) {
  const elapsed = now - capturedAt
  if (capturedAt !== pacing.lastSentAt || !Number.isFinite(elapsed) || elapsed < 0) return
  if (revision !== pacing.revision) {
    pacing.revision = revision; pacing.seen = 0; pacing.smoothedMs = 0
  }
  pacing.seen++
  if (pacing.seen <= 3) return
  pacing.smoothedMs = pacing.seen === 4 ? elapsed : pacing.smoothedMs * 0.8 + elapsed * 0.2
  // At most ten updates/s, with a rest of half the observed processing time.
  pacing.intervalMs = Math.max(100, pacing.smoothedMs * 1.5)
  pacing.nextAt = Math.max(capturedAt + pacing.intervalMs, now + pacing.smoothedMs * 0.5)
}
