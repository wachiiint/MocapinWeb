import type { InferenceSession, Tensor } from 'onnxruntime-web/wasm'
import type { ModelRuntime, Provider } from './halpe26.ts'

type Session = Pick<InferenceSession, 'inputNames' | 'run' | 'release'>
export type SessionFactory = (provider: Provider) => Promise<Session>
export type GpuAccess = { requestAdapter(): Promise<unknown | null> }

export async function checkWebGpu(gpu?: GpuAccess) {
  if (!gpu) return { available: false, reason: 'WebGPU is unavailable in this worker.' }
  try {
    return await gpu.requestAdapter()
      ? { available: true }
      : { available: false, reason: 'No WebGPU adapter is available.' }
  } catch (error) {
    return { available: false, reason: `WebGPU adapter request failed: ${errorText(error)}` }
  }
}

function errorText(error: unknown) { return error instanceof Error ? error.message : String(error) }

export function watchGpuLoss(deviceOrPromise: unknown, onLost: (reason: string) => void) {
  let active = true
  const notify = (reason: string) => { if (active) { active = false; onLost(reason) } }
  void Promise.resolve(deviceOrPromise).then(async (device: unknown) => {
    if (!device || typeof device !== 'object' || !('lost' in device)) throw new Error('WebGPU device unavailable.')
    const loss: unknown = await device.lost
    notify(loss && typeof loss === 'object' && 'message' in loss && typeof loss.message === 'string' && loss.message
      ? loss.message : 'WebGPU device lost.')
  }).catch((error: unknown) => notify(errorText(error)))
  return () => { active = false }
}

// Shared by the two real model sessions; provider fallback is attempted only once.
export async function openModelSession(
  name: string, create: SessionFactory, preferred: Provider, initialReason?: string,
) {
  const info: ModelRuntime = { provider: preferred, revision: 0, fallbackReason: initialReason }
  let session: Session
  try {
    session = await create(preferred)
  } catch (error) {
    if (preferred === 'wasm') throw new Error(`${name} WASM initialization failed: ${errorText(error)}`)
    info.provider = 'wasm'; info.revision++
    info.fallbackReason = `WebGPU initialization failed: ${errorText(error)}`
    try { session = await create('wasm') }
    catch (cause) { throw new Error(`${name} WASM fallback initialization failed: ${errorText(cause)}`) }
  }

  return {
    get info(): ModelRuntime { return { ...info } },
    async run(input: Tensor) {
      try {
        return await session.run({ [session.inputNames[0]]: input })
      } catch (error) {
        if (info.provider === 'wasm') throw new Error(`${name} WASM inference failed: ${errorText(error)}`)
        info.provider = 'wasm'; info.revision++
        info.fallbackReason = `WebGPU inference failed: ${errorText(error)}`
        await session.release().catch(() => undefined)
        try {
          session = await create('wasm')
          return await session.run({ [session.inputNames[0]]: input })
        } catch (cause) {
          throw new Error(`${name} WASM fallback failed: ${errorText(cause)}`)
        }
      }
    },
    async release() { await session.release() },
  }
}
