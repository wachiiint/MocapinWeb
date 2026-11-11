import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ShieldCheck, Smartphone } from 'lucide-react'
import type { AuthSession } from '@/lib/auth'
import { LoginPage } from './LoginPage'
import { SignupForm } from './SignupForm'

export function AuthPage({ onLogin }: { onLogin(session: AuthSession): void }) {
  const [mode, setMode] = useState(() => window.location.hash === '#signup' ? 'signup' : 'login')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    const update = () => setMode(window.location.hash === '#signup' ? 'signup' : 'login')
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  function switchMode(value: string) { setMode(value); history.replaceState(null, '', `#${value}`) }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const value = event.key === 'Home' ? 'login' : event.key === 'End' ? 'signup' : mode === 'login' ? 'signup' : 'login'
    switchMode(value); document.getElementById(`tab-${value}`)?.focus()
  }
  return <div className="flex min-h-screen w-full flex-col bg-white text-lg text-slate-900 lg:flex-row" style={{ fontFamily: "'Plus Jakarta Sans', 'Anuphan', sans-serif" }}>
    <aside className="flex w-full flex-col justify-between border-b border-slate-200/80 bg-linear-to-b from-[#DCEBFF]/80 via-[#EFF5FF] to-[#F4F8FC] p-6 sm:p-10 lg:w-5/12 lg:shrink-0 lg:border-r lg:border-b-0 xl:w-4/12">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0B65FF] font-bold text-white">M</span>
          <span className="text-xl font-extrabold tracking-tight">MOCAP<span className="text-[#0B65FF]">CARE</span></span>
        </div>
        <div className="hidden space-y-6 pt-14 lg:block">
          <h2 className="max-w-sm text-3xl leading-snug font-bold tracking-tight">ติดตามการเคลื่อนไหว<br />ได้จากที่บ้านและโรงพยาบาล</h2>
          {[
            { Icon: Smartphone, title: 'ใช้บัญชีเดียวได้หลายอุปกรณ์', text: 'เข้าสู่ระบบด้วยบัญชีเดิมบนมือถืออีกเครื่องได้' },
            { Icon: ShieldCheck, title: 'ตรวจความพร้อมก่อนบันทึก', text: 'ตรวจแสง ตำแหน่ง และการมองเห็นร่างกายก่อนเริ่ม' },
          ].map(({ Icon, title, text }) => <div key={title} className="flex items-start gap-3.5 rounded-2xl border border-blue-100 bg-white/90 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EFF5FF] text-[#0B65FF]"><Icon size={20} aria-hidden="true" /></span>
            <div><p className="font-bold">{title}</p><p className="mt-1 leading-relaxed text-slate-600">{text}</p></div>
          </div>)}
        </div>
      </div>
      <p className="hidden pt-10 text-base text-slate-600 lg:block">MOCAPCARE — ระบบติดตามการเคลื่อนไหว</p>
    </aside>
    <main className="flex flex-1 items-center justify-center p-5 sm:p-10 lg:p-12 xl:p-16">
      <div className="w-full max-w-xl space-y-7">
        <div role="tablist" aria-label="บัญชีผู้ใช้งาน" className="grid grid-cols-2 rounded-full border border-slate-200/80 bg-[#F4F8FC] p-1.5">
          {[['login', 'เข้าสู่ระบบ'], ['signup', 'สมัครใช้งานใหม่']].map(([value, label]) => <button key={value} id={`tab-${value}`} type="button" role="tab"
            aria-selected={mode === value} aria-controls={`panel-${value}`} disabled={submitting} tabIndex={mode === value ? 0 : -1} onKeyDown={tabKey} onClick={() => switchMode(value)}
            className={`min-h-12 rounded-full px-3 text-lg font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B65FF] ${mode === value ? 'bg-[#0B65FF] text-white' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>)}
        </div>
        <div role="tabpanel" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`} className="rounded-2xl border border-blue-100/80 bg-[#F6F9FF] p-6 sm:p-8">
          {mode === 'signup' ? <SignupForm onLogin={onLogin} onBusyChange={setSubmitting} /> : <LoginPage onLogin={onLogin} onSignup={() => switchMode('signup')} onBusyChange={setSubmitting} />}
        </div>
      </div>
    </main>
  </div>
}
