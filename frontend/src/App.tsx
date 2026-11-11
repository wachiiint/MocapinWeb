import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AuthPage } from '@/pages/patient/AuthPage'
import { AuthError, authRequest } from '@/lib/auth'
import type { AuthSession } from '@/lib/auth'

const CameraPage = lazy(() => import('@/pose-check/CameraPage'))

function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [checked, setChecked] = useState(false)
  const [cameraMounted, setCameraMounted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const generation = useRef(0)
  const alive = useRef(false)
  const expired = session !== null && Date.parse(session.expiresAt) <= now

  function loggedIn(value: AuthSession) {
    generation.current++; setSession(value); setCameraMounted(true); setChecked(true); setError(''); setNow(Date.now())
  }
  async function check() {
    const request = ++generation.current
    try {
      const value = await authRequest('me')
      if (!alive.current || request !== generation.current) return
      setSession(value); if (value) setCameraMounted(true)
      setError(''); setChecked(true)
    } catch (cause) {
      if (!alive.current || request !== generation.current) return
      if (cause instanceof AuthError && cause.status === 401) { setSession(null); setChecked(true); setError('') }
      else setError('เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่')
    }
  }
  useEffect(() => {
    alive.current = true
    const initial = window.setTimeout(() => void check(), 0)
    const timer = window.setInterval(() => { setNow(Date.now()); void check() }, 60000)
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    const visible = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); void check() } }
    document.addEventListener('visibilitychange', visible)
    return () => { alive.current = false; clearTimeout(initial); clearInterval(timer); clearInterval(tick); document.removeEventListener('visibilitychange', visible) }
  }, [])
  async function logout() {
    if (busy || logoutBusy) return
    setLogoutBusy(true); generation.current++
    try {
      await authRequest('logout')
      generation.current++; setSession(null); setCameraMounted(false); setError('')
    } catch { setError('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่') }
    finally { setLogoutBusy(false) }
  }
  const authenticated = checked && session !== null && !expired
  return <div className="min-h-screen w-full bg-white text-lg text-slate-900">
    {session && <header className="flex min-h-[76px] w-full flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-[#F4F8FC] px-5 py-3 sm:px-8">
      <div className="flex items-center gap-3" aria-label="MOCAPCARE">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0B65FF] font-bold text-white">M</span>
        <span className="text-xl font-extrabold tracking-tight"><span className="text-[#0B65FF]">MOCAP</span>CARE</span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-5">
        <span className="break-all">{session.user.username}</span>
        <Button variant="outline" className="min-h-12 rounded-full bg-white text-lg" disabled={busy || logoutBusy} onClick={() => void logout()}>{logoutBusy ? 'กำลังออก…' : 'ออกจากระบบ'}</Button>
      </div>
      {busy && <p className="w-full text-right text-base">หยุดอัดและดาวน์โหลดไฟล์ แล้วกดล้างเพื่อออกจากระบบ</p>}
    </header>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 p-5 text-red-700"><p>{error}</p><Button variant="outline" className="min-h-12 text-lg" onClick={() => void check()}>ลองเชื่อมต่อใหม่</Button></div>}
    {!checked && !error && <p role="status" className="p-5">กำลังตรวจการเข้าสู่ระบบ…</p>}
    {checked && !authenticated && <>
      {cameraMounted && <p role="status" className="px-5 pt-5">การเข้าสู่ระบบหมดอายุ เก็บวิดีโอได้ตามเดิม กรุณาเข้าสู่ระบบก่อนเริ่มรอบใหม่</p>}
      <AuthPage onLogin={loggedIn} />
    </>}
    {cameraMounted && <Suspense fallback={<p role="status" className="p-5">กำลังเปิดหน้ากล้อง…</p>}>
      <CameraPage accountId={session?.user.id ?? null} canRecord={authenticated && !error && !logoutBusy} onBusyChange={setBusy} />
    </Suspense>}
  </div>
}
export default App
