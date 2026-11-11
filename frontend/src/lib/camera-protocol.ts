export type CameraRole = 'primary' | 'secondary'
export type CameraTake = { id: string; phase: 'preparing' | 'countdown' | 'recording' | 'stopping' | 'finished' | 'cancelled'; startAtMs: number; captures: string[]; incomplete: boolean }
export type CameraRoom = { id: string; seq: number; members: { role: CameraRole; connected: boolean; ready: boolean }[]; take?: CameraTake }
export type CameraLease = { memberId: string; role: CameraRole; roomId?: string; code?: string; codeExpiresAt?: string }
export type CameraEvent = {
  type: 'connected' | 'membership' | 'state' | 'ack' | 'left' | 'room_closed' | 'error' | 'clock'
  requestId?: string; room?: CameraRoom; memberId?: string; role?: CameraRole
  roomId?: string; seq?: number; code?: string; codeExpiresAt?: string; error?: string
  clientTime?: number; serverTimeMs?: number
}
export type PairingState = {
  connection: 'connecting' | 'connected' | 'reconnecting' | 'unauthorized' | 'closed'
  room: CameraRoom | null; lease: CameraLease | null; pending: boolean; error: string
  countdownSeconds?: number | null
}

const id = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
const role = (value: unknown): value is CameraRole => value === 'primary' || value === 'secondary'
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object'

export function readCameraLease(value: string | null): CameraLease | null {
  try {
    const lease: unknown = JSON.parse(value ?? 'null')
    if (!object(lease) || !id(lease.memberId) || !role(lease.role)) return null
    if (lease.roomId !== undefined && !id(lease.roomId)) return null
    if (lease.code !== undefined && (typeof lease.code !== 'string' || !/^\d{6}$/.test(lease.code))) return null
    if (lease.codeExpiresAt !== undefined && (typeof lease.codeExpiresAt !== 'string' || !Number.isFinite(Date.parse(lease.codeExpiresAt)))) return null
    if (!lease.roomId && lease.role === 'secondary' && !lease.code) return null
    return lease as CameraLease
  } catch { return null }
}

export function parseCameraEvent(data: unknown): CameraEvent | null {
  try {
    if (typeof data !== 'string' || data.length > 8192) return null
    const event: unknown = JSON.parse(data)
    if (!object(event)) return null
    if (event.type === 'connected') return { type: 'connected' }
    if (event.type === 'clock' && typeof event.clientTime === 'number' && Number.isFinite(event.clientTime) && typeof event.serverTimeMs === 'number' && Number.isFinite(event.serverTimeMs)) return event as CameraEvent
    if (event.type === 'state' || event.type === 'membership') {
      const room = event.room
      if (!object(room) || !id(room.id) || !Number.isSafeInteger(room.seq) || Number(room.seq) < 0 || !Array.isArray(room.members) || room.members.length > 2) return null
      if (!room.members.every((m: unknown) => object(m) && role(m.role) && typeof m.connected === 'boolean' && typeof m.ready === 'boolean')) return null
      if (new Set(room.members.map((m) => m.role)).size !== room.members.length) return null
      if (room.take !== undefined) {
        const take = room.take
        if (!object(take) || !id(take.id) || !['preparing','countdown','recording','stopping','finished','cancelled'].includes(String(take.phase)) || typeof take.startAtMs !== 'number' || !Number.isFinite(take.startAtMs) || typeof take.incomplete !== 'boolean' || !Array.isArray(take.captures) || take.captures.length !== 2 || !take.captures.every((value) => ['idle','prepared','recording','finished','failed','cleared'].includes(value))) return null
      }
      if (event.type === 'membership') {
        if (!id(event.memberId) || !role(event.role) || typeof event.requestId !== 'string') return null
        if (!room.members.some((m) => m.role === event.role)) return null
        if (event.role === 'primary' && (typeof event.code !== 'string' || !/^\d{6}$/.test(event.code) || typeof event.codeExpiresAt !== 'string' || !Number.isFinite(Date.parse(event.codeExpiresAt)))) return null
      }
      return event as CameraEvent
    }
    if (event.type === 'room_closed' || event.type === 'left') {
      if (!id(event.roomId) || !Number.isSafeInteger(event.seq)) return null
      return event as CameraEvent
    }
    if ((event.type === 'ack' || event.type === 'error') && typeof event.requestId === 'string') {
      if (event.type === 'error' && typeof event.error !== 'string') return null
      return event as CameraEvent
    }
    return null
  } catch { return null }
}

export function pairingError(code: string | undefined): string {
  const messages: Record<string, string> = {
    invalid_code: 'รหัสไม่ถูกต้องหรือหมดอายุ ตรวจรหัสจากเครื่องหลักแล้วลองใหม่',
    rate_limited: 'ลองรหัสบ่อยเกินไป กรุณารอ 1 นาทีแล้วลองใหม่',
    room_exists: 'บัญชีนี้มีห้องใช้งานอยู่ กรุณากลับไปที่เครื่องหลักเดิม',
    room_full: 'ห้องนี้มีมือถือครบสองเครื่องแล้ว',
    room_missing: 'ห้องเดิมสิ้นสุดแล้ว กรุณาจับคู่ใหม่',
    member_missing: 'การจับคู่เดิมสิ้นสุดแล้ว กรุณาจับคู่ใหม่',
    unauthorized: 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
    auth_unavailable: 'ตรวจการเข้าสู่ระบบไม่ได้ กรุณาลองเชื่อมต่อใหม่',
    primary_required: 'กรุณาสร้างรหัสใหม่จากเครื่องหลัก',
    capacity: 'ระบบกำลังมีผู้ใช้งานมาก กรุณาลองใหม่',
    not_ready: 'กล้องยังไม่พร้อมทั้งคู่ กรุณาจัดตำแหน่งแล้วลองใหม่',
    stale_take: 'รอบอัดนี้สิ้นสุดแล้ว กรุณาตรวจวิดีโอที่เก็บได้',
    capture_busy: 'กรุณาหยุดและล้างผลของทั้งสองเครื่องก่อนเริ่มรอบใหม่',
  }
  return messages[code ?? ''] ?? 'จับคู่ไม่สำเร็จ กรุณาลองใหม่'
}
