import test from 'node:test'
import assert from 'node:assert/strict'
import { Tensor } from 'onnxruntime-web/wasm'
import { compareDetectorOutput, comparePoseOutput } from '../../src/pose-check/runtime-output.ts'

function detector(rows: number[][]) {
  return { dets: new Tensor('float32', new Float32Array(rows.flat()), [1, rows.length, 5]),
    labels: new Tensor('int64', new BigInt64Array(rows.length), [1, rows.length]) }
}
function pose(shift = 0, score = 0.8) {
  const x = new Float32Array(26 * 384), y = new Float32Array(26 * 512)
  for (let i = 0; i < 26; i++) { x[i * 384 + 100 + shift] = score; y[i * 512 + 150] = score }
  return { simcc_x: new Tensor('float32', x, [1, 26, 384]), simcc_y: new Tensor('float32', y, [1, 26, 512]) }
}

test('detector comparison catches silent empty/extra detections but does not verify an empty scene', () => {
  const empty = detector([[0, 0, 0, 0, 0]]), person = detector([[10, 20, 100, 200, 0.9]])
  assert.equal(compareDetectorOutput(empty, person), 'mismatch')
  assert.equal(compareDetectorOutput(person, empty), 'mismatch')
  assert.equal(compareDetectorOutput(empty, empty), 'inconclusive')
  assert.equal(compareDetectorOutput(person, person), 'match')
})

test('detector matches boxes independently of ordering and tolerates small pixel/score differences', () => {
  const reference = detector([[10, 20, 100, 200, 0.8], [120, 20, 180, 100, 0.9]])
  const near = detector([[120, 20, 180, 100, 0.9], [11, 20, 101, 200, 0.81]])
  assert.equal(compareDetectorOutput(near, reference), 'match')
  assert.equal(compareDetectorOutput(detector([[12, 20, 102, 200, 0.8]]), detector([[10, 20, 100, 200, 0.8]])), 'mismatch')
  assert.equal(compareDetectorOutput(detector([[10, 20, 100, 200, 0.82]]), detector([[10, 20, 100, 200, 0.8]])), 'mismatch')
})

test('pose comparison checks coordinates and raw scores rather than just tensor dimensions', () => {
  assert.equal(comparePoseOutput(pose(), pose()), 'match')
  assert.equal(comparePoseOutput(pose(1, 0.8005), pose()), 'match')
  assert.equal(comparePoseOutput(pose(2), pose()), 'mismatch')
  assert.equal(comparePoseOutput(pose(0, 0.81), pose()), 'mismatch')
  assert.equal(comparePoseOutput(pose(0, 0), pose()), 'mismatch')
  assert.equal(comparePoseOutput(pose(0, 0), pose(0, 0)), 'inconclusive')
})

test('non-finite GPU values trigger fallback while invalid reference data/layout remains an error', () => {
  const badDetector = detector([[0, 0, 100, 200, NaN]]), empty = detector([[0, 0, 0, 0, 0]])
  assert.equal(compareDetectorOutput(badDetector, empty), 'mismatch')
  assert.throws(() => compareDetectorOutput(empty, badDetector), /non-finite detector/)
  const badPose = pose(); (badPose.simcc_x.data as Float32Array)[0] = NaN
  assert.equal(comparePoseOutput(badPose, pose()), 'mismatch')
  assert.throws(() => comparePoseOutput(pose(), badPose), /non-finite pose/)
  assert.throws(() => comparePoseOutput(detector([]), pose()), /HALPE26 outputs/)
})
