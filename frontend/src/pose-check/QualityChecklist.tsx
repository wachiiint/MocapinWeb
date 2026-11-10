import { Check, Minus, TriangleAlert } from 'lucide-react'
import type { Readiness } from './readiness'
import type { CheckState, ReasonCode } from './quality-checks'

const ICONS = { pass: Check, fail: TriangleAlert, unknown: Minus }
const COLORS = {
  pass: 'bg-emerald-50 text-emerald-700',
  fail: 'bg-amber-50 text-amber-800',
  unknown: 'bg-slate-100 text-slate-600',
}

export function QualityChecklist({ gate }: { gate: Pick<Readiness, 'checks' | 'showOverlay' | 'clearCount'> }) {
  function stateFor(reasons: ReasonCode[], expected = 1): CheckState {
    const checks = gate.checks.filter((check) => reasons.includes(check.reason))
    if (!gate.showOverlay || checks.length !== expected) return 'unknown'
    if (checks.some((check) => check.state === 'fail')) return 'fail'
    return checks.every((check) => check.state === 'pass') ? 'pass' : 'unknown'
  }

  const points = stateFor(['KEYPOINTS', 'KEYPOINTS_UNKNOWN'])
  const light = stateFor(['DARK', 'LIGHT_UNKNOWN', 'BACKLIGHT', 'BACKLIGHT_UNKNOWN'], 2)
  const people = stateFor(['NO_PERSON', 'MULTIPLE_PEOPLE', 'PEOPLE_UNKNOWN'])
  const framing = stateFor(['FRAMING', 'FRAMING_UNKNOWN'])
  const lightIssues: string[] = []
  if (gate.checks.some((check) => check.reason === 'DARK' && check.state === 'fail')) lightIssues.push('แสงน้อย')
  if (gate.checks.some((check) => check.reason === 'BACKLIGHT' && check.state === 'fail')) lightIssues.push('ย้อนแสง')
  const peopleIssue = gate.checks.some((check) => check.reason === 'NO_PERSON') ? 'ไม่พบคน' : 'หลายคน'

  let lightLabel = 'แสง'
  if (light === 'pass') lightLabel = 'แสงดี'
  if (light === 'fail') lightLabel = lightIssues.join(' · ')
  let peopleLabel = 'จำนวนคน'
  if (people === 'pass') peopleLabel = '1 คน'
  if (people === 'fail') peopleLabel = peopleIssue

  const items = [
    { key: 'points', state: points, label: `จุดร่างกาย ${points === 'unknown' ? '—' : gate.clearCount}/26`, issue: 'จุดร่างกายไม่ครบ' },
    { key: 'light', state: light, label: lightLabel, issue: lightIssues.join(' · ') },
    { key: 'people', state: people, label: peopleLabel, issue: peopleIssue },
    { key: 'framing', state: framing, label: framing === 'fail' ? 'ไม่เต็มตัว' : 'เต็มตัว', issue: 'ไม่เต็มตัว' },
  ]

  return <ul aria-label="ตรวจความพร้อม" aria-live="polite" className="flex flex-wrap gap-2">
    {items.map((item) => {
      const Icon = ICONS[item.state]
      const message = item.state === 'pass' ? 'ผ่าน' : item.state === 'unknown' ? 'ยังไม่มีผลตรวจ' : item.issue
      return <li key={item.key} aria-label={`${item.label}: ${message}`}
        className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums ${COLORS[item.state]}`}>
        <Icon size={16} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
        {item.label}
      </li>
    })}
  </ul>
}
