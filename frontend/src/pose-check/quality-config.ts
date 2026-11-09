// Experimental engineering criteria only. Phase A and independent device testing remain pending.
export const QUALITY_CONFIG = {
  version: 'video-quality-experimental-v1',
  keypointScore: 0.3,
  edgeMargin: 0.03,
  minPersonHeight: 0.45,
  minPersonWidth: 0.12,
  minPersonLuma: 45,
  clippedLuma: 245,
  maxClippedFraction: 0.2,
  backlightDelta: 55,
  backlightPersonMax: 120,
  minSharpness: 35,
  cameraStallMs: 1000,
  maxFrameAgeMs: 1000,
  readyHoldMs: 2000,
}
export type QualityConfig = typeof QUALITY_CONFIG
export type QualitySetting = Exclude<keyof QualityConfig, 'version'>
export const QUALITY_SETTINGS: Record<QualitySetting, { label: string; min: number; max: number; step: number }> = {
  keypointScore: { label: 'Keypoint raw score', min: 0.05, max: 0.95, step: 0.05 },
  edgeMargin: { label: 'Frame margin (fraction)', min: 0, max: 0.2, step: 0.01 },
  minPersonHeight: { label: 'Minimum person height (fraction)', min: 0.1, max: 0.95, step: 0.05 },
  minPersonWidth: { label: 'Minimum person width (fraction)', min: 0.05, max: 0.8, step: 0.01 },
  minPersonLuma: { label: 'Minimum person brightness (0–255)', min: 0, max: 200, step: 1 },
  clippedLuma: { label: 'Clipped pixel brightness (0–255)', min: 200, max: 255, step: 1 },
  maxClippedFraction: { label: 'Maximum clipped fraction', min: 0, max: 1, step: 0.01 },
  backlightDelta: { label: 'Background brightness difference', min: 0, max: 255, step: 1 },
  backlightPersonMax: { label: 'Backlight person brightness ceiling', min: 0, max: 255, step: 1 },
  minSharpness: { label: 'Minimum Laplacian variance', min: 0, max: 1000, step: 1 },
  cameraStallMs: { label: 'Camera interruption limit (ms)', min: 100, max: 1000, step: 100 },
  maxFrameAgeMs: { label: 'Pose freshness limit (ms)', min: 100, max: 1000, step: 100 },
  readyHoldMs: { label: 'Continuous passing time (ms)', min: 2000, max: 10000, step: 100 },
}
