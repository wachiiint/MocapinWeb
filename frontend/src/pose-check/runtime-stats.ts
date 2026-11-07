import type { TimingSample } from './halpe26.ts'

export const TIMING_LABELS: Record<keyof TimingSample, string> = {
  readPixelsMs: 'Read pixels', detectorPreMs: 'Detector preprocessing', detectorRunMs: 'Detector run',
  detectorDecodeMs: 'Detector decoding', posePreMs: 'Pose preprocessing', poseRunMs: 'Pose run',
  poseDecodeMs: 'Pose decoding', totalWorkerMs: 'Worker total', frameAgeMs: 'Frame age',
}
export type TimingWindow = { revision: number; seen: number; samples: TimingSample[] }
export function newTimingWindow(): TimingWindow { return { revision: -1, seen: 0, samples: [] } }

export function recordTiming(window: TimingWindow, revision: number, sample: TimingSample) {
  if (window.revision !== revision) { window.revision = revision; window.seen = 0; window.samples = [] }
  window.seen++
  if (window.seen <= 3) return
  window.samples.push(sample)
  if (window.samples.length > 60) window.samples.shift()
}

export function summarizeTimings(window: TimingWindow) {
  const summary: Partial<Record<keyof TimingSample, { median: number; p95: number }>> = {}
  for (const key of Object.keys(TIMING_LABELS) as (keyof TimingSample)[]) {
    const values = window.samples.map((sample) => sample[key]).sort((a, b) => a - b)
    if (!values.length) continue
    const mid = Math.floor(values.length / 2)
    summary[key] = {
      median: values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2,
      p95: values[Math.ceil(values.length * 0.95) - 1],
    }
  }
  return summary
}
