import { useId, useState } from 'react'
import { Check, Link2, LoaderCircle, RefreshCw, Smartphone, Unlink, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { useCameraPairing } from './useCameraPairing'

export function CameraPairingPanel({ pairing, canPair }: { pairing: ReturnType<typeof useCameraPairing>; canPair: boolean }) {
  const [code, setCode] = useState('')
  const [inputError, setInputError] = useState('')
  const inputId = useId()
  const online = canPair && pairing.connection === 'connected'
  const waiting = pairing.connection === 'connecting' || pairing.connection === 'reconnecting'
  const locked = !online || pairing.pending
  const lease = pairing.lease?.roomId ? pairing.lease : null
  const paired = !!lease?.roomId && pairing.room?.id === lease.roomId
  const other = pairing.room?.members.find((member) => member.role !== lease?.role)
  const connected = online && other?.connected === true
  const otherReady = connected && other.ready
  const bothReady = paired && online && pairing.localReady && pairing.room?.members.length === 2 && pairing.room.members.every((member) => member.connected && member.ready)
  const take = pairing.room?.take
  const captureBusy = !!take && ['preparing','countdown','recording','stopping'].includes(take.phase)
  const readinessMessage = take?.phase === 'finished' ? 'อัดรอบนี้เสร็จแล้ว' : take?.phase === 'cancelled' ? '' : captureBusy ? take.phase === 'preparing' ? 'กำลังยืนยันทั้งสองกล้อง…' : take.phase === 'countdown' ? 'กำลังนับถอยหลังก่อนอัด' : take.phase === 'recording' ? 'เริ่มอัดวิดีโอแล้ว' : 'กำลังหยุดและเก็บวิดีโอ…' : !connected ? '' : bothReady ? 'ทั้งสองกล้องพร้อมอัด' : otherReady ?
    `${lease?.role === 'primary' ? 'กล้องที่ 2' : 'กล้องหลัก'}พร้อมอัดแล้ว` : 'อีกเครื่องยังไม่ผ่านการตรวจความพร้อม'
  const status = !canPair ? 'กรุณาเข้าสู่ระบบเพื่อจับคู่' : online ? 'เชื่อมต่อระบบแล้ว' : waiting ? 'กำลังเชื่อมต่อใหม่…' : 'ตรวจการเข้าสู่ระบบแล้วลองใหม่'
  const StatusIcon = waiting && canPair ? LoaderCircle : online ? Link2 : WifiOff

  return <aside className="min-w-0 space-y-5 rounded-2xl border border-blue-100/80 bg-[#F6F9FF] p-5" aria-label="จับคู่กล้อง">
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EFF5FF] text-[#0B65FF]"><Smartphone size={20} aria-hidden="true" /></span>
      <h2 className="text-xl font-bold">มือถืออีกเครื่อง</h2>
    </div>
    <p role="status" className="flex items-center gap-2 text-lg text-slate-700">
      <StatusIcon size={20} aria-hidden="true" className={waiting && canPair ? 'motion-safe:animate-spin' : ''} />{status}
    </p>
    {!lease ? <>
      <p className="text-lg text-slate-700">ใช้บัญชีเดียวกันบนมือถือทั้งสองเครื่อง</p>
      <Button className="min-h-12 w-full rounded-full bg-[#0B65FF] px-5 text-lg text-white hover:bg-[#0052CC]" disabled={locked} onClick={pairing.create}>สร้างรหัสจับคู่</Button>
      <form className="space-y-3 border-t border-blue-100 pt-5" noValidate onSubmit={(event) => {
        event.preventDefault()
        if (locked) return
        if (!/^\d{6}$/.test(code)) { setInputError('กรุณากรอกรหัส 6 หลักจากเครื่องหลัก'); document.getElementById(inputId)?.focus(); return }
        setInputError(''); pairing.join(code)
      }}>
        <label htmlFor={inputId} className="block text-lg font-semibold">หรือกรอกรหัสจากเครื่องหลัก</label>
        <input id={inputId} type="text" inputMode="numeric" autoComplete="off" maxLength={6} value={code} disabled={locked}
          aria-invalid={!!inputError} aria-describedby={inputError ? `${inputId}-error` : undefined}
          onChange={(event) => { setCode(event.target.value.replace(/\D/g, '')); setInputError('') }}
          className="min-h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-2xl tracking-widest tabular-nums outline-none focus-visible:border-[#0B65FF] focus-visible:ring-2 focus-visible:ring-blue-200 disabled:opacity-60" />
        {inputError && <p id={`${inputId}-error`} role="alert" className="text-lg text-red-700">{inputError}</p>}
        <Button type="submit" variant="outline" className="min-h-12 w-full rounded-full bg-white px-5 text-lg" disabled={locked}>เข้าร่วมด้วยรหัส</Button>
      </form>
    </> : <>
      <p className="text-lg font-semibold">เครื่องนี้เป็น{lease.role === 'primary' ? 'กล้องหลัก' : 'กล้องที่ 2'}</p>
      {paired && lease.role === 'primary' && <div className="space-y-3">
        <p className="text-lg text-slate-700">รหัสจับคู่</p>
        <output aria-label="รหัสจับคู่" className="block break-all text-center text-4xl font-extrabold tracking-[0.12em] tabular-nums text-[#0B65FF]">{lease.code}</output>
        <p className="text-base text-slate-700">รหัสใช้ได้ 10 นาที</p>
        <Button variant="outline" className="min-h-12 w-full rounded-full bg-white text-lg" disabled={locked} onClick={pairing.renewCode}><RefreshCw size={18} aria-hidden="true" />สร้างรหัสใหม่</Button>
      </div>}
      <div className="space-y-3 border-t border-blue-100 pt-5">
        <h3 className="text-lg font-semibold">{lease.role === 'primary' ? 'กล้องที่ 2' : 'กล้องหลัก'}</h3>
        <p role="status" className={`flex items-center gap-2 text-lg font-semibold ${connected ? 'text-emerald-800' : 'text-slate-700'}`}>
          {connected ? <Check size={22} aria-hidden="true" /> : <Smartphone size={22} aria-hidden="true" />}
          {!online ? 'รอเชื่อมต่อใหม่' : connected ? 'เชื่อมต่อแล้ว' : other ? 'ขาดการติดต่อ' : 'รอจับคู่'}
        </p>
        <div role="status" aria-live="polite" aria-atomic="true">
          {readinessMessage && <p className={`flex items-start gap-2 rounded-xl p-3 text-lg font-semibold ${otherReady || take?.phase === 'finished' ? 'bg-emerald-50 text-emerald-800' : captureBusy ? 'bg-blue-50 text-blue-900' : 'bg-amber-50 text-amber-900'}`}>
            {otherReady && <Check size={22} className="mt-0.5 shrink-0" aria-hidden="true" />}{readinessMessage}
          </p>}
        </div>
        <p className="text-lg text-slate-700">ดูภาพและจัดมุมกล้องที่มือถือแต่ละเครื่อง</p>
      </div>
      <Button variant="outline" className="min-h-12 w-full rounded-full bg-white text-lg" disabled={locked || !paired || captureBusy} onClick={pairing.leave}><Unlink size={18} aria-hidden="true" />เลิกจับคู่</Button>
      {paired && !take && <p className="text-lg text-slate-700">พร้อมทั้งคู่แล้ว ระบบจะนับ 5 วินาทีและเริ่มอัด</p>}
      {take?.phase === 'cancelled' && <div className="space-y-3">
        <p role="alert" className="text-lg text-amber-900">ยกเลิกการนับแล้ว กรุณาจัดตำแหน่งให้พร้อมอีกครั้ง</p>
        {lease.role === 'primary' && <Button className="min-h-12 w-full rounded-full text-lg" disabled={locked || !bothReady} onClick={pairing.retryCapture}>เริ่มนับใหม่</Button>}
      </div>}
      {take?.phase === 'finished' && <p role="status" className="text-lg text-slate-700">ดาวน์โหลดแล้วล้างผลในทั้งสองเครื่องก่อนอัดรอบใหม่</p>}
      {take?.phase === 'finished' && take.captures[lease.role === 'primary' ? 0 : 1] === 'failed' && <Button variant="outline" className="min-h-12 w-full rounded-full text-lg" disabled={locked} onClick={pairing.clearCapture}>ล้างรอบที่อัดไม่สำเร็จ</Button>}
      {take?.incomplete && <p role="alert" className="text-lg text-amber-900">รอบนี้มีการขาดการติดต่อหรืออัดไม่ครบ กรุณาตรวจวิดีโอทั้งสองเครื่อง</p>}
    </>}
    {pairing.pending && <p role="status" className="text-lg text-slate-700">กำลังยืนยันการจับคู่…</p>}
    {pairing.error && <p role="alert" className="break-words text-lg text-red-700">{pairing.error}</p>}
    {!online && canPair && pairing.connection !== 'unauthorized' && <Button variant="outline" className="min-h-12 w-full rounded-full bg-white text-lg" onClick={pairing.reconnect}>ลองเชื่อมต่อใหม่</Button>}
  </aside>
}
