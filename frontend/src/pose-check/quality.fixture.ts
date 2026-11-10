import type { PoseFrame } from './halpe26.ts'
import { QUALITY_CONFIG } from './quality-config.ts'

export function goodFrame(capturedAt = 0): PoseFrame {
  const histogram = new Array<number>(256).fill(0); histogram[100] = 128 ** 2
  return { width: 640, height: 480, capturedAt, generation: 1, configVersion: QUALITY_CONFIG.version,
    people: [{ x1: 160, y1: 40, x2: 480, y2: 440, score: 0.9 }],
    keypoints: Array.from({ length: 26 }, (_, i) => ({ x: 250 + i, y: 100 + i * 10, score: 0.8 })),
    inferenceMs: 50, runtime: { revision: 0, detector: { revision: 0, provider: 'wasm' }, pose: { revision: 0, provider: 'wasm' } },
    timings: { readPixelsMs: 0, detectorPreMs: 0, detectorRunMs: 0, detectorDecodeMs: 0,
      posePreMs: 0, poseRunMs: 0, poseDecodeMs: 0, totalWorkerMs: 50 },
    quality: { personLuma: 100, backgroundLuma: 100, personHistogram: histogram, sharpness: 100 },
  }
}
