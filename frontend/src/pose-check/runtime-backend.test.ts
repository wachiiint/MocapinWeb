import test from 'node:test'
import assert from 'node:assert/strict'
import { Tensor, type InferenceSession } from 'onnxruntime-web/wasm'
import { checkWebGpu, openModelSession, watchGpuLoss, type SessionFactory } from './runtime-backend.ts'
import type { Provider } from './halpe26.ts'

const input = new Tensor('float32', new Float32Array([0]), [1])

test('device-loss observation accepts both a direct GPUDevice and a promised device', async () => {
  for (const promised of [false, true]) {
    const device = { lost: Promise.resolve({ message: 'GPU reset' }) }
    const reasons: string[] = []
    watchGpuLoss(promised ? Promise.resolve(device) : device, (reason) => reasons.push(reason))
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(reasons, ['GPU reset'])
  }
})

test('released device watchers do not trigger recovery; rejected devices notify once', async () => {
  const reasons: string[] = []
  const cancel = watchGpuLoss({ lost: Promise.resolve({ message: 'released' }) }, (reason) => reasons.push(reason))
  cancel()
  watchGpuLoss(Promise.reject(new Error('device unavailable')), (reason) => reasons.push(reason))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(reasons, ['device unavailable'])
})

test('a device loss without a message still has a readable fallback reason', async () => {
  const reasons: string[] = []
  watchGpuLoss({ lost: Promise.resolve({ message: '' }) }, (reason) => reasons.push(reason))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(reasons, ['WebGPU device lost.'])
})
function fakeSession(onRun: () => Promise<InferenceSession.ReturnType> = async () => ({})) {
  let runs = 0, releases = 0
  return {
    session: { inputNames: ['input'], run: async () => { runs++; return onRun() }, release: async () => { releases++ } },
    get runs() { return runs }, get releases() { return releases },
  }
}

test('capability uses an actual adapter request; missing, null, and rejected adapters fall back', async () => {
  assert.equal((await checkWebGpu()).available, false)
  assert.equal((await checkWebGpu({ requestAdapter: async () => null })).available, false)
  assert.match((await checkWebGpu({ requestAdapter: async () => { throw new Error('blocked') } })).reason ?? '', /blocked/)
  assert.equal((await checkWebGpu({ requestAdapter: async () => ({}) })).available, true)
})

test('GPU creation failure retries WASM once and preserves the fallback reason', async () => {
  const calls: Provider[] = [], wasm = fakeSession()
  const create: SessionFactory = async (provider) => {
    calls.push(provider)
    if (provider === 'webgpu') throw new Error('unsupported operator')
    return wasm.session
  }
  const model = await openModelSession('Detector', create, 'webgpu')
  await model.run(input)
  assert.deepEqual(calls, ['webgpu', 'wasm'])
  assert.equal(model.info.provider, 'wasm')
  assert.match(model.info.fallbackReason ?? '', /unsupported operator/)
  assert.equal(model.info.revision, 1)
  await model.release(); assert.equal(wasm.releases, 1)
})

test('GPU inference failure releases its session and reruns once on WASM; subsequent runs stay on WASM', async () => {
  const calls: Provider[] = []
  const gpu = fakeSession(async () => { throw new Error('GPU execution failed') }), wasm = fakeSession()
  const model = await openModelSession('Pose', async (provider) => {
    calls.push(provider); return provider === 'webgpu' ? gpu.session : wasm.session
  }, 'webgpu')
  await model.run(input); await model.run(input)
  assert.deepEqual(calls, ['webgpu', 'wasm'])
  assert.equal(gpu.releases, 1); assert.equal(gpu.runs, 1); assert.equal(wasm.runs, 2)
  assert.equal(model.info.revision, 1)
  assert.match(model.info.fallbackReason ?? '', /GPU execution failed/)
})

test('a detector fallback does not change the pose provider', async () => {
  const detector = await openModelSession('Detector', async (provider) => {
    if (provider === 'webgpu') throw new Error('detector unsupported')
    return fakeSession().session
  }, 'webgpu')
  const pose = await openModelSession('Pose', async () => fakeSession().session, 'webgpu')
  await pose.run(input)
  assert.equal(detector.info.provider, 'wasm'); assert.equal(pose.info.provider, 'webgpu')
})

test('WASM errors are surfaced and never retried in a loop', async () => {
  let creates = 0
  await assert.rejects(openModelSession('Pose', async () => { creates++; throw new Error('bad model') }, 'wasm'), /WASM initialization failed: bad model/)
  assert.equal(creates, 1)
  const wasm = fakeSession(async () => { throw new Error('invalid feed') })
  const model = await openModelSession('Pose', async () => wasm.session, 'wasm')
  await assert.rejects(model.run(input), /WASM inference failed: invalid feed/)
  assert.equal(wasm.runs, 1)
})

test('failed WASM recovery ends the attempt after one GPU and one WASM session', async () => {
  const calls: Provider[] = []
  const gpu = fakeSession(async () => { throw new Error('GPU failure') })
  const model = await openModelSession('Pose', async (provider) => {
    calls.push(provider)
    if (provider === 'wasm') throw new Error('WASM failure')
    return gpu.session
  }, 'webgpu')
  await assert.rejects(model.run(input), /WASM fallback failed: WASM failure/)
  assert.deepEqual(calls, ['webgpu', 'wasm'])
})
