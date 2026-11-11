export type AuthSession = { user: { id: string; username: string }; expiresAt: string }

export class AuthError extends Error {
  status: number
  constructor(status: number) {
    super(status === 401 ? 'ชื่อบัญชีหรือรหัสผ่านไม่ถูกต้อง หรือการเข้าสู่ระบบหมดอายุ' :
      status === 429 ? 'ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' :
      status === 403 ? 'ที่อยู่เว็บไม่ตรงกับระบบ กรุณาติดต่อทีมดูแล' :
      status === 409 ? 'เบอร์โทรศัพท์นี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ' :
      status === 422 ? 'กรุณาตรวจข้อมูลที่กรอกแล้วลองใหม่' : 'ระบบยังไม่พร้อม กรุณาลองใหม่')
    this.status = status
  }
}
export async function authRequest(path: string, body?: object): Promise<AuthSession | null> {
  const response = await fetch(`/api/auth/${path}`, {
    method: path === 'me' ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new AuthError(response.status)
  return response.status === 204 ? null : response.json() as Promise<AuthSession>
}
