import { pairingError, parseCameraEvent, readCameraLease } from './camera-protocol.ts'
import type { CameraEvent, CameraLease, PairingState } from './camera-protocol.ts'
import { cameraCapture } from './camera-capture.ts'
import type { CaptureDevice } from './camera-capture.ts'

type Socket = Pick<WebSocket, 'send' | 'close' | 'addEventListener' | 'readyState'>
type Options = {
  url: string; storageKey: string; storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  onChange(state: PairingState): void; socket?: (url: string) => Socket
  readReady?: () => boolean
  capture?: CaptureDevice
}

function memberID() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((n) => n.toString(16).padStart(2, '0')).join('')
}

// Owns one account's socket, pairing restoration and timers. It never owns a camera.
export function cameraPairing(options: Options) {
  let saved: CameraLease | null = null
  try { saved = readCameraLease(options.storage?.getItem(options.storageKey) ?? null) } catch { /* Storage can be disabled on a phone. */ }
  let state: PairingState = { connection: 'connecting', room: null, lease: saved, pending: false, error: '' }
  let socket: Socket | null = null, stopped = false, retryCount = 0, lastMessage = 0
  let request: { id: string; type: string; at: number } | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closedRoom = ''
  let lastReady: boolean | null = null
  let joined = false
  const emit = (patch: Partial<PairingState>) => { state = { ...state, ...patch }; options.onChange(state) }
  const store = (lease: CameraLease | null) => {
    try {
      if (lease) options.storage?.setItem(options.storageKey, JSON.stringify(lease))
      else options.storage?.removeItem(options.storageKey)
    } catch { /* Reconnection still works in memory when storage is unavailable. */ }
    state = { ...state, lease }
  }
  const clearRequest = () => { request = null; state = { ...state, pending: false } }
  function send(type: string, fields: object = {}) {
    if (socket?.readyState !== 1) return false
    try { socket.send(JSON.stringify({ type, requestId: crypto.randomUUID(), ...fields })); return true }
    catch { socket.close(); return false }
  }
  function command(type: string, fields: object = {}) {
    if (state.pending || socket?.readyState !== 1) return false
    const id = crypto.randomUUID()
    request = { id, type, at: Date.now() }
    emit({ pending: true, error: '' })
    try { socket.send(JSON.stringify({ type, requestId: id, ...fields })); return true }
    catch { socket.close(); return false }
  }
  function restore() {
    const lease = state.lease
    if (!lease) return
    if (lease.roomId) command('resume', { roomId: lease.roomId, memberId: lease.memberId })
    else command(lease.role === 'primary' ? 'create' : 'join', { memberId: lease.memberId, ...(lease.code ? { code: lease.code } : {}) })
  }
  function reportReadiness(force = false) {
    if (!joined || !state.lease?.roomId || state.connection !== 'connected') return false
    const ready = options.capture ? capture.ready() : options.readReady?.() === true
    if (force || ready !== lastReady) {
      if (!send('readiness', { roomId: state.lease.roomId, ready })) return false
      lastReady = ready
    }
    return true
  }
  function receive(event: CameraEvent) {
    if (event.type === 'clock') { capture.clock(event); return }
    if (event.type === 'connected') { retryCount = 0; emit({ connection: 'connected' }); restore(); return }
    const operation = request && request.id === event.requestId ? request.type : null
    if (operation) clearRequest()
    if (event.type === 'membership' && operation) {
      const lease: CameraLease = { memberId: event.memberId!, roomId: event.room!.id, role: event.role!, code: event.code, codeExpiresAt: event.codeExpiresAt }
      store(lease); closedRoom = ''; joined = true
      const room = state.room?.id === event.room!.id && state.room.seq > event.room!.seq ? state.room : event.room!
      emit({ room, error: '' }); reportReadiness(true); return
    }
    if (event.type === 'state' && event.room?.id !== closedRoom) {
      if (state.lease?.roomId && state.lease.roomId !== event.room!.id) return
      if (!state.room || state.room.id !== event.room!.id || state.room.seq < event.room!.seq) emit({ room: event.room! })
    }
    if (event.type === 'room_closed' || (event.type === 'left' && operation === 'leave')) {
      if (state.lease?.roomId !== event.roomId) return
      const leaving = operation === 'leave' || request?.type === 'leave'
      closedRoom = event.roomId!; joined = false; store(null); clearRequest()
      emit({ room: null, error: event.type === 'room_closed' && !leaving ? 'เครื่องหลักเลิกจับคู่แล้ว' : '' })
    }
    if (event.type === 'error' && (operation || ['unauthorized','auth_unavailable','not_ready','stale_take','capture_busy'].includes(event.error ?? ''))) {
      if (operation && ['create', 'join', 'resume'].includes(operation) && !['auth_unavailable', 'unauthorized'].includes(event.error ?? '')) store(null)
      if (event.error === 'unauthorized') { stopped = true; clearInterval(heartbeat); socket?.close() }
      clearRequest()
      if (!state.lease) joined = false
      emit({ error: pairingError(event.error), ...(event.error === 'unauthorized' ? { connection: 'unauthorized' } : {}), ...(!state.lease ? { room: null } : {}) })
    }
  }
  function connect() {
    if (stopped) return
    clearTimeout(retry)
    emit({ connection: retryCount > 0 ? 'reconnecting' : 'connecting' })
    let current: Socket
    try { current = (options.socket ?? ((url) => new WebSocket(url)))(options.url) }
    catch { schedule(); return }
    socket = current; lastMessage = Date.now()
    current.addEventListener('message', (event: MessageEvent) => {
      if (socket !== current || stopped) return
      const parsed = parseCameraEvent(event.data)
      if (!parsed) { current.close(); return }
      lastMessage = Date.now(); receive(parsed)
    })
    current.addEventListener('close', () => {
      if (socket !== current || stopped) return
      socket = null; joined = false; lastReady = null; clearRequest(); clearInterval(heartbeat)
      schedule()
    })
    current.addEventListener('error', () => { if (socket === current) current.close() })
    clearInterval(heartbeat)
    heartbeat = setInterval(() => {
      if (socket !== current || stopped) return
      if (Date.now() - lastMessage >= 3000 || (request && Date.now() - request.at >= 5000)) { current.close(); return }
      if (current.readyState === 1 && !reportReadiness(true)) send('heartbeat')
    }, 1000)
  }
  function schedule() {
    if (stopped) return
    retryCount++
    emit({ connection: 'reconnecting', pending: false })
    retry = setTimeout(connect, Math.min(1000 * 2 ** (retryCount - 1), 8000))
  }
  function begin(role: CameraLease['role'], code?: string) {
    if (state.connection !== 'connected' || state.pending || state.lease) return
    store({ memberId: memberID(), role, ...(code ? { code } : {}) })
    command(role === 'primary' ? 'create' : 'join', { memberId: state.lease!.memberId, ...(code ? { code } : {}) })
  }
  const capture = cameraCapture({ send, readReady: () => options.readReady?.() === true, device: options.capture,
    snapshot: () => ({ room: state.room, connected: joined && state.connection === 'connected', role: state.lease?.role }),
    onCountdown: (countdownSeconds) => emit({ countdownSeconds }) })
  connect()
  return {
    create: () => begin('primary'),
    join: (code: string) => { if (/^\d{6}$/.test(code)) begin('secondary', code) },
    leave: () => { if (state.lease?.roomId) command('leave', { roomId: state.lease.roomId }) },
    renewCode: () => { if (state.lease?.roomId) command('renew-code', { roomId: state.lease.roomId }) },
    readinessChanged: () => reportReadiness(),
    retryCapture: capture.retry, stopCapture: capture.stop, clearCapture: capture.clear,
    reconnect: () => {
      if (stopped) return
      socket?.close(); socket = null; joined = false; lastReady = null; clearRequest(); clearInterval(heartbeat); connect()
    },
    dispose: () => { stopped = true; capture.dispose(); clearTimeout(retry); clearInterval(heartbeat); socket?.close(); socket = null },
  }
}
