import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { KEYPOINT_NAMES, type Box, type Keypoint } from './src/pose-check/halpe26.ts'

type ReferenceRun = {
  schemaVersion: 1
  imageSha256: string
  detectorSha256: string
  poseSha256: string
  width: number
  height: number
  coordinateSpace: 'source-unmirrored'
  mode: 'end-to-end' | 'shared-box'
  suppliedBox?: Box
  provenance: string
  people: Box[]
  keypoints: (Keypoint & { name: string })[]
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.')
  return value as Record<string, unknown>
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function box(value: unknown): Box {
  const item = object(value)
  if (!['x1', 'y1', 'x2', 'y2', 'score'].every((key) => finite(item[key])) ||
    Number(item.x2) <= Number(item.x1) || Number(item.y2) <= Number(item.y1)) {
    throw new Error('Expected a finite box with positive area and a raw score.')
  }
  return item as Box
}

export function parseReferenceRun(value: unknown): ReferenceRun {
  const run = object(value)
  if (run.schemaVersion !== 1 || run.coordinateSpace !== 'source-unmirrored' ||
    !['end-to-end', 'shared-box'].includes(String(run.mode))) throw new Error('Unsupported reference contract.')
  for (const key of ['imageSha256', 'detectorSha256', 'poseSha256']) {
    if (typeof run[key] !== 'string' || !/^[a-f0-9]{64}$/.test(run[key])) throw new Error(`Invalid ${key}. Use lowercase SHA-256.`)
  }
  if (![run.width, run.height].every((v) => finite(v) && Number.isInteger(v) && v > 0)) {
    throw new Error('Expected positive integer source dimensions.')
  }
  if (typeof run.provenance !== 'string' || !run.provenance.trim()) throw new Error('Missing run provenance.')
  if (!Array.isArray(run.people) || !Array.isArray(run.keypoints)) throw new Error('Missing output arrays.')
  run.people.forEach(box)
  if (run.mode === 'shared-box') box(run.suppliedBox)
  const expectedPoints = run.mode === 'shared-box' || run.people.length ? 26 : 0
  if (run.keypoints.length !== expectedPoints) throw new Error(`Expected ${expectedPoints} keypoints.`)
  run.keypoints.forEach((value, i) => {
    const point = object(value)
    if (point.name !== KEYPOINT_NAMES[i] || ![point.x, point.y, point.score].every(finite)) {
      throw new Error(`Invalid HALPE26 point at index ${i}; expected ${KEYPOINT_NAMES[i]} and finite values.`)
    }
  })
  return run as ReferenceRun
}

function summary(values: number[]) {
  return values.length ? {
    count: values.length, meanAbsolute: values.reduce((sum, value) => sum + value, 0) / values.length,
    maxAbsolute: Math.max(...values),
  } : null
}

export function compareReferenceRuns(referenceValue: unknown, browserValue: unknown) {
  const reference = parseReferenceRun(referenceValue), browser = parseReferenceRun(browserValue)
  for (const key of ['imageSha256', 'detectorSha256', 'poseSha256', 'width', 'height', 'mode'] as const) {
    if (reference[key] !== browser[key]) throw new Error(`Cannot compare different ${key}.`)
  }
  if (reference.mode === 'shared-box') {
    for (const key of ['x1', 'y1', 'x2', 'y2'] as const) {
      if (reference.suppliedBox![key] !== browser.suppliedBox![key]) throw new Error('Shared pose boxes differ.')
    }
  }
  const names = ['x1', 'y1', 'x2', 'y2'] as const
  // Match the application's largest-person-first selection. Equal-area ordering remains ambiguous.
  const sorted = (people: Box[]) => [...people].sort((a, b) =>
    (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1))
  const refBoxes = sorted(reference.people), browserBoxes = sorted(browser.people)
  const boxes = refBoxes.length === browserBoxes.length ? refBoxes.map((ref, i) => ({
    rank: i, coordinateAbsolute: names.map((key) => Math.abs(ref[key] - browserBoxes[i][key])),
    scoreAbsolute: Math.abs(ref.score - browserBoxes[i].score),
  })) : null
  const points = reference.keypoints.length === browser.keypoints.length
    ? reference.keypoints.map((ref, i) => ({
      name: ref.name, xAbsolute: Math.abs(ref.x - browser.keypoints[i].x),
      yAbsolute: Math.abs(ref.y - browser.keypoints[i].y), scoreAbsolute: Math.abs(ref.score - browser.keypoints[i].score),
    })) : null
  return {
    referenceProvenance: reference.provenance, browserProvenance: browser.provenance,
    peopleCount: { reference: refBoxes.length, browser: browserBoxes.length, equal: refBoxes.length === browserBoxes.length },
    boxes, boxCoordinatePixels: summary(boxes?.flatMap((b) => b.coordinateAbsolute) ?? []),
    boxScores: summary(boxes?.map((b) => b.scoreAbsolute) ?? []),
    points, keypointCoordinatePixels: summary(points?.flatMap((p) => [p.xAbsolute, p.yAbsolute]) ?? []),
    keypointScores: summary(points?.map((p) => p.scoreAbsolute) ?? []),
    note: 'Differences only; no automatic parity acceptance. Boxes are paired by descending area, not identity.',
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [, , referencePath, browserPath, ...extra] = process.argv
    if (!referencePath || !browserPath || extra.length) throw new Error('Usage: node compare-reference.ts reference.json browser.json')
    const result = compareReferenceRuns(JSON.parse(readFileSync(referencePath, 'utf8')), JSON.parse(readFileSync(browserPath, 'utf8')))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
