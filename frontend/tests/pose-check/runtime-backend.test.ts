import test from 'node:test'
import assert from 'node:assert/strict'
import { Tensor, type InferenceSession } from 'onnxruntime-web/wasm'
import { checkWebGpu, openModelSession, watchGpuLoss, type SessionFactory } from '../../src/pose-check/runtime-backend.ts'
import type { Provider } from '../../src/pose-check/halpe26.ts'
import { compareDetectorOutput } from '../../src/pose-check/runtime-output.ts'

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

test('silent GPU no-person result falls back when WASM detects a person on the same input', async () => {
  const labels = new Tensor('int64', new BigInt64Array([0n]), [1, 1])
  const gpuOutput = { dets: new Tensor('float32', new Float32Array([0, 0, 0, 0, 0]), [1, 1, 5]), labels }
  const wasmOutput = { dets: new Tensor('float32', new Float32Array([10, 20, 100, 200, 0.9]), [1, 1, 5]), labels }
  const gpu = fakeSession(async () => gpuOutput), wasm = fakeSession(async () => wasmOutput)
  const model = await openModelSession('Detector', async (provider) => provider === 'webgpu' ? gpu.session : wasm.session, 'webgpu')
  try {
    const result = await model.run(input, compareDetectorOutput)
    assert.equal(result, wasmOutput, 'A successful GPU call with incorrect output must not remain trusted.')
    assert.equal(model.info.provider, 'wasm')
    assert.match(model.info.fallbackReason ?? '', /verification/)
    assert.equal(gpu.releases, 1)
    assert.equal(model.info.revision, 1)
    assert.equal(await model.run(input, compareDetectorOutput), wasmOutput)
    assert.equal(gpu.runs, 1)
  } finally { await model.release() }
})

test('matching positive output verifies once and frees the temporary WASM reference', async () => {
  const gpu = fakeSession(), wasm = fakeSession(), calls: Provider[] = []
  const model = await openModelSession('Pose', async (provider) => {
    calls.push(provider); return provider === 'webgpu' ? gpu.session : wasm.session
  }, 'webgpu')
  assert.equal(model.info.verification, 'pending')
  await model.run(input, () => 'match'); await model.run(input, () => { throw new Error('Should not recheck a verified session') })
  assert.equal(model.info.verification, 'passed'); assert.equal(model.info.provider, 'webgpu')
  assert.equal(gpu.runs, 2); assert.equal(wasm.runs, 1); assert.equal(wasm.releases, 1)
  assert.deepEqual(calls, ['webgpu', 'wasm'])
  await model.release(); assert.equal(gpu.releases, 1); assert.equal(wasm.releases, 1)
})

test('an empty scene stays unverified and reuses one reference until positive output agrees', async () => {
  const gpu = fakeSession(), wasm = fakeSession(), calls: Provider[] = []
  const model = await openModelSession('Detector', async (provider) => {
    calls.push(provider); return provider === 'webgpu' ? gpu.session : wasm.session
  }, 'webgpu')
  await model.run(input, () => 'inconclusive'); await model.run(input, () => 'inconclusive')
  assert.equal(model.info.verification, 'pending'); assert.equal(model.info.provider, 'webgpu')
  assert.equal(model.info.fallbackReason, undefined); assert.equal(wasm.releases, 0)
  await model.run(input, () => 'match')
  assert.equal(model.info.verification, 'passed'); assert.equal(wasm.releases, 1)
  assert.deepEqual(calls, ['webgpu', 'wasm'])
  await model.release()
})

test('a GPU exception adopts an existing reference without extra sessions or retries', async () => {
  let throwGpu = false
  const gpu = fakeSession(async () => { if (throwGpu) throw new Error('GPU failed'); return {} }), wasm = fakeSession()
  const calls: Provider[] = []
  const model = await openModelSession('Detector', async (provider) => {
    calls.push(provider); return provider === 'webgpu' ? gpu.session : wasm.session
  }, 'webgpu')
  await model.run(input, () => 'inconclusive'); throwGpu = true
  await model.run(input, () => 'match'); await model.run(input, () => 'match')
  assert.deepEqual(calls, ['webgpu', 'wasm']); assert.equal(model.info.provider, 'wasm')
  assert.equal(model.info.verification, undefined); assert.equal(gpu.releases, 1)
  await model.release(); assert.equal(wasm.releases, 1)
})

test('verification errors do not silently accept GPU output and release both sessions', async () => {
  const gpu = fakeSession(), wasm = fakeSession(async () => { throw new Error('CPU reference failed') })
  const model = await openModelSession('Pose', async (provider) => provider === 'webgpu' ? gpu.session : wasm.session, 'webgpu')
  await assert.rejects(model.run(input, () => 'match'), /WASM verification failed/)
  assert.equal(model.info.verification, 'pending')
  await model.release(); await model.release()
  assert.equal(gpu.releases, 1); assert.equal(wasm.releases, 1)
  await assert.rejects(model.run(input), /unavailable/)
})

test('direct WASM has no verification overhead and pending references are freed on close', async () => {
  const wasm = fakeSession()
  const direct = await openModelSession('Pose', async () => wasm.session, 'wasm')
  await direct.run(input, () => { throw new Error('WASM must not compare with itself') })
  assert.equal(wasm.runs, 1); assert.equal(direct.info.verification, undefined)
  await direct.release()
  const gpu = fakeSession(), reference = fakeSession()
  const pending = await openModelSession('Pose', async (provider) => provider === 'webgpu' ? gpu.session : reference.session, 'webgpu')
  await pending.run(input, () => 'inconclusive'); await pending.release()
  assert.equal(gpu.releases, 1); assert.equal(reference.releases, 1)
})

test('failure to create a WASM reference remains an explicit error instead of trusting GPU', async () => {
  const gpu = fakeSession(), calls: Provider[] = []
  const model = await openModelSession('Detector', async (provider) => {
    calls.push(provider)
    if (provider === 'wasm') throw new Error('Reference allocation failed')
    return gpu.session
  }, 'webgpu')
  await assert.rejects(model.run(input, () => 'match'), /WASM verification failed: Reference allocation failed/)
  assert.deepEqual(calls, ['webgpu', 'wasm'])
  assert.equal(model.info.verification, 'pending')
  await model.release(); assert.equal(gpu.releases, 1)
})
