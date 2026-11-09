import { readFileSync } from 'node:fs'
import { benchmarkQuality } from './src/pose-check/quality-benchmark.ts'
import { syntheticQualityDataset } from './src/pose-check/quality-benchmark.fixture.ts'
import { QUALITY_CONFIG } from './src/pose-check/quality-config.ts'

try {
  const [, , datasetPath, configPath, ...extra] = process.argv
  if (!datasetPath || extra.length) throw new Error('Usage: node quality-benchmark.ts <dataset.json|--synthetic> [candidate-config.json]')
  const dataset = datasetPath === '--synthetic' ? syntheticQualityDataset() : JSON.parse(readFileSync(datasetPath, 'utf8').replace(/^\uFEFF/, ''))
  const config = configPath ? JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')) : QUALITY_CONFIG
  process.stdout.write(`${JSON.stringify(benchmarkQuality(dataset, config), null, 2)}\n`)
} catch (cause) {
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`)
  process.exitCode = 1
}
