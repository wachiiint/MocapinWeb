import type { InferenceSession, Tensor } from 'onnxruntime-web/wasm'
import type { ModelRuntime, Provider } from './halpe26.ts'

type Session = Pick<InferenceSession, 'inputNames' | 'run' | 'release'>
export type SessionFactory = (provider: Provider) => Promise<Session>
export type OutputComparison = (gpu: InferenceSession.ReturnType, wasm: InferenceSession.ReturnType) => 'match' | 'mismatch' | 'inconclusive'
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
  let session: Session | undefined, reference: Session | undefined, closed = false
  try {
    session = await create(preferred)
  } catch (error) {
    if (preferred === 'wasm') throw new Error(`${name} WASM initialization failed: ${errorText(error)}`)
    info.provider = 'wasm'; info.revision++
    info.fallbackReason = `WebGPU initialization failed: ${errorText(error)}`
    try { session = await create('wasm') }
    catch (cause) { throw new Error(`${name} WASM fallback initialization failed: ${errorText(cause)}`) }
  }
  if (info.provider === 'webgpu') info.verification = 'pending'
  async function releaseActive() {
    const current = session; session = undefined
    await current?.release()
  }
  async function fallback(reason: string) {
    info.provider = 'wasm'; info.revision++; info.fallbackReason = reason
    delete info.verification
    await releaseActive().catch(() => undefined)
    session = reference ?? await create('wasm'); reference = undefined
  }

  return {
    get info(): ModelRuntime { return { ...info } },
    async run(input: Tensor, compare?: OutputComparison) {
      if (closed || !session) throw new Error(`${name} session is unavailable.`)
      let output: InferenceSession.ReturnType
      try {
        output = await session.run({ [session.inputNames[0]]: input })
      } catch (error) {
        if (info.provider === 'wasm') throw new Error(`${name} WASM inference failed: ${errorText(error)}`)
        try {
          await fallback(`WebGPU inference failed: ${errorText(error)}`)
          return await session!.run({ [session!.inputNames[0]]: input })
        } catch (cause) {
          throw new Error(`${name} WASM fallback failed: ${errorText(cause)}`)
        }
      }
      if (info.provider !== 'webgpu' || info.verification === 'passed' || !compare) return output
      let expected: InferenceSession.ReturnType
      try {
        reference ??= await create('wasm')
        expected = await reference.run({ [reference.inputNames[0]]: input })
      } catch (cause) {
        throw new Error(`${name} WASM verification failed: ${errorText(cause)}`)
      }
      const verdict = compare(output, expected)
      if (verdict === 'mismatch') {
        await fallback('WebGPU output verification differed from WASM on the same frame; using WASM.')
        return expected
      }
      if (verdict === 'match') {
        info.verification = 'passed'
        const checked = reference; reference = undefined
        await checked.release()
        return output
      }
      // Both detectors seeing an empty scene is not evidence that WebGPU can detect people.
      // Keep the reference session until a positive frame verifies it; do not guess or blacklist devices.
      return expected
    },
    async release() {
      if (closed) return
      closed = true
      const pending = reference; reference = undefined
      await Promise.all([releaseActive(), pending?.release()])
    },
  }
}
