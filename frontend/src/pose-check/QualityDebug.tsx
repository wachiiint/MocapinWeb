import { QUALITY_CONFIG, QUALITY_SETTINGS, type QualityConfig, type QualitySetting } from './quality-config'
import type { Readiness } from './readiness'

export function QualityDebug({ config, onChange, gate }: {
  config: QualityConfig; onChange(config: QualityConfig): void; gate: Readiness
}) {
  return <details className="space-y-4 border-b border-slate-200 pb-5">
    <summary className="cursor-pointer text-sm font-medium">Experimental quality criteria and results</summary>
    <p className="text-sm">Experimental criteria · {config.version} · {JSON.stringify(config) === JSON.stringify(QUALITY_CONFIG) ? 'defaults' : 'session overrides active'}. Changes reset readiness. Values are not clinically validated.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(Object.keys(QUALITY_SETTINGS) as QualitySetting[]).map((key) => {
        const setting = QUALITY_SETTINGS[key]
        return <label key={key} className="flex flex-col gap-1 text-sm">{setting.label}
          <input type="number" min={setting.min} max={setting.max} step={setting.step} aria-label={setting.label} value={config[key]}
            className="min-h-10 rounded border border-slate-200 px-2"
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber
              if (Number.isFinite(value) && value >= setting.min && value <= setting.max) onChange({ ...config, [key]: value })
            }} />
        </label>
      })}
    </div>
    <button type="button" className="rounded border border-slate-200 px-3 py-2 text-sm" onClick={() => onChange({ ...QUALITY_CONFIG })}>Reset Experimental Criteria</button>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr><th>Reason Code</th><th>Check</th><th>Measured Value</th></tr></thead>
      <tbody>{gate.checks.map((check) => <tr key={check.reason} className="border-b border-slate-100">
        <td className="py-1 font-mono">{check.reason}</td><td>{check.state}</td><td>{check.value?.toFixed(3) ?? 'unknown'}</td>
      </tr>)}</tbody>
    </table></div>
  </details>
}
