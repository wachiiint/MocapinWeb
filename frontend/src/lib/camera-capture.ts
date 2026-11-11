import { cameraClock } from './camera-clock.ts'
import type { CameraTiming } from './camera-clock.ts'
import type { CameraRoom, CameraRole, CameraEvent } from './camera-protocol.ts'

export type CaptureDevice = {
  start(timing: CameraTiming): boolean; stop(cancelled?: boolean): void
  readState(): { state: 'idle' | 'recording' | 'stopping' | 'finished'; takeId?: string; complete?: boolean }
}
type Options = {
  send(type: string, fields?: object): boolean; readReady(): boolean; device?: CaptureDevice
  snapshot(): { room: CameraRoom | null; connected: boolean; role?: CameraRole }
  onCountdown(seconds: number | null): void; now?: () => number
}

export function cameraCapture(options: Options) {
  const clock = cameraClock(), now = options.now ?? (() => performance.now())
  let linked = false, probe: number | null = null, probeAt = 0
  let probeBudget = 5, lastSyncAt = -Infinity
  let prepared = '', started = '', completed = '', cancelled = '', failed = '', clearRequested = '', lastClearAt = 0
  let autoAttemptRoom = '', retryAt = 0, countdown: number | null = null
  const display = (value: number | null) => { if (value !== countdown) { countdown = value; options.onCountdown(value) } }
  function send(type: string, takeId: string) {
    return options.send(type, { roomId: options.snapshot().room?.id, takeId })
  }
  function tick() {
    const current = options.snapshot(), room = current.room, time = now()
    if (!current.connected || !room) {
      if (linked) { clock.reset(); probe = null; probeBudget = 5; lastSyncAt = -Infinity; prepared = ''; cancelled = ''; completed = ''; failed = '' }
      linked = false; display(null); return
    }
    linked = true
    if (!options.device) return
    const estimate = clock.estimate(time)
    if (probeBudget === 0 && time - lastSyncAt >= 20000) probeBudget = 5
    if (probeBudget > 0 && (probe === null || time - probeAt > 2000)) {
      probe = time; probeAt = time
      options.send('clock', { clientTime: time })
    }
    const local = options.device?.readState(), take = room.take
    if (take?.phase === 'cancelled' && local?.state === 'recording' && local.takeId === take.id) options.device.stop(true)
    if (!take) {
      display(null)
      if (current.role === 'primary' && estimate && options.readReady() && room.members.length === 2 && room.members.every((member) => member.connected && member.ready) && (autoAttemptRoom !== room.id || time - retryAt > 3000)) {
        autoAttemptRoom = room.id; retryAt = time; options.send('start', { roomId: room.id })
      }
      return
    }
    const slot = current.role === 'primary' ? 0 : 1
    if ((take.phase === 'recording' || take.phase === 'stopping') && local?.state === 'idle' && local.takeId !== take.id && prepared !== take.id && failed !== take.id && ['recording','prepared'].includes(take.captures[slot])) {
      if (send('capture-failed', take.id)) failed = take.id
    }
    if (take.captures[slot] === 'cleared') clearRequested = ''
    if (clearRequested === take.id && (take.phase === 'finished' || take.phase === 'cancelled') && time - lastClearAt > 1000) { lastClearAt = time; send('clear', take.id) }
    if (local?.state === 'finished' && local.takeId === take.id && completed !== take.id && (take.phase === 'recording' || take.phase === 'stopping')) {
      if (local.complete) send('stop', take.id)
      if (options.send('finished', { roomId: room.id, takeId: take.id, complete: local.complete === true })) completed = take.id
    }
    if (take.phase === 'stopping' && local?.state === 'recording' && local.takeId === take.id) options.device.stop()
    if (take.phase === 'preparing' && prepared !== take.id) {
      if (estimate && options.readReady()) { if (send('prepared', take.id)) prepared = take.id }
      else if (cancelled !== take.id && send('cancel', take.id)) cancelled = take.id
    }
    if ((take.phase === 'preparing' || take.phase === 'countdown') && started !== take.id && !options.readReady()) {
      if (cancelled !== take.id && send('cancel', take.id)) cancelled = take.id
      display(null); return
    }
    if ((take.phase === 'countdown' || take.phase === 'recording') && prepared === take.id && started !== take.id) {
      if (!estimate) { send('cancel', take.id); display(null); return }
      const remaining = take.startAtMs - estimate.serverNowMs
      if (remaining > 0) { display(Math.min(5, Math.ceil(remaining / 1000))); return }
      display(null); started = take.id
      if (remaining < -1000 || !options.readReady()) { send('capture-failed', take.id); return }
      const timing: CameraTiming = { schemaVersion: 1, roomId: room.id, takeId: take.id, role: current.role!, targetStartAtMs: take.startAtMs,
        clockOffsetMs: estimate.offsetMs, uncertaintyMs: estimate.uncertaintyMs, samples: estimate.samples,
        requestedAt: time, estimatedRequestServerMs: estimate.serverNowMs, nativeStartAt: null, estimatedNativeStartServerMs: null }
      if (options.device.start(timing)) send('started', take.id)
      else send('capture-failed', take.id)
    } else display(null)
  }
  const timer = setInterval(tick, 100)
  return {
    ready: () => clock.estimate(now()) !== null && options.readReady(),
    clock(event: CameraEvent) {
      if (event.clientTime === probe && event.serverTimeMs !== undefined) {
        clock.observe(probe!, now(), event.serverTimeMs); probe = null; probeBudget--
        if (probeBudget === 0) lastSyncAt = now()
      }
    },
    retry() { const room = options.snapshot().room; if (room) options.send('start', { roomId: room.id }) },
    stop() {
      options.device?.stop()
      const take = options.snapshot().room?.take
      if (take) send('stop', take.id)
    },
    clear() { const take = options.snapshot().room?.take; if (take && (take.phase === 'finished' || take.phase === 'cancelled')) { clearRequested = take.id; lastClearAt = -Infinity; tick() } },
    dispose() { clearInterval(timer); display(null) },
    tick,
  }
}
