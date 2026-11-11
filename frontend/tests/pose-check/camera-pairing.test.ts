import test from 'node:test'
import assert from 'node:assert/strict'
import { cameraPairing } from '../../src/lib/camera-pairing.ts'
import { parseCameraEvent, readCameraLease } from '../../src/lib/camera-protocol.ts'
import type { PairingState } from '../../src/lib/camera-protocol.ts'

const roomId = 'a'.repeat(32), memberId = 'b'.repeat(32)
const room = (seq: number) => ({ id: roomId, seq, members: [{ role: 'primary', connected: true, ready: false }] })
class Socket {
  readyState: WebSocket['readyState'] = 1
  sent: Record<string, string>[] = []
  target = new EventTarget()
  addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    this.target.addEventListener(type, listener, options)
  }) as WebSocket['addEventListener']
  send(value: unknown) { assert.equal(typeof value, 'string'); this.sent.push(JSON.parse(String(value))) }
  close() { this.readyState = 3; this.target.dispatchEvent(new Event('close')) }
  receive(value: unknown) { this.target.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })) }
}

function setup(initial: string | null = null, readReady?: () => boolean) {
  const values = new Map<string, string>()
  if (initial) values.set('account-1', initial)
  const sockets: Socket[] = [], changes: PairingState[] = []
  const client = cameraPairing({
    url: 'wss://camera.example/api/camera/ws', storageKey: 'account-1',
    storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: (key) => { values.delete(key) } },
    onChange: (state) => changes.push(state),
    readReady,
    socket: (url) => { assert.equal(url, 'wss://camera.example/api/camera/ws'); const socket = new Socket(); sockets.push(socket); return socket },
  })
  return { client, sockets, values, state: () => changes.at(-1)! }
}

test('pairing keeps newer broadcasts, persists only its own membership and clears a closed room', (t) => {
  const rig = setup(); t.after(rig.client.dispose)
  const socket = rig.sockets[0]
  socket.receive({ type: 'connected' }); rig.client.create()
  const create = socket.sent.at(-1)!
  assert.match(create.memberId, /^[a-f0-9]{32}$/)
  assert.equal(rig.state().pending, true)
  socket.receive({ type: 'state', room: room(3) })
  socket.receive({ type: 'membership', requestId: create.requestId, memberId: create.memberId, role: 'primary', code: '001234', codeExpiresAt: '2026-12-01T00:10:00Z', room: room(2) })
  assert.equal(rig.state().room?.seq, 3)
  assert.equal(rig.state().lease?.code, '001234')
  assert.equal(rig.state().pending, false)
  assert.equal(JSON.parse(rig.values.get('account-1')!).memberId, create.memberId)
  socket.receive({ type: 'state', room: room(1) })
  assert.equal(rig.state().room?.seq, 3)
  rig.client.leave()
  socket.receive({ type: 'room_closed', roomId, seq: 4 })
  assert.equal(rig.state().lease, null)
  assert.equal(rig.state().error, '')
  socket.receive({ type: 'state', room: room(3) })
  assert.equal(rig.state().room, null)
  assert.equal(rig.values.size, 0)
})

test('a lost create reply reconnects automatically with the same private member identity and ignores old socket events', async (t) => {
  const rig = setup(); t.after(rig.client.dispose)
  const first = rig.sockets[0]
  first.receive({ type: 'connected' }); rig.client.create()
  const original = first.sent.at(-1)!
  assert.equal(readCameraLease(rig.values.get('account-1')!)?.memberId, original.memberId)
  first.close()
  await new Promise((resolve) => setTimeout(resolve, 1100))
  const second = rig.sockets[1]
  second.receive({ type: 'connected' })
  const restored = second.sent.at(-1)!
  assert.equal(restored.type, 'create')
  assert.equal(restored.memberId, original.memberId)
  assert.notEqual(restored.requestId, original.requestId)
  first.receive({ type: 'error', requestId: original.requestId, error: 'invalid_code' })
  assert.equal(rig.state().lease?.memberId, original.memberId)
  second.receive({ type: 'membership', requestId: restored.requestId, memberId: original.memberId, role: 'primary', code: '123456', codeExpiresAt: '2026-12-01T00:10:00Z', room: room(2) })
  assert.equal(rig.state().lease?.roomId, roomId)
})

test('stored membership resumes without creating another room and invalid membership returns to pairing', (t) => {
  const rig = setup(JSON.stringify({ roomId, memberId, role: 'primary' })); t.after(rig.client.dispose)
  const socket = rig.sockets[0]
  socket.receive({ type: 'connected' })
  const resume = socket.sent.at(-1)!
  assert.equal(resume.type, 'resume')
  assert.equal(resume.memberId, memberId)
  socket.receive({ type: 'error', requestId: resume.requestId, error: 'room_missing' })
  assert.equal(rig.state().lease, null)
  assert.equal(rig.values.size, 0)
  assert.match(rig.state().error, /จับคู่ใหม่/)
})

test('join preserves leading zeroes and a rejected code allows another attempt', (t) => {
  const rig = setup(); t.after(rig.client.dispose)
  const socket = rig.sockets[0]
  socket.receive({ type: 'connected' }); rig.client.join('000123')
  const join = socket.sent.at(-1)!
  assert.equal(join.code, '000123')
  socket.receive({ type: 'error', requestId: join.requestId, error: 'invalid_code' })
  assert.equal(rig.state().lease, null)
  rig.client.join('000124')
  assert.equal(socket.sent.at(-1)?.code, '000124')
})

test('heartbeat has fresh IDs and revocation stops reconnect while retaining a resumable membership', async (t) => {
  const rig = setup(JSON.stringify({ roomId, memberId, role: 'primary' })); t.after(rig.client.dispose)
  const socket = rig.sockets[0]
  socket.receive({ type: 'connected' })
  await new Promise((resolve) => setTimeout(resolve, 1100))
  const heartbeat = socket.sent.find((message) => message.type === 'heartbeat')!
  assert.ok(heartbeat.requestId)
  socket.receive({ type: 'error', requestId: heartbeat.requestId, error: 'unauthorized' })
  assert.equal(rig.state().connection, 'unauthorized')
  assert.equal(rig.state().lease?.memberId, memberId)
  rig.client.reconnect()
  assert.equal(rig.sockets.length, 1)
})

test('protocol rejects corrupt persisted data, malformed snapshots and duplicate member roles', () => {
  assert.equal(readCameraLease('{'), null)
  assert.equal(readCameraLease(JSON.stringify({ memberId: '../other', role: 'primary' })), null)
  assert.equal(parseCameraEvent(JSON.stringify({ type: 'state', room: { id: roomId, seq: -1, members: [] } })), null)
  assert.equal(parseCameraEvent(JSON.stringify({ type: 'state', room: { ...room(1), members: [{ role: 'primary', connected: true, ready: false }, { role: 'primary', connected: false, ready: false }] } })), null)
  assert.equal(parseCameraEvent('video bytes'), null)
})

test('ready reports start only after membership, refresh each second and revoke immediately on failure', async (t) => {
  let ready = true
  const rig = setup(JSON.stringify({ roomId, memberId, role: 'primary' }), () => ready); t.after(rig.client.dispose)
  const socket = rig.sockets[0]
  socket.receive({ type: 'connected' })
  assert.equal(socket.sent.some((message) => message.type === 'readiness'), false)
  const resume = socket.sent.at(-1)!
  socket.receive({ type: 'membership', requestId: resume.requestId, memberId, role: 'primary', code: '000123', codeExpiresAt: '2026-12-01T00:10:00Z', room: room(1) })
  assert.equal(socket.sent.at(-1)?.type, 'readiness')
  assert.equal(socket.sent.at(-1)?.ready, true)
  const firstID = socket.sent.at(-1)?.requestId
  await new Promise((resolve) => setTimeout(resolve, 1100))
  assert.equal(socket.sent.at(-1)?.ready, true)
  assert.notEqual(socket.sent.at(-1)?.requestId, firstID)
  ready = false; rig.client.readinessChanged()
  assert.equal(socket.sent.at(-1)?.ready, false)
  assert.equal(socket.sent.at(-1)?.roomId, roomId)
  const count = socket.sent.length
  rig.client.readinessChanged()
  assert.equal(socket.sent.length, count)
  socket.close(); rig.client.readinessChanged()
  assert.equal(socket.sent.length, count)
})
