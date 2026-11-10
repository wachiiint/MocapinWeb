import test from 'node:test'
import assert from 'node:assert/strict'
import { measurePixelQuality } from '../../src/pose-check/quality-pixels.ts'
import { evaluateQuality, sortIssues } from '../../src/pose-check/quality-checks.ts'
import { QUALITY_CONFIG } from '../../src/pose-check/quality-config.ts'
import type { Pixels, PoseFrame } from '../../src/pose-check/halpe26.ts'
import { REQUIRED_KEYPOINT_INDICES } from '../../src/pose-check/halpe26.ts'
import { goodFrame } from '../../src/pose-check/quality.fixture.ts'

function pixels(width: number, height: number, gray: (x: number, y: number) => number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, value = gray(x, y)
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255
  }
  return { width, height, data }
}
const issueCodes = (frame: PoseFrame) => sortIssues(evaluateQuality(frame, QUALITY_CONFIG).checks).map((c) => c.reason)

test('normal frame passes all checks; boundaries are inclusive and missing people are unknown dependencies', () => {
  assert.deepEqual(issueCodes(goodFrame()), [])
  const frame = goodFrame()
  const config = { ...QUALITY_CONFIG, minPersonHeight: 400 / 480, minPersonWidth: 0.5,
    minPersonLuma: 100, minSharpness: 100, maxClippedFraction: 0 }
  assert.ok(evaluateQuality(frame, config).checks.every((c) => c.state === 'pass'))
  frame.people = []; frame.keypoints = []
  const result = evaluateQuality(frame, QUALITY_CONFIG)
  assert.equal(result.checks[0].reason, 'NO_PERSON')
  assert.ok(result.checks.slice(1).every((c) => c.state === 'unknown'))
  assert.ok(evaluateQuality(null, QUALITY_CONFIG).checks.every((c) => c.state === 'unknown'))
})

test('required feet must stay in frame and clear, while edge margins no longer block', () => {
  const frame = goodFrame()
  frame.keypoints[25].y = 480
  assert.ok(issueCodes(frame).includes('KEYPOINTS'))
  frame.keypoints[25] = { x: 300, y: 300, score: 0.1 }
  assert.ok(issueCodes(frame).includes('KEYPOINTS'))
  assert.ok(evaluateQuality(frame, QUALITY_CONFIG).unclear.includes('Right Heel'))
  frame.keypoints = goodFrame().keypoints
  frame.keypoints[25].x = 0
  frame.people[0] = { x1: 0, y1: 0, x2: 640, y2: 480, score: 1 }
  assert.deepEqual(issueCodes(frame), [])
  frame.people[0] = { x1: 0, y1: 0, x2: 50, y2: 100, score: 1 }
  assert.ok(issueCodes(frame).includes('PERSON_SMALL'))
  frame.people.push({ ...frame.people[0] })
  assert.equal(issueCodes(frame)[0], 'MULTIPLE_PEOPLE')
  assert.ok(evaluateQuality(frame, QUALITY_CONFIG).checks.slice(1).every((c) => c.state === 'unknown'))
})

test('simultaneous lighting, blur and keypoint issues follow the required priority and clear on recovery', () => {
  const frame = goodFrame()
  frame.quality.personLuma = 20; frame.quality.backgroundLuma = 200; frame.quality.sharpness = 0
  frame.quality.personHistogram = new Array<number>(256).fill(0); frame.quality.personHistogram[255] = 100
  frame.keypoints[5].score = 0.1
  const codes = issueCodes(frame)
  assert.ok(codes.includes('DARK')); assert.ok(codes.includes('CLIPPED')); assert.ok(codes.includes('BACKLIGHT'))
  assert.ok(codes.indexOf('DARK') < codes.indexOf('BLUR'))
  assert.ok(codes.indexOf('KEYPOINTS') < codes.indexOf('BLUR'))
  assert.deepEqual(issueCodes(goodFrame()), [])
})

test('only the approved 21 named points are required; raw 26-point outputs remain intact', () => {
  const frame = goodFrame()
  for (let i = 0; i < 5; i++) frame.keypoints[i] = { x: -1, y: -1, score: 0 }
  const quality = evaluateQuality(frame, QUALITY_CONFIG)
  assert.equal(REQUIRED_KEYPOINT_INDICES.length, 21)
  assert.equal(quality.clearCount, 21)
  assert.equal(quality.requiredClearCount, 21)
  assert.deepEqual(sortIssues(quality.checks), [])
  assert.equal(frame.keypoints.length, 26)
  for (const index of REQUIRED_KEYPOINT_INDICES) {
    const missing = goodFrame(); missing.keypoints[index].score = 0.29
    assert.ok(evaluateQuality(missing, QUALITY_CONFIG).checks.some((c) => c.reason === 'KEYPOINTS' && c.blocking && c.state === 'fail'))
    missing.keypoints[index].score = 0.3
    assert.equal(evaluateQuality(missing, QUALITY_CONFIG).requiredClearCount, 21)
  }
})

test('pixel analysis distinguishes dark subjects, clipped pixels, backlit backgrounds and missing regions', () => {
  const person = [{ x1: 32, y1: 16, x2: 96, y2: 112, score: 1 }]
  const image = pixels(128, 128, (x, y) => x >= 32 && x < 96 && y >= 16 && y < 112 ? 20 : 255)
  const result = measurePixelQuality(image, person)
  assert.ok(result.personLuma! < 25); assert.ok(result.backgroundLuma! > 250)
  assert.equal(result.personHistogram.reduce((a, b) => a + b, 0), 128 ** 2)
  assert.equal(measurePixelQuality(image, []).personLuma, null)
  assert.equal(measurePixelQuality(image, [person[0], person[0]]).sharpness, null)
  const white = measurePixelQuality(pixels(128, 128, () => 255), [{ x1: 0, y1: 0, x2: 128, y2: 128, score: 1 }])
  assert.equal(white.personHistogram[255], 128 ** 2)
  assert.equal(white.backgroundLuma, null)
})

test('sharpness uses a fixed analysis resolution and a smooth image has lower variance', () => {
  const full = [{ x1: 0, y1: 0, x2: 128, y2: 128, score: 1 }]
  const sharp = measurePixelQuality(pixels(128, 128, (x, y) => (x + y) % 2 ? 200 : 50), full)
  const smooth = measurePixelQuality(pixels(128, 128, () => 125), full)
  assert.ok(sharp.sharpness! > 1000); assert.equal(smooth.sharpness, 0)
  const enlarged = measurePixelQuality(pixels(256, 256, () => 125), [{ ...full[0], x2: 256, y2: 256 }])
  assert.equal(enlarged.sharpness, smooth.sharpness)
  assert.equal(enlarged.personHistogram.reduce((a, b) => a + b, 0), 128 ** 2)
})

test('mirroring the source preserves framing, size, and pixel quality decisions', () => {
  const frame = goodFrame(), mirrored = goodFrame()
  mirrored.people = frame.people.map((b) => ({ ...b, x1: frame.width - b.x2, x2: frame.width - b.x1 }))
  mirrored.keypoints = frame.keypoints.map((p) => ({ ...p, x: frame.width - 1 - p.x }))
  assert.deepEqual(issueCodes(mirrored), issueCodes(frame))
})
