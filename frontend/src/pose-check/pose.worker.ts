import { loadPoseRuntime } from './pose-runtime'
import type { WorkerRequest, WorkerReply } from './halpe26'
import { measurePixelQuality } from './quality-pixels'
import { QUALITY_CONFIG } from './quality-config'

let runtime: Awaited<ReturnType<typeof loadPoseRuntime>> | undefined
let busy = false
const canvas = new OffscreenCanvas(1, 1)
const context = canvas.getContext('2d', { willReadFrequently: true })

function reply(message: WorkerReply) { self.postMessage(message) }
async function modelBytes(url: string) {
  const response = await fetch(url)
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Default model files are missing. Run npm run prepare:models and retry.')
  }
  return new Uint8Array(await response.arrayBuffer())
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'frame' && busy) { message.bitmap.close(); return }
  busy = true
  try {
    if (message.type === 'init') {
      const detector = await modelBytes(message.detectorUrl)
      const pose = await modelBytes(message.poseUrl)
      runtime = await loadPoseRuntime(detector, pose, message.runtimeMode,
        (reason) => reply({ type: 'recover', reason }))
      reply({ type: 'ready', runtime: runtime.info })
    } else {
      if (!runtime || !context) throw new Error('Pose runtime is not ready.')
      const started = performance.now()
      canvas.width = message.bitmap.width
      canvas.height = message.bitmap.height
      context.drawImage(message.bitmap, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      const readPixelsMs = performance.now() - started
      const result = await runtime.infer(pixels)
      result.timings.readPixelsMs = readPixelsMs
      const quality = measurePixelQuality(pixels, result.people)
      result.timings.totalWorkerMs = performance.now() - started
      reply({ type: 'result', frame: { ...result, quality, configVersion: QUALITY_CONFIG.version,
        capturedAt: message.capturedAt, generation: message.generation } })
    }
  } catch (error) {
    reply({ type: 'error', message: error instanceof Error ? error.message : 'Pose processing failed.' })
  } finally {
    if (message.type === 'frame') message.bitmap.close()
    busy = false
  }
}
