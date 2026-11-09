import { Check, Minus, X } from 'lucide-react'
import type { Readiness } from './readiness'
import type { ReasonCode } from './quality-checks'

const ITEMS: { label: string; reasons: ReasonCode[]; failure: string }[] = [
  { label: 'จุดร่างกายครบ', reasons: ['KEYPOINTS', 'KEYPOINTS_UNKNOWN'], failure: 'จุดร่างกายไม่ครบ' },
  { label: 'แสงเพียงพอและไม่ย้อนแสง', reasons: ['DARK', 'LIGHT_UNKNOWN', 'BACKLIGHT', 'BACKLIGHT_UNKNOWN'], failure: 'แสงไม่ผ่าน' },
  { label: 'มีคนเดียวในภาพ', reasons: ['NO_PERSON', 'MULTIPLE_PEOPLE', 'PEOPLE_UNKNOWN'], failure: 'คนมากกว่า 1 คน' },
  { label: 'เห็นเต็มตัว', reasons: ['FRAMING', 'FRAMING_UNKNOWN'], failure: 'เห็นไม่เต็มตัว' },
]

export function QualityChecklist({ gate }: { gate: Pick<Readiness, 'checks' | 'showOverlay'> }) {
  return <section aria-labelledby="quality-checklist-title" className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
    <h2 id="quality-checklist-title" className="text-lg font-semibold">ตรวจความพร้อม</h2>
    <ul aria-live="polite" className="divide-y divide-slate-200">
      {ITEMS.map((item) => {
        const checks = gate.checks.filter((entry) => item.reasons.includes(entry.reason))
        // Old results must never keep a green tick after camera/model/visibility loss.
        const state = gate.showOverlay
          ? checks.some((check) => check.state === 'fail') ? 'fail'
            : checks.some((check) => check.state === 'unknown') ? 'unknown' : 'pass'
          : 'unknown'
        const Icon = state === 'pass' ? Check : state === 'fail' ? X : Minus
        const failed = checks.filter((check) => check.state === 'fail')
        const hasDark = failed.some((check) => check.reason === 'DARK')
        const hasBacklight = failed.some((check) => check.reason === 'BACKLIGHT')
        const message = state === 'pass' ? 'ผ่าน' : state === 'unknown' ? 'รอตรวจ' :
          checks.some((check) => check.reason === 'NO_PERSON') ? 'ไม่พบคนในภาพ' :
          item.reasons.includes('DARK') ? hasDark && hasBacklight ? 'แสงไม่พอและอาจย้อนแสง' :
            hasDark ? 'แสงไม่พอ' : 'อาจมีแสงย้อนจากด้านหลัง' : item.failure
        const color = state === 'pass' ? 'text-green-800' : state === 'fail' ? 'text-amber-900' : 'text-slate-600'
        return <li key={item.label} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${state === 'pass' ? 'bg-green-50' : state === 'fail' ? 'bg-amber-50' : 'bg-slate-100'} ${color}`}>
            <Icon size={24} aria-hidden="true" />
          </span>
          <div className="min-w-0 text-lg">
            <p className="font-medium text-slate-900">{item.label}</p>
            <p className={color}>{message}</p>
          </div>
        </li>
      })}
    </ul>
  </section>
}
