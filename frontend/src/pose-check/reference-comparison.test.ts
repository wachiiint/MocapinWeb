import test from 'node:test'
import assert from 'node:assert/strict'
import { compareReferenceRuns, parseReferenceRun } from '../../compare-reference.ts'
import { KEYPOINT_NAMES } from './halpe26.ts'

// Synthetic contract fixtures only. These do not establish official pipeline parity.
function run() {
  return {
    schemaVersion: 1, imageSha256: 'a'.repeat(64), detectorSha256: 'b'.repeat(64), poseSha256: 'c'.repeat(64),
    width: 640, height: 480, coordinateSpace: 'source-unmirrored', mode: 'end-to-end', provenance: 'Synthetic test',
    people: [{ x1: 10, y1: 20, x2: 200, y2: 400, score: 0.9 }],
    keypoints: KEYPOINT_NAMES.map((name, i) => ({ name, x: i * 2, y: i * 3, score: 0.8 })),
  }
}

test('comparison reports per-landmark and aggregate absolute differences without a pass claim', () => {
  const reference = run(), browser = run()
  browser.keypoints[0].x += 4
  browser.keypoints[1].y -= 2
  browser.keypoints[0].score -= 0.25
  browser.people[0].x1 += 2
  const report = compareReferenceRuns(reference, browser)
  assert.equal(report.keypointCoordinatePixels?.maxAbsolute, 4)
  assert.equal(report.keypointCoordinatePixels?.meanAbsolute, 6 / 52)
  assert.equal(report.keypointScores?.maxAbsolute, 0.25)
  assert.equal(report.boxCoordinatePixels?.meanAbsolute, 0.5)
  assert.equal(report.points?.[0].name, 'Nose')
  assert.equal('passed' in report, false)
})

test('comparison rejects incompatible input evidence and landmark order', () => {
  for (const change of [
    { imageSha256: 'd'.repeat(64) }, { poseSha256: 'd'.repeat(64) }, { width: 320 },
    { coordinateSpace: 'mirrored' }, { provenance: '' },
  ]) assert.throws(() => compareReferenceRuns(run(), { ...run(), ...change }))
  const invalid = run()
  invalid.keypoints.reverse()
  assert.throws(() => parseReferenceRun(invalid), /HALPE26/)
  invalid.keypoints = run().keypoints
  invalid.keypoints[0].x = NaN
  assert.throws(() => parseReferenceRun(invalid), /finite/)
})

test('missing detections are explicit, never a zero-error pose comparison', () => {
  const empty = { ...run(), people: [], keypoints: [] }
  const mismatch = compareReferenceRuns(run(), empty)
  assert.equal(mismatch.peopleCount.equal, false)
  assert.equal(mismatch.boxes, null)
  assert.equal(mismatch.points, null)
  assert.equal(compareReferenceRuns(empty, empty).keypointCoordinatePixels, null)
})

test('shared-box mode requires identical supplied coordinates', () => {
  const reference = { ...run(), mode: 'shared-box', suppliedBox: run().people[0] }
  assert.equal(compareReferenceRuns(reference, reference).keypointCoordinatePixels?.maxAbsolute, 0)
  assert.throws(() => compareReferenceRuns(reference, { ...reference, suppliedBox: { ...reference.suppliedBox, x1: 11 } }), /boxes differ/)
  assert.throws(() => parseReferenceRun({ ...reference, suppliedBox: undefined }))
})
