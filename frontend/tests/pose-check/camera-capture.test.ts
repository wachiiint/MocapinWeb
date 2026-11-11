import test from 'node:test'
import assert from 'node:assert/strict'
import { cameraClock } from '../../src/lib/camera-clock.ts'
import { cameraCapture } from '../../src/lib/camera-capture.ts'
import type { CameraRoom } from '../../src/lib/camera-protocol.ts'
import type { CameraTiming } from '../../src/lib/camera-clock.ts'
import type { CaptureDevice } from '../../src/lib/camera-capture.ts'

function rig() {
  let time = 100, connected = true, ready = true
  let local: ReturnType<CaptureDevice['readState']> = { state: 'idle' }
  const room: CameraRoom = { id: 'a'.repeat(32), seq: 1, members: [{ role: 'primary', connected: true, ready: true }, { role: 'secondary', connected: true, ready: true }] }
  const messages: { type: string; fields: Record<string, unknown> }[] = [], starts: CameraTiming[] = [], countdowns: (number | null)[] = []
  let stops = 0
  const capture = cameraCapture({
    now: () => time, readReady: () => ready && local.state === 'idle', snapshot: () => ({ room, connected, role: 'primary' }),
    onCountdown: (seconds) => countdowns.push(seconds),
    send: (type, fields = {}) => {
      messages.push({ type, fields: fields as Record<string, unknown> })
      if (type === 'clock' && connected) capture.clock({ type: 'clock', clientTime: time, serverTimeMs: time + 10000 })
      return connected
    },
    device: { readState: () => local, start: (timing) => { starts.push(timing); local = { state: 'recording', takeId: timing.takeId }; return true }, stop: () => { stops++; local = { ...local, state: 'finished', complete: true } } },
  })
  return { capture, room, messages, starts, countdowns, stops: () => stops, time: () => time,
    advance: (ms: number) => { time += ms; capture.tick() }, connect: (value: boolean) => { connected = value }, ready: (value: boolean) => { ready = value },
    finish: () => { local = { ...local, state: 'finished', complete: true } },
    sync: () => { for (let i = 0; i < 6; i++) { time++; capture.tick() } },
  }
}

test('a ready pair automatically prepares, counts five seconds and starts exactly once with shared timing', (t) => {
  const r = rig(); t.after(r.capture.dispose)
  r.capture.tick()
  assert.equal(r.messages.some((m) => m.type === 'start'), false)
  r.sync()
  assert.ok(r.messages.some((m) => m.type === 'start'))
  r.room.take = { id: 'b'.repeat(32), phase: 'preparing', startAtMs: 0, captures: ['idle', 'idle'], incomplete: false }
  r.capture.tick()
  assert.equal(r.messages.at(-1)?.type, 'prepared')
  r.room.take.phase = 'countdown'; r.room.take.startAtMs = r.time() + 10000 + 5000
  r.capture.tick()
  assert.equal(r.countdowns.at(-1), 5)
  r.advance(4999)
  assert.equal(r.starts.length, 0)
  assert.equal(r.countdowns.at(-1), 1)
  r.advance(1); r.capture.tick()
  assert.equal(r.starts.length, 1)
  assert.equal(r.starts[0].takeId, r.room.take.id)
  assert.equal(r.starts[0].estimatedRequestServerMs, r.room.take.startAtMs)
  assert.equal(r.messages.at(-1)?.type, 'started')
  r.room.take.phase = 'recording'; r.finish(); r.capture.tick()
  assert.deepEqual(r.messages.slice(-2).map((m) => m.type), ['stop', 'finished'])
  r.capture.tick()
  assert.equal(r.messages.at(-1)?.type, 'finished')
})

test('a failed check cancels countdown and recovered readiness waits for explicit retry', (t) => {
  const r = rig(); t.after(r.capture.dispose); r.sync()
  r.room.take = { id: 'c'.repeat(32), phase: 'preparing', startAtMs: 0, captures: ['idle', 'idle'], incomplete: false }
  r.capture.tick(); r.room.take.phase = 'countdown'; r.room.take.startAtMs = r.time() + 15000
  r.ready(false); r.capture.tick()
  assert.equal(r.messages.at(-1)?.type, 'cancel')
  r.room.take.phase = 'cancelled'; r.ready(true); r.advance(6000)
  assert.equal(r.starts.length, 0)
  assert.equal(r.messages.at(-1)?.type, 'cancel')
  r.capture.retry()
  assert.equal(r.messages.at(-1)?.type, 'start')
})

test('reconnect never replays a scheduled start; stop works locally while offline', (t) => {
  const r = rig(); t.after(r.capture.dispose); r.sync()
  r.room.take = { id: 'd'.repeat(32), phase: 'preparing', startAtMs: 0, captures: ['idle', 'idle'], incomplete: false }
  r.capture.tick(); r.room.take.phase = 'countdown'; r.room.take.startAtMs = r.time() + 15000
  r.connect(false); r.capture.tick(); r.advance(6000); r.connect(true); r.sync(); r.capture.tick()
  assert.equal(r.starts.length, 0)
  r.connect(false); r.capture.stop()
  assert.equal(r.stops(), 1)
})

test('server clock needs five samples and uses the minimum round trip without the phone wall clock', () => {
  const clock = cameraClock()
  for (let i = 0; i < 4; i++) clock.observe(i*100, i*100+20, i*100+10010)
  assert.equal(clock.estimate(400), null)
  clock.observe(400, 404, 10402)
  assert.equal(clock.estimate(500)?.offsetMs, 10000)
  assert.equal(clock.estimate(500)?.uncertaintyMs, 2)
  assert.equal(clock.estimate(500)?.serverNowMs, 10500)
  assert.equal(clock.estimate(31000), null)
  clock.reset(); assert.equal(clock.estimate(0), null)
})

test('completion is retried after disconnect so a lost finish message cannot block the next take', (t) => {
  const r = rig(); t.after(r.capture.dispose); r.sync()
  r.room.take = { id: 'e'.repeat(32), phase: 'preparing', startAtMs: 0, captures: ['idle','idle'], incomplete: false }
  r.capture.tick(); r.room.take.phase = 'countdown'; r.room.take.startAtMs = r.time() + 15000
  r.advance(5000); r.room.take.phase = 'recording'; r.finish(); r.capture.tick()
  assert.equal(r.messages.filter((m) => m.type === 'finished').length, 1)
  r.connect(false); r.capture.tick(); r.connect(true); r.sync()
  assert.equal(r.messages.filter((m) => m.type === 'finished').length, 2)
})

test('a reloaded page reports its missing recorder instead of replaying start or holding the room forever', (t) => {
  const r = rig(); t.after(r.capture.dispose)
  r.room.take = { id: 'f'.repeat(32), phase: 'recording', startAtMs: 10000, captures: ['recording','recording'], incomplete: false }
  r.sync()
  assert.equal(r.starts.length, 0)
  assert.equal(r.messages.filter((m) => m.type === 'capture-failed').length, 1)
})
