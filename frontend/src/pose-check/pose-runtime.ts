import type { InferenceSession } from 'onnxruntime-web/wasm'
import { decodePeople, decodeSimCC, detectorInput, poseInput } from './image-processing.ts'
import { POSE_CONFIG, type Pixels, type RuntimeInfo, type RuntimeMode, type StageTimings } from './halpe26.ts'
import { checkWebGpu, openModelSession, watchGpuLoss, type GpuAccess } from './runtime-backend.ts'

export async function loadPoseRuntime(
  detectorBytes: Uint8Array, poseBytes: Uint8Array, mode: RuntimeMode,
  onDeviceLost: (reason: string) => void,
) {
  const navigatorGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
    ? navigator.gpu as GpuAccess : undefined
  let capability: { available: boolean; reason?: string } = mode === 'auto' ? await checkWebGpu(navigatorGpu) : { available: false }
  let ort: typeof import('onnxruntime-web/wasm')
  try {
    ort = capability.available ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web/wasm')
  } catch (error) {
    if (!capability.available) throw error
    capability = { available: false, reason: `WebGPU runtime could not load: ${String(error)}` }
    ort = await import('onnxruntime-web/wasm')
  }
  ort.env.wasm.numThreads = 1
  const preferred = capability.available ? 'webgpu' : 'wasm'
  const create = (bytes: Uint8Array) => (provider: 'webgpu' | 'wasm') =>
    ort.InferenceSession.create(bytes, { executionProviders: provider === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'] })
  const detector = await openModelSession('Detector', create(detectorBytes), preferred, capability.reason)
  let cancelWatch = () => {}
  let watching = false
  const watchDevice = () => {
    if (!capability.available || watching) return
    watching = true
    // ORT versions may expose a device directly or through a Promise.
    cancelWatch = watchGpuLoss(Promise.resolve().then(() => ort.env.webgpu.device), onDeviceLost)
  }
  if (detector.info.provider === 'webgpu') watchDevice()
  const pose = await openModelSession('Pose', create(poseBytes), preferred, capability.reason).catch(async (error: unknown) => {
    cancelWatch()
    await detector.release().catch(() => undefined)
    throw error
  })
  if (pose.info.provider === 'webgpu') watchDevice()
  try {
    const detection = await detector.run(new ort.Tensor('float32', new Float32Array(3 * 320 * 320), [1, 3, 320, 320]))
    validateDetector(detection)
    const output = await pose.run(new ort.Tensor('float32', new Float32Array(3 * 256 * 192), [1, 3, 256, 192]))
    validatePose(output)
  } catch (error) {
    cancelWatch()
    await detector.release().catch(() => undefined)
    await pose.release().catch(() => undefined)
    throw error
  }
  const info = (): RuntimeInfo => ({
    detector: detector.info, pose: pose.info, revision: detector.info.revision + pose.info.revision,
  })
  return {
    get info() { return info() },
    async infer(image: Pixels) {
      const start = performance.now()
      const timings: StageTimings = { readPixelsMs: 0, detectorPreMs: 0, detectorRunMs: 0,
        detectorDecodeMs: 0, posePreMs: 0, poseRunMs: 0, poseDecodeMs: 0, totalWorkerMs: 0 }
      let mark = performance.now()
      const detInput = detectorInput(image)
      timings.detectorPreMs = performance.now() - mark; mark = performance.now()
      const detection = await detector.run(new ort.Tensor('float32', detInput.data, [1, 3, 320, 320]))
      timings.detectorRunMs = performance.now() - mark; mark = performance.now()
      validateDetector(detection)
      const people = decodePeople(detection.dets.data as Float32Array,
        detection.labels.data as BigInt64Array, detInput.scaleX, detInput.scaleY,
        image.width, image.height, POSE_CONFIG.detectorScore)
      timings.detectorDecodeMs = performance.now() - mark
      let keypoints = [] as ReturnType<typeof decodeSimCC>
      if (people.length) {
        mark = performance.now()
        const input = poseInput(image, people[0])
        timings.posePreMs = performance.now() - mark; mark = performance.now()
        const output = await pose.run(new ort.Tensor('float32', input.data, [1, 3, 256, 192]))
        timings.poseRunMs = performance.now() - mark; mark = performance.now()
        validatePose(output)
        keypoints = decodeSimCC(output.simcc_x.data as Float32Array, output.simcc_y.data as Float32Array, input.crop)
        timings.poseDecodeMs = performance.now() - mark
      }
      return { width: image.width, height: image.height, people, keypoints,
        inferenceMs: performance.now() - start, runtime: info(), timings }
    },
    async release() { cancelWatch(); await pose.release(); await detector.release() },
  }
}

function validateDetector(output: InferenceSession.ReturnType) {
  if (output.dets?.dims.at(-1) !== 5 || output.dets.type !== 'float32' || output.labels?.type !== 'int64') {
    throw new Error('Unexpected RTMDet outputs. Check the default model files.')
  }
}
function validatePose(output: InferenceSession.ReturnType) {
  if (output.simcc_x?.dims.join() !== '1,26,384' || output.simcc_y?.dims.join() !== '1,26,512' ||
    output.simcc_x.type !== 'float32' || output.simcc_y.type !== 'float32') {
    throw new Error('Expected RTMPose HALPE26 outputs. Check the default pose model.')
  }
}
