// Bump this version whenever either default model's weights change.
export const MODEL_CACHE = 'mocapcare-pose-models-v1'
type ModelCache = Pick<Cache, 'match' | 'put'>
type ModelStorage = { open(name: string): Promise<ModelCache> }

async function openCache(storage: ModelStorage | undefined): Promise<ModelCache | undefined> {
  try { return await storage?.open(MODEL_CACHE) }
  catch { return undefined }
}

function validResponse(response: Response | undefined): response is Response {
  return !!response?.ok && !response.headers.get('content-type')?.includes('text/html')
}

export async function hasCachedModels(urls: string[], storage: ModelStorage | undefined = globalThis.caches) {
  const cache = await openCache(storage)
  if (!cache) return false
  try { return (await Promise.all(urls.map((url) => cache.match(url)))).every(validResponse) }
  catch { return false }
}

export async function modelBytes(
  url: string, storage: ModelStorage | undefined = globalThis.caches, download: typeof fetch = fetch,
) {
  const cache = await openCache(storage)
  let cached: Response | undefined
  try { cached = await cache?.match(url) } catch { /* Storage may be unavailable. */ }
  if (validResponse(cached)) return new Uint8Array(await cached.arrayBuffer())
  const response = await download(url)
  if (!validResponse(response)) {
    throw new Error('Default model files are missing. Run npm run prepare:models and retry.')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length) throw new Error('Downloaded model file is empty. Retry the download.')
  try { await cache?.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })) }
  catch { /* A full or disabled cache must not prevent this session from running. */ }
  return bytes
}
