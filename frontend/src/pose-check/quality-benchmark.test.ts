import test from 'node:test'
import assert from 'node:assert/strict'
import { benchmarkQuality, parseBenchmarkDataset } from './quality-benchmark.ts'
import { syntheticQualityDataset } from './quality-benchmark.fixture.ts'
import { QUALITY_CONFIG } from './quality-config.ts'

test('procedural image cases run actual pixel analysis and keep calibration/acceptance results separate', () => {
  const report = benchmarkQuality(syntheticQualityDataset())
  assert.equal(report.samples.length, 22)
  for (const split of report.results) {
    assert.equal(split.synthetic.goodPassed, 1)
    assert.equal(split.synthetic.badPassed, 0)
    assert.equal(split.synthetic.badBlocked, 10)
    assert.equal(split.human.total, 0)
    assert.equal(split.human.falseAcceptanceRate, null)
    assert.equal(split.human.falseWarningRate, null)
  }
  for (const [id, code] of [['dark', 'DARK'], ['clipped', 'CLIPPED'], ['backlight', 'BACKLIGHT'], ['blur', 'BLUR'],
    ['feet-out', 'FRAMING'], ['near-edge', 'FRAMING'], ['far', 'PERSON_SMALL'], ['occluded', 'KEYPOINTS'],
    ['no-person', 'NO_PERSON'], ['multiple', 'MULTIPLE_PEOPLE']] as const) {
    for (const split of ['calibration', 'acceptance']) assert.ok(report.samples.find((s) => s.id === `${split}-${id}`)?.reasonCodes.includes(code))
  }
})

test('confusion counts expose false acceptance and false warning without mixing human and synthetic evidence', () => {
  const data = syntheticQualityDataset(), good = data.samples[0], bad = data.samples[1]
  data.samples = [
    { ...good, id: 'bad-but-passed', expected: 'bad', labelSource: 'human', labelledBy: 'test-only-human-label' },
    { ...bad, id: 'good-but-warned', expected: 'good', labelSource: 'human', labelledBy: 'test-only-human-label' }, good,
  ]
  const result = benchmarkQuality(data).results[0]
  assert.equal(result.human.badPassed, 1); assert.equal(result.human.goodWarned, 1)
  assert.equal(result.human.falseAcceptanceRate, 1); assert.equal(result.human.falseWarningRate, 1)
  assert.equal(result.synthetic.total, 1)
})

test('unknown measurements never pass, and missing label classes have unavailable rates', () => {
  const data = syntheticQualityDataset(), sample = data.samples[0]
  sample.frame.quality.backgroundLuma = null
  data.samples = [sample]
  const report = benchmarkQuality(data)
  assert.equal(report.samples[0].predicted, 'unknown')
  assert.equal(report.results[0].synthetic.goodWarned, 1)
  assert.equal(report.results[0].synthetic.falseAcceptanceRate, null)
})

test('duplicates, source leakage, missing provenance and invalid numeric inputs are rejected', () => {
  const duplicate = syntheticQualityDataset(); duplicate.samples[1].id = duplicate.samples[0].id
  assert.throws(() => parseBenchmarkDataset(duplicate), /Duplicate/)
  const leak = syntheticQualityDataset(); leak.samples[11].sourceGroup = leak.samples[0].sourceGroup
  assert.throws(() => parseBenchmarkDataset(leak), /leaks/)
  const bad = syntheticQualityDataset(); bad.samples[0].provenance = ''
  assert.throws(() => parseBenchmarkDataset(bad), /provenance/)
  bad.samples[0].provenance = 'test'; bad.samples[0].frame.quality.personHistogram[0] = -1
  assert.throws(() => parseBenchmarkDataset(bad), /histogram/)
  assert.throws(() => benchmarkQuality(syntheticQualityDataset(), { ...QUALITY_CONFIG, minSharpness: NaN }), /minSharpness/)
  assert.throws(() => parseBenchmarkDataset({ ...syntheticQualityDataset(), metricVersion: 'unknown' }), /version/)
})

test('candidate config is reported in full and never mutates production defaults', () => {
  const original = { ...QUALITY_CONFIG }, candidate = { ...original, version: 'candidate-v1', minPersonLuma: 200 }
  const report = benchmarkQuality(syntheticQualityDataset(), candidate)
  assert.equal(report.config.version, 'candidate-v1')
  assert.equal(report.results[0].synthetic.goodWarned, 1)
  assert.deepEqual(QUALITY_CONFIG, original)
})
