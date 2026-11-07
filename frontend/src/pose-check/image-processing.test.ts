import test from 'node:test'
import assert from 'node:assert/strict'
import { decodePeople, decodeSimCC, detectorInput, poseCrop, poseInput } from './image-processing.ts'
import { isClear } from './halpe26.ts'

function near(actual: number, expected: number) { assert.ok(Math.abs(actual - expected) < 0.0001, `${actual} != ${expected}`) }

test('detector uses BGR normalization and bottom/right 114 padding', () => {
  const input = detectorInput({ width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]) })
  near(input.scaleX, 160); near(input.scaleY, 160)
  near(input.data[0], (0 - 103.53) / 57.375)
  near(input.data[2 * 320 * 320], (255 - 123.675) / 58.395)
  near(input.data[200 * 320], (114 - 103.53) / 57.375)
})

test('detector output maps to source coordinates, filters labels and selects largest person', () => {
  const dets = new Float32Array([0, 0, 50, 50, 0.9, 0, 0, 100, 100, 0.8, 0, 0, 100, 100, 0.99, 0, 0, 10, 10, 0.1])
  const people = decodePeople(dets, new BigInt64Array([0n, 0n, 1n, 0n]), 0.5, 0.5, 640, 480, 0.5)
  assert.equal(people.length, 2)
  assert.equal(people[0].x2, 200)
  assert.equal(people[1].x2, 100)
  assert.throws(() => decodePeople(new Float32Array(3), new BigInt64Array(1), 1, 1, 100, 100, 0.5))
})

test('pose crop preserves center, expands by 1.25, and matches 192:256 aspect', () => {
  const crop = poseCrop({ x1: 100, y1: 50, x2: 180, y2: 210, score: 1 })
  near(crop.width / crop.height, 192 / 256)
  near(crop.left + crop.width / 2, 140)
  near(crop.top + crop.height / 2, 130)
  near(crop.height, 200)
})

test('SimCC maxima decode to source center using split ratio two and minimum axis score', () => {
  const x = new Float32Array(26 * 384), y = new Float32Array(26 * 512)
  for (let i = 0; i < 26; i++) { x[i * 384 + 192] = 0.8; y[i * 512 + 256] = 0.6 }
  const points = decodeSimCC(x, y, { left: 20, top: 30, width: 150, height: 200 })
  assert.equal(points.length, 26)
  for (const point of points) { near(point.x, 95); near(point.y, 130); near(point.score, 0.6) }
  assert.throws(() => decodeSimCC(new Float32Array(17 * 384), y, { left: 0, top: 0, width: 1, height: 1 }))
})

test('pose uses RGB normalization and zero padding outside the image', () => {
  const { data } = poseInput({ width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) },
    { x1: 10, y1: 10, x2: 20, y2: 20, score: 1 })
  near(data[0], -123.675 / 58.395)
  near(data[192 * 256], -116.28 / 57.12)
})

// Formula cases from MMDeploy SimCCLabelDecode, not full model parity fixtures.
test('SimCC preserves HALPE26 order, first tied maximum, and off-center source coordinates', () => {
  const x = new Float32Array(26 * 384), y = new Float32Array(26 * 512)
  for (let i = 0; i < 26; i++) {
    x[i * 384 + i * 3] = 0.7
    x[i * 384 + i * 3 + 1] = 0.7
    y[i * 512 + 511 - i * 5] = 0.9
  }
  const points = decodeSimCC(x, y, { left: -30, top: 15, width: 300, height: 400 })
  for (let i = 0; i < 26; i++) {
    near(points[i].x, -30 + i * 3 / 2 * 300 / 192)
    near(points[i].y, 15 + (511 - i * 5) / 2 * 400 / 256)
    near(points[i].score, 0.7)
  }
})

test('SimCC non-positive responses use the reference sentinel before inverse crop mapping', () => {
  for (const response of [0, -0.2]) {
    const x = new Float32Array(26 * 384).fill(response)
    const y = new Float32Array(26 * 512).fill(0.8)
    const points = decodeSimCC(x, y, { left: 20, top: 30, width: 192, height: 256 })
    for (const point of points) {
      near(point.x, 19.5)
      near(point.y, 29.5)
      near(point.score, response)
      assert.equal(isClear(point, 640, 480, 0.3), false)
    }
  }
})

test('clear points require a finite score, sufficient confidence, and coordinates inside the source frame', () => {
  assert.equal(isClear({ x: 10, y: 10, score: 0.8 }, 100, 100, 0.3), true)
  for (const point of [{ x: -1, y: 0, score: 1 }, { x: 100, y: 10, score: 1 },
    { x: 10, y: 10, score: 0.1 }, { x: 10, y: 10, score: Infinity }]) {
    assert.equal(isClear(point, 100, 100, 0.3), false)
  }
})
