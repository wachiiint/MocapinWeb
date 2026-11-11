import { useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthError, authRequest } from '@/lib/auth'
import type { AuthSession } from '@/lib/auth'

export function LoginPage({ onLogin, onSignup, onBusyChange }: { onLogin(session: AuthSession): void; onSignup(): void; onBusyChange(value: boolean): void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); onBusyChange(true); setError('')
    try {
      const session = await authRequest('login', { username, password })
      if (session) { setPassword(''); onLogin(session) }
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : 'เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่')
    } finally { setBusy(false); onBusyChange(false) }
  }
  return <form onSubmit={(event) => void submit(event)} className="space-y-6">
      <h1 id="login-title" className="text-2xl font-bold sm:text-3xl">เข้าสู่ระบบผู้ใช้งาน</h1>
      <label className="block space-y-2 font-medium">เบอร์โทรศัพท์หรือชื่อบัญชี
        <input autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} value={username}
          onChange={(event) => setUsername(event.target.value)} disabled={busy}
          className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-normal focus-visible:outline-2 focus-visible:outline-[#0B65FF]" />
      </label>
      <label htmlFor="login-password" className="block font-medium">รหัสผ่าน</label>
      <div className="flex gap-2">
        <input id="login-password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={256}
          value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 focus-visible:outline-2 focus-visible:outline-[#0B65FF]" />
        <Button type="button" variant="outline" className="min-h-12 min-w-12" aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={visible} onClick={() => setVisible(!visible)}>
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <Button type="submit" disabled={busy} className="min-h-12 w-full rounded-full bg-[#0B65FF] text-lg text-white hover:bg-[#0052CC]">
        {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </Button>
      <p className="text-center text-slate-600">ยังไม่มีบัญชีใช่หรือไม่?<br /><button type="button" disabled={busy} onClick={onSignup} className="min-h-12 rounded-full px-2 font-bold text-[#0052CC] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[#0B65FF]">สมัครใช้งานใหม่ที่นี่</button></p>
    </form>
}
