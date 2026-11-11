import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthError, authRequest } from '@/lib/auth'
import type { AuthSession } from '@/lib/auth'
import { normalizePhone, validateRegistration } from '@/lib/registration'
import type { Registration, RegistrationErrors } from '@/lib/registration'

const fields = [
  { name: 'fullName', label: 'ชื่อ - นามสกุล', type: 'text', placeholder: 'ระบุชื่อและนามสกุล', complete: 'name', wide: true },
  { name: 'phone', label: 'เบอร์โทรศัพท์', type: 'tel', placeholder: 'เช่น 0812345678', complete: 'tel-national', wide: true },
  { name: 'ageYears', label: 'อายุ (ปี)', type: 'number', placeholder: 'เช่น 68', complete: 'off', wide: false },
  { name: 'heightCm', label: 'ส่วนสูง (ซม.)', type: 'number', placeholder: 'เช่น 160', complete: 'off', wide: false },
  { name: 'weightKg', label: 'น้ำหนัก (กก.)', type: 'number', placeholder: 'เช่น 55', complete: 'off', wide: false },
] as const

const inputClass = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-lg placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B65FF] aria-invalid:border-red-600'

export function SignupForm({ onLogin, onBusyChange }: { onLogin(session: AuthSession): void; onBusyChange(value: boolean): void }) {
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(false)
  const [errors, setErrors] = useState<RegistrationErrors>({})
  const [error, setError] = useState('')
  const sending = useRef(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) return
    const form = event.currentTarget
    const data = new FormData(form)
    const input: Registration = {
      fullName: String(data.get('fullName') ?? '').trim(), phone: normalizePhone(String(data.get('phone') ?? '')),
      ageYears: Number(data.get('ageYears')), sex: String(data.get('sex') ?? ''),
      heightCm: Number(data.get('heightCm')), weightKg: Number(data.get('weightKg')), password: String(data.get('password') ?? ''),
    }
    const next = validateRegistration(input)
    setErrors(next); setError('')
    const first = Object.keys(next)[0]
    if (first) { form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return }
    sending.current = true; setBusy(true); onBusyChange(true)
    try {
      const session = await authRequest('signup', input)
      if (session) { form.reset(); onLogin(session) }
    } catch (cause) {
      if (cause instanceof AuthError && cause.status === 409) {
        setErrors({ phone: cause.message }); requestAnimationFrame(() => form.querySelector<HTMLElement>('[name="phone"]')?.focus())
      } else setError(cause instanceof AuthError ? cause.message : 'เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่')
    } finally { sending.current = false; setBusy(false); onBusyChange(false) }
  }
  function renderField(field: typeof fields[number]) {
    return <div key={field.name} className={field.wide ? 'sm:col-span-2' : undefined}>
      <label htmlFor={`signup-${field.name}`} className="mb-2 block text-lg font-semibold">{field.label}</label>
      <input id={`signup-${field.name}`} name={field.name} type={field.type} autoComplete={field.complete} placeholder={field.placeholder}
        required maxLength={field.name === 'fullName' ? 200 : field.name === 'phone' ? 32 : undefined}
        min={field.type === 'number' ? 0 : undefined} step={field.name === 'ageYears' ? 1 : field.type === 'number' ? 'any' : undefined}
        aria-invalid={!!errors[field.name]} aria-describedby={errors[field.name] ? `${field.name}-error` : undefined} className={inputClass} />
      {errors[field.name] && <p id={`${field.name}-error`} className="mt-2 text-base text-red-700">{errors[field.name]}</p>}
    </div>
  }
  return <form onSubmit={(event) => void submit(event)} noValidate aria-busy={busy} className="space-y-6">
    <h1 className="text-2xl font-bold sm:text-3xl">สร้างบัญชีผู้ใช้งานใหม่</h1>
    <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">
      {fields.slice(0, 3).map(renderField)}
      <fieldset className="min-w-0" aria-describedby={errors.sex ? 'sex-error' : undefined}>
        <legend className="mb-2 text-lg font-semibold">เพศ</legend>
        <div className="grid grid-cols-2 gap-2">
          {[['male', 'ชาย'], ['female', 'หญิง']].map(([value, label]) => <label key={value} className="cursor-pointer">
            <input type="radio" name="sex" value={value} required aria-invalid={!!errors.sex} className="peer sr-only" />
            <span className="flex min-h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-lg peer-checked:border-[#0B65FF] peer-checked:bg-[#0B65FF] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#0B65FF]">{label}</span>
          </label>)}
        </div>
        {errors.sex && <p id="sex-error" className="mt-2 text-base text-red-700">{errors.sex}</p>}
      </fieldset>
      {fields.slice(3).map(renderField)}
      <div className="sm:col-span-2">
        <label htmlFor="signup-password" className="mb-2 block text-lg font-semibold">ตั้งรหัสผ่าน</label>
        <div className="flex gap-2">
          <input id="signup-password" name="password" type={visible ? 'text' : 'password'} autoComplete="new-password" required maxLength={256}
            placeholder="อย่างน้อย 6 ตัวอักษร" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} className={`${inputClass} min-w-0 flex-1`} />
          <Button type="button" variant="outline" className="min-h-12 min-w-12 rounded-xl" aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={visible} onClick={() => setVisible(!visible)}>
            {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
        {errors.password && <p id="password-error" className="mt-2 text-base text-red-700">{errors.password}</p>}
      </div>
    </fieldset>
    {Object.keys(errors).length > 0 && <p role="alert" className="text-base text-red-700">กรุณาตรวจข้อมูลในช่องที่ระบุ</p>}
    {error && <p role="alert" className="text-lg text-red-700">{error}</p>}
    <Button type="submit" disabled={busy} className="min-h-14 w-full rounded-full bg-[#0B65FF] px-4 text-lg text-white hover:bg-[#0052CC]">
      {busy ? 'กำลังสร้างบัญชี…' : 'สมัครใช้งานและเริ่มตรวจ'}<ArrowRight aria-hidden="true" size={20} />
    </Button>
  </form>
}
