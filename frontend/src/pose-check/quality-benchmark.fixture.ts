import type { BenchmarkDataset, BenchmarkSample } from './quality-benchmark.ts'
import type { Pixels } from './halpe26.ts'
import { measurePixelQuality } from './quality-pixels.ts'
import { QUALITY_CONFIG } from './quality-config.ts'

const CONDITIONS = ['good', 'dark', 'clipped', 'backlight', 'blur', 'feet-out', 'near-edge', 'far', 'occluded', 'no-person', 'multiple'] as const

// Procedural image patterns and supplied pose geometry, never official model outputs or human labels.
export function syntheticQualityDataset(): BenchmarkDataset {
  const samples: BenchmarkSample[] = []
  for (const split of ['calibration', 'acceptance'] as const) for (const condition of CONDITIONS) {
    const width = split === 'calibration' ? 128 : 160, height = split === 'calibration' ? 160 : 192
    const box = { x1: width * 0.2, y1: height * 0.06, x2: width * 0.8, y2: height * 0.94, score: 0.9 }
    if (condition === 'near-edge') box.x1 = width * 0.01
    if (condition === 'far') { box.x1 = width * 0.45; box.x2 = width * 0.55; box.y1 = height * 0.35; box.y2 = height * 0.65 }
    const data = new Uint8ClampedArray(width * height * 4)
    const image: Pixels = { width, height, data }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const inside = x >= box.x1 && x < box.x2 && y >= box.y1 && y < box.y2
      const pattern = (Math.floor(x / (split === 'calibration' ? 4 : 5)) + Math.floor(y / 4)) % 2 ? 1 : -1
      let gray = inside ? 110 + pattern * 40 : 110
      if (condition === 'dark' && inside) gray = 20 + pattern * 10
      if (condition === 'clipped' && inside) gray = 250 + pattern * 5
      if (condition === 'backlight') gray = inside ? 70 + pattern * 20 : 230
      if (condition === 'blur' && inside) gray = 110
      const i = (y * width + x) * 4
      data[i] = data[i + 1] = data[i + 2] = gray; data[i + 3] = 255
    }
    const people = condition === 'no-person' ? [] : condition === 'multiple' ? [box, { ...box }] : [box]
    const keypoints = people.length ? Array.from({ length: 26 }, (_, i) => ({
      x: box.x1 + ((i % 5 + 1) / 6) * (box.x2 - box.x1),
      y: box.y1 + ((Math.floor(i / 5) + 1) / 7) * (box.y2 - box.y1), score: 0.8,
    })) : []
    if (condition === 'feet-out') keypoints[25].y = height + 1
    if (condition === 'occluded') keypoints[25].score = 0.1
    samples.push({ id: `${split}-${condition}`, sourceGroup: `${split}-procedural-scene`, split,
      expected: condition === 'good' ? 'good' : 'bad', labelSource: 'synthetic', labelledBy: 'procedural-fixture-v1',
      provenance: `Generated ${width}x${height} grayscale pattern; ${condition}; supplied HALPE26 geometry, no model inference.`,
      frame: { width, height, people, keypoints, quality: measurePixelQuality(image, people) } })
  }
  return { schemaVersion: 1, metricVersion: QUALITY_CONFIG.version, samples }
}
