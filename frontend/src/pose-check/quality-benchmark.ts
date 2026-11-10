import { evaluateQuality, sortIssues, type QualityFrame } from './quality-checks.ts'
import { QUALITY_CONFIG, QUALITY_SETTINGS, type QualityConfig, type QualitySetting } from './quality-config.ts'

export type BenchmarkSample = {
  id: string; sourceGroup: string; split: 'calibration' | 'acceptance'; expected: 'good' | 'bad'
  labelSource: 'synthetic' | 'human'; labelledBy: string; provenance: string; frame: QualityFrame
}
export type BenchmarkDataset = { schemaVersion: 1; metricVersion: string; samples: BenchmarkSample[] }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.')
  return value as Record<string, unknown>
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export function parseBenchmarkConfig(value: unknown): QualityConfig {
  const config = object(value)
  if (!text(config.version)) throw new Error('Missing config version.')
  for (const key of Object.keys(QUALITY_SETTINGS) as QualitySetting[]) {
    const range = QUALITY_SETTINGS[key], v = config[key]
    if (!finite(v) || v < range.min || v > range.max) throw new Error(`Invalid config value: ${key}.`)
  }
  return Object.fromEntries(Object.keys(QUALITY_CONFIG).map((key) => [key, config[key]])) as QualityConfig
}

function parseFrame(value: unknown): QualityFrame {
  const frame = object(value)
  if (![frame.width, frame.height].every((v) => finite(v) && Number.isInteger(v) && v > 0)) throw new Error('Invalid image dimensions.')
  if (!Array.isArray(frame.people) || !Array.isArray(frame.keypoints) || ![0, 26].includes(frame.keypoints.length)) {
    throw new Error('Expected people and zero or 26 HALPE26 keypoints.')
  }
  const people = frame.people.map((value) => {
    const b = object(value)
    if (!['x1', 'y1', 'x2', 'y2', 'score'].every((key) => finite(b[key])) || Number(b.x2) <= Number(b.x1) || Number(b.y2) <= Number(b.y1)) {
      throw new Error('Invalid person box.')
    }
    return { x1: Number(b.x1), y1: Number(b.y1), x2: Number(b.x2), y2: Number(b.y2), score: Number(b.score) }
  })
  const keypoints = frame.keypoints.map((value) => {
    const p = object(value)
    if (![p.x, p.y, p.score].every(finite)) throw new Error('Invalid keypoint; preserve finite source coordinates and raw scores.')
    return { x: Number(p.x), y: Number(p.y), score: Number(p.score) }
  })
  const quality = object(frame.quality)
  for (const key of ['personLuma', 'backgroundLuma', 'sharpness']) {
    const v = quality[key]
    if (v !== null && (!finite(v) || v < 0 || (key !== 'sharpness' && v > 255))) throw new Error(`Invalid ${key}.`)
  }
  const histogram = quality.personHistogram
  if (!Array.isArray(histogram) || ![0, 256].includes(histogram.length) ||
    !histogram.every((v) => finite(v) && Number.isInteger(v) && v >= 0) ||
    (histogram.length && histogram.reduce((sum, n) => sum + n, 0) !== 128 ** 2)) throw new Error('Invalid 128 × 128 person histogram.')
  if ((quality.personLuma === null) !== (histogram.length === 0) ||
    (histogram.length === 0 && quality.sharpness !== null)) throw new Error('Inconsistent unavailable pixel metrics.')
  return { width: Number(frame.width), height: Number(frame.height), people, keypoints,
    quality: { personLuma: quality.personLuma as number | null, backgroundLuma: quality.backgroundLuma as number | null,
      sharpness: quality.sharpness as number | null, personHistogram: [...histogram] } }
}

export function parseBenchmarkDataset(value: unknown): BenchmarkDataset {
  const data = object(value)
  if (data.schemaVersion !== 1 || data.metricVersion !== QUALITY_CONFIG.version || !Array.isArray(data.samples) || !data.samples.length) {
    throw new Error('Expected a non-empty version 1 dataset with the current pixel metric version.')
  }
  const ids = new Set<string>(), groups = new Map<string, string>()
  const samples = data.samples.map((value): BenchmarkSample => {
    const row = object(value)
    for (const key of ['id', 'sourceGroup', 'labelledBy', 'provenance']) if (!text(row[key])) throw new Error(`Missing ${key}.`)
    if (!['calibration', 'acceptance'].includes(String(row.split)) || !['good', 'bad'].includes(String(row.expected)) ||
      !['synthetic', 'human'].includes(String(row.labelSource))) throw new Error('Invalid split, expected label or label source.')
    const id = String(row.id).trim(), group = String(row.sourceGroup).trim()
    if (ids.has(id)) throw new Error(`Duplicate sample id: ${id}.`)
    ids.add(id)
    if (groups.has(group) && groups.get(group) !== row.split) throw new Error(`Source group leaks across calibration/acceptance: ${group}.`)
    groups.set(group, String(row.split))
    const raw = object(row.frame)
    if (raw.configVersion !== undefined && raw.configVersion !== data.metricVersion) throw new Error('Frame metric version mismatch.')
    return { id, sourceGroup: group, split: row.split as BenchmarkSample['split'], expected: row.expected as BenchmarkSample['expected'],
      labelSource: row.labelSource as BenchmarkSample['labelSource'], labelledBy: String(row.labelledBy),
      provenance: String(row.provenance), frame: parseFrame(row.frame) }
  })
  return { schemaVersion: 1, metricVersion: String(data.metricVersion), samples }
}

export function benchmarkQuality(datasetValue: unknown, configValue: unknown = QUALITY_CONFIG) {
  const dataset = parseBenchmarkDataset(datasetValue), config = parseBenchmarkConfig(configValue)
  const samples = dataset.samples.map((sample) => {
    const { checks } = evaluateQuality(sample.frame, config), issues = sortIssues(checks)
    const blockers = issues.filter((check) => check.blocking)
    const predicted = !blockers.length ? 'pass' : blockers.some((check) => check.state === 'fail') ? 'fail' : 'unknown'
    const { frame: _, ...identity } = sample
    return { ...identity, predicted, checks, reasonCodes: issues.map((issue) => issue.reason) }
  })
  function summarize(rows: typeof samples) {
    const good = rows.filter((row) => row.expected === 'good'), bad = rows.filter((row) => row.expected === 'bad')
    const badPassed = bad.filter((row) => row.predicted === 'pass').length
    const goodWarned = good.filter((row) => row.predicted !== 'pass').length
    return { total: rows.length, good: good.length, bad: bad.length, goodPassed: good.length - goodWarned,
      goodWarned, badPassed, badBlocked: bad.length - badPassed, unknown: rows.filter((row) => row.predicted === 'unknown').length,
      falseAcceptanceRate: bad.length ? badPassed / bad.length : null,
      falseWarningRate: good.length ? goodWarned / good.length : null,
      sourceGroups: new Set(rows.map((row) => row.sourceGroup)).size }
  }
  const results = (['calibration', 'acceptance'] as const).map((split) => ({ split,
    synthetic: summarize(samples.filter((row) => row.split === split && row.labelSource === 'synthetic')),
    human: summarize(samples.filter((row) => row.split === split && row.labelSource === 'human')),
  }))
  return { schemaVersion: 1, scope: 'single-frame-quality', metricVersion: dataset.metricVersion, config, results, samples,
    limitations: 'Frame-level engineering checks only. Unknown blocks passing. Synthetic results do not validate real video, model parity, readiness, clinical suitability or mobile devices. No whole-clip decision is made.' }
}
