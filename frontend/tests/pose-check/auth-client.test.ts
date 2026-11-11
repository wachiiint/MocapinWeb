import test from 'node:test'
import assert from 'node:assert/strict'
import { authRequest, AuthError } from '../../src/lib/auth.ts'

test('auth client uses same-origin cookies and preserves exact passwords without returning tokens', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/api/auth/login')
      assert.equal(init?.credentials, 'same-origin')
      assert.equal(init?.cache, 'no-store')
      assert.equal(init?.method, 'POST')
      assert.equal(init?.body, JSON.stringify({ username: 'tester', password: ' password with spaces ' }))
      return Response.json({ user: { id: '1', username: 'tester' }, expiresAt: '2026-12-01T00:00:00Z' })
    }
    assert.equal((await authRequest('login', { username: 'tester', password: ' password with spaces ' }))?.user.id, '1')
  } finally { globalThis.fetch = original }
})

test('auth distinguishes an expired session, rate limit and network failure; logout accepts an empty body', async () => {
  const original = globalThis.fetch
  try {
    for (const status of [401, 403, 429, 503]) {
      globalThis.fetch = async () => new Response(null, { status })
      await assert.rejects(authRequest('me'), (error: unknown) => error instanceof AuthError && error.status === status)
    }
    globalThis.fetch = async () => { throw new TypeError('offline') }
    await assert.rejects(authRequest('me'), (error: unknown) => error instanceof TypeError && !(error instanceof AuthError))
    globalThis.fetch = async (_url, init) => {
      assert.equal(init?.method, 'POST')
      return new Response(null, { status: 204 })
    }
    assert.equal(await authRequest('logout'), null)
  } finally { globalThis.fetch = original }
})
