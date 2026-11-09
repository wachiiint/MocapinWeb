import type { InferenceSession } from 'onnxruntime-web/wasm'
import { decodePeople, decodeSimCC } from './image-processing.ts'
import { POSE_CONFIG } from './halpe26.ts'
import type { OutputComparison } from './runtime-backend.ts'

// Engineering parity tolerances in model-input pixels/raw scores, not clinical or accuracy criteria.
export const OUTPUT_VERIFICATION = {
  version: 'runtime-parity-v1', detectorPixelTolerance: 1, detectorScoreTolerance: 0.01,
  posePixelTolerance: 0.5, poseScoreTolerance: 0.001,
}

export function validateDetector(output: InferenceSession.ReturnType) {
  if (output.dets?.dims.at(-1) !== 5 || output.dets.type !== 'float32' || output.labels?.type !== 'int64') {
    throw new Error('Unexpected RTMDet outputs. Check the default model files.')
  }
}
export function validatePose(output: InferenceSession.ReturnType) {
  if (output.simcc_x?.dims.join() !== '1,26,384' || output.simcc_y?.dims.join() !== '1,26,512' ||
    output.simcc_x.type !== 'float32' || output.simcc_y.type !== 'float32') {
    throw new Error('Expected RTMPose HALPE26 outputs. Check the default pose model.')
  }
}

export const compareDetectorOutput: OutputComparison = (gpu, wasm) => {
  validateDetector(gpu); validateDetector(wasm)
  if (!(wasm.dets.data as Float32Array).every(Number.isFinite)) throw new Error('WASM verification returned non-finite detector values.')
  if (!(gpu.dets.data as Float32Array).every(Number.isFinite)) return 'mismatch'
  const people = (output: InferenceSession.ReturnType) => decodePeople(output.dets.data as Float32Array,
    output.labels.data as BigInt64Array, 1, 1, 320, 320, POSE_CONFIG.detectorScore)
  const actual = people(gpu), expected = people(wasm)
  if (actual.length !== expected.length) return 'mismatch'
  if (!expected.length) return 'inconclusive'
  const used = new Set<number>()
  for (const box of actual) {
    const index = expected.findIndex((ref, i) => !used.has(i) &&
      Math.max(Math.abs(box.x1 - ref.x1), Math.abs(box.y1 - ref.y1), Math.abs(box.x2 - ref.x2), Math.abs(box.y2 - ref.y2)) <= OUTPUT_VERIFICATION.detectorPixelTolerance &&
      Math.abs(box.score - ref.score) <= OUTPUT_VERIFICATION.detectorScoreTolerance)
    if (index < 0) return 'mismatch'
    used.add(index)
  }
  return 'match'
}

export const comparePoseOutput: OutputComparison = (gpu, wasm) => {
  validatePose(gpu); validatePose(wasm)
  const decode = (output: InferenceSession.ReturnType) => decodeSimCC(output.simcc_x.data as Float32Array,
    output.simcc_y.data as Float32Array, { left: 0, top: 0, width: 192, height: 256 })
  const finite = (output: InferenceSession.ReturnType) => (output.simcc_x.data as Float32Array).every(Number.isFinite) &&
    (output.simcc_y.data as Float32Array).every(Number.isFinite)
  if (!finite(wasm)) {
    throw new Error('WASM verification returned non-finite pose values.')
  }
  if (!finite(gpu)) return 'mismatch'
  const actual = decode(gpu), expected = decode(wasm)
  if (actual.some((point, i) => Math.max(Math.abs(point.x - expected[i].x), Math.abs(point.y - expected[i].y)) > OUTPUT_VERIFICATION.posePixelTolerance ||
    Math.abs(point.score - expected[i].score) > OUTPUT_VERIFICATION.poseScoreTolerance)) return 'mismatch'
  return expected.some((point) => point.score > 0) ? 'match' : 'inconclusive'
}
