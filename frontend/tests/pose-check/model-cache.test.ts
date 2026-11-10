import test from 'node:test'
import assert from 'node:assert/strict'
import { hasCachedModels, modelBytes, MODEL_CACHE } from '../../src/pose-check/model-cache.ts'

const urls = ['https://example.test/detector.onnx', 'https://example.test/pose.onnx']
function storageFixture() {
  const entries = new Map<string, Response>()
  const names: string[] = []
  const storage = { async open(name: string) {
    names.push(name)
    return {
      async match(request: RequestInfo | URL) { return entries.get(String(request))?.clone() },
      async put(request: RequestInfo | URL, response: Response) { entries.set(String(request), response.clone()) },
    }
  } }
  return { entries, names, storage }
}

test('first download stores both models; subsequent page checks and loads need no network', async () => {
  const { names, storage } = storageFixture()
  let requests = 0
  const download: typeof fetch = async () => { requests++; return new Response(new Uint8Array([1, 2, 3])) }
  assert.equal(await hasCachedModels(urls, storage), false)
  for (const url of urls) await modelBytes(url, storage, download)
  assert.equal(await hasCachedModels(urls, storage), true)
  for (const url of urls) assert.deepEqual(await modelBytes(url, storage, download), new Uint8Array([1, 2, 3]))
  assert.equal(requests, 2)
  assert.ok(names.every((name) => name === MODEL_CACHE))
})

test('an interrupted download reuses the existing model and downloads only the missing model', async () => {
  const { entries, storage } = storageFixture()
  entries.set(urls[0], new Response(new Uint8Array([1])))
  assert.equal(await hasCachedModels(urls, storage), false)
  const requests: string[] = []
  const download: typeof fetch = async (url) => { requests.push(String(url)); return new Response(new Uint8Array([2])) }
  for (const url of urls) await modelBytes(url, storage, download)
  assert.deepEqual(requests, [urls[1]])
  assert.equal(await hasCachedModels(urls, storage), true)
})

test('HTML fallbacks, failed responses and empty files are never stored as models', async () => {
  const { entries, storage } = storageFixture()
  entries.set(urls[0], new Response('<html></html>', { headers: { 'content-type': 'text/html' } }))
  assert.equal(await hasCachedModels([urls[0]], storage), false)
  entries.clear()
  for (const response of [new Response('', { status: 404 }),
    new Response('<html></html>', { headers: { 'content-type': 'text/html' } }), new Response('')]) {
    await assert.rejects(modelBytes(urls[0], storage, async () => response))
    assert.equal(entries.size, 0)
  }
})

test('unavailable storage and quota failures still allow inference for the current session', async () => {
  const unavailable = { async open(): Promise<Cache> { throw new Error('Storage denied') } }
  const full = { async open() { return {
    async match() { return undefined },
    async put() { throw new Error('Quota exceeded') },
  } } }
  for (const storage of [unavailable, full]) {
    assert.equal(await hasCachedModels(urls, storage), false)
    assert.deepEqual(await modelBytes(urls[0], storage, async () => new Response(new Uint8Array([1]))), new Uint8Array([1]))
  }
})
