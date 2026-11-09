import type { RuntimeInfo, RuntimeMode, TimingSample } from './halpe26'
import { TIMING_LABELS, type summarizeTimings } from './runtime-stats'

type Props = {
  mode: RuntimeMode; info: RuntimeInfo | null; disabled: boolean; onModeChange(mode: RuntimeMode): void
  latest: TimingSample | null; statistics: ReturnType<typeof summarizeTimings>; sampleCount: number; recoveryReason: string
}

export function RuntimeDebug({ mode, info, disabled, onModeChange, latest, statistics, sampleCount, recoveryReason }: Props) {
  const milliseconds = (value?: number) => value === undefined ? '—' : value.toFixed(1)
  return (
    <section className="my-4 space-y-4 border-b border-slate-200 pb-5">
      <label className="flex flex-wrap items-center gap-3 text-sm font-medium">Runtime Mode
        <select value={mode} disabled={disabled} onChange={(event) => onModeChange(event.target.value as RuntimeMode)} className="min-h-11 rounded-md border border-slate-200 bg-white px-3">
          <option value="auto">Auto</option><option value="wasm">WASM</option>
        </select>
      </label>
      <p className="text-xs text-slate-500">Stop the camera and wait for processing to finish before switching runtime. WebGPU sessions may use WASM operators; this is not a claim that every operation runs on GPU.</p>
      {info && <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {(['detector', 'pose'] as const).map((name) => <div key={name}>
          <dt className="font-medium capitalize">{name}</dt>
          <dd>{info[name].provider === 'webgpu' ? 'WebGPU requested · WASM ops possible' : 'WASM · 1 thread'}</dd>
          {info[name].verification && <dd className="mt-1 text-xs text-slate-600">{info[name].verification === 'passed' ? 'Output checked against WASM on one input frame' : 'Pending verification · using WASM results until a positive match'}</dd>}
          {info[name].fallbackReason && <dd className="mt-1 break-words text-xs text-amber-800">{info[name].fallbackReason}</dd>}
        </div>)}
      </dl>}
      {recoveryReason && <p className="text-sm text-amber-800">Recovered with WASM: {recoveryReason}</p>}
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm font-medium">Processing timings</summary>
        <p className="text-xs text-slate-500">Camera timing window: {sampleCount} / 60 frames. The first 3 frames after each session change or camera start are excluded. Still images show latest timings only. Values are wall-clock milliseconds, including CPU/GPU transfers.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200"><th className="py-2">Stage (ms)</th><th>Latest</th><th>Median</th><th>P95</th></tr></thead>
            <tbody>{(Object.keys(TIMING_LABELS) as (keyof TimingSample)[]).map((key) => <tr key={key} className="border-b border-slate-100">
              <th className="py-2 font-normal">{TIMING_LABELS[key]}</th>
              <td className="font-mono">{milliseconds(latest?.[key])}</td>
              <td className="font-mono">{milliseconds(statistics[key]?.median)}</td>
              <td className="font-mono">{milliseconds(statistics[key]?.p95)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
