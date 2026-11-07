import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePoseCamera } from '@/pose-check/usePoseCamera'
import { drawOverlay } from '@/pose-check/draw-overlay'
import { isClear, KEYPOINT_NAMES, POSE_CONFIG } from '@/pose-check/halpe26'
import { RuntimeDebug } from '@/pose-check/RuntimeDebug'

function App() {
  const { videoRef, ...camera } = usePoseCamera()
  const overlay = useRef<HTMLCanvasElement>(null)
  const [device, setDevice] = useState('')
  const [mirror, setMirror] = useState(false)
  const [threshold, setThreshold] = useState<number>(POSE_CONFIG.keypointScore)
  const { frame, mode, models, error } = camera
  const active = mode === 'camera' || mode === 'starting'
  const clear = frame?.keypoints.filter((point) => isClear(point, frame.width, frame.height, threshold)).length ?? 0
  const unclear = frame?.keypoints.flatMap((point, index) =>
    isClear(point, frame.width, frame.height, threshold) ? [] : [KEYPOINT_NAMES[index]]) ?? []
  const warnings: { reason: string; action: string }[] = []
  if (frame?.people.length === 0) warnings.push({ reason: 'No Person Detected', action: 'Step into the camera view.' })
  if (frame && frame.people.length > 1) warnings.push({ reason: 'Multiple People Detected', action: 'Keep only the person being assessed in view. Pose is shown for the largest person.' })
  if (unclear.length) warnings.push({ reason: `Keypoints Not Clear: ${unclear.join(', ')}`, action: 'Keep your whole body and feet visible. Adjust your position or lighting.' })
  if (mode === 'camera' && camera.latency > POSE_CONFIG.staleMs) warnings.push({ reason: 'Pose Updates Too Slow', action: 'Close demanding apps. Stale skeletons are hidden.' })
  if (camera.stalled) warnings.push({ reason: 'Camera Frames Interrupted', action: 'Check the camera connection and close other camera apps.' })

  useEffect(() => {
    if (overlay.current) drawOverlay(overlay.current, frame, threshold)
  }, [frame, threshold])

  const status = error ? 'Error' : models === 'recovering' ? 'Recovering with WASM' : models === 'loading' ? 'Loading Models' : mode === 'off' ? 'Camera Off' :
    warnings.length ? 'Needs Adjustment' : 'Checking'

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
          <div>
            <p className="text-sm font-medium text-slate-500">Mocapin · Pose Check</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Realtime camera check</h1>
          </div>
          <span className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">RTMPose-s HALPE26 · {camera.runtimeMode === 'auto' ? 'Auto' : 'WASM'}</span>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
              <h2 className="font-semibold">{mode === 'image' ? 'Still image test' : 'Camera preview'}</h2>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} />Mirror preview
              </label>
            </div>
            <div className="relative min-h-60 bg-slate-950" style={{ transform: mirror ? 'scaleX(-1)' : undefined }}>
              <video ref={videoRef} autoPlay muted playsInline className={`w-full ${mode === 'camera' ? 'block' : 'hidden'}`} />
              {camera.imageUrl && <img src={camera.imageUrl} alt="Local still image for pose testing" className="block w-full" />}
              {!active && mode !== 'image' && (
                <div className="flex aspect-video flex-col items-center justify-center gap-3 text-slate-300" style={{ transform: mirror ? 'scaleX(-1)' : undefined }}>
                  <CameraOff size={32} strokeWidth={1.5} /><p>Start your camera to see live pose detection.</p>
                </div>
              )}
              <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
            <div className="flex flex-wrap items-end gap-3 p-4">
              <label className="min-w-48 flex-1 space-y-1 text-sm font-medium">
                <span>Camera</span>
                <select value={device} disabled={active} onChange={(event) => setDevice(event.target.value)} className="min-h-12 w-full rounded-md border border-slate-200 bg-white px-3">
                  <option value="">Default camera</option>
                  {camera.devices.map((item, index) => <option key={item.deviceId || index} value={item.deviceId}>{item.label || `Camera ${index + 1}`}</option>)}
                </select>
              </label>
              <Button className="min-h-12 rounded-md px-5" disabled={models !== 'ready' || active} onClick={() => void camera.start(device)}>
                <Camera size={18} />{mode === 'starting' ? 'Starting Camera…' : 'Start Camera'}
              </Button>
              <Button className="min-h-12 rounded-md px-5" variant="outline" disabled={mode === 'off'} onClick={camera.stop}>{mode === 'image' ? 'Clear Image' : 'Stop Camera'}</Button>
            </div>
          </section>

          <aside className="space-y-4">
            <section aria-live="polite" className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Status</h2><span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-medium">{status}</span></div>
              {error && <p role="alert" className="break-words text-sm text-red-700">{error}</p>}
              {models === 'loading' && <p className="text-sm text-slate-600">Loading the default models. The first load may take a moment.</p>}
              {models === 'recovering' && <p className="text-sm text-amber-800">GPU access was lost. Rebuilding with WASM; the camera can stay on.</p>}
              {models === 'error' && <Button variant="outline" onClick={camera.retryModels}>Retry Models</Button>}
              <dl className="grid grid-cols-2 gap-4">
                <Metric label="Clear Keypoints" value={`${frame ? clear : '—'} / 26`} />
                <Metric label="People Detected" value={frame ? String(frame.people.length) : '—'} />
                <Metric label="Camera FPS" value={mode === 'camera' ? camera.previewFps.toFixed(1) : '—'} />
                <Metric label="Pose Updates / s" value={mode === 'camera' ? camera.inferenceFps.toFixed(1) : '—'} />
                <Metric label="Inference Time" value={camera.latency ? `${camera.latency.toFixed(0)} ms` : '—'} />
                <Metric label="Frame Size" value={frame ? `${frame.width} × ${frame.height}` : '—'} />
              </dl>
              {warnings.map((warning) => <div key={warning.reason} className="border-t border-slate-200 pt-3 text-sm"><p className="font-medium text-amber-800">{warning.reason}</p><p className="mt-1 text-slate-600">{warning.action}</p></div>)}
              {frame && !warnings.length && <p className="text-sm text-teal-800">All 26 keypoints are clear at the selected model-score threshold.</p>}
              {mode === 'camera' && !frame && <p className="text-sm text-slate-600">Waiting for a recent pose result…</p>}
              <p className="border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">Experimental pose visibility only. Lighting, blur, and recording-readiness checks are not available yet. Images stay on this device.</p>
            </section>
            <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold">Test without a camera</h2>
              <label className="block space-y-2 text-sm">
                <span>Test Still Image</span>
                <input type="file" accept="image/jpeg,image/png" disabled={models !== 'ready' || active || camera.working} className="block w-full text-sm file:mr-2 file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-2" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void camera.inspectImage(file) }} />
              </label>
            </section>
          </aside>
        </div>

        <details className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-semibold">Debug · Runtime, timings & HALPE26 scores</summary>
          <RuntimeDebug mode={camera.runtimeMode} info={camera.runtimeInfo}
            disabled={active || camera.working || models === 'loading' || models === 'recovering'}
            onModeChange={camera.changeRuntimeMode} latest={camera.timing} statistics={camera.statistics}
            sampleCount={camera.sampleCount} recoveryReason={camera.recoveryReason} />
          <label className="my-4 flex flex-wrap items-center gap-3 text-sm">Experimental model-score threshold
            <input type="range" min="0.05" max="0.95" step="0.05" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />{threshold.toFixed(2)}
          </label>
          <p className="mb-3 text-xs text-slate-500">Model scores are not accuracy percentages. Inference targets 10 updates/s; actual speed depends on this device.</p>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {KEYPOINT_NAMES.map((name, index) => <div key={name} className="flex justify-between border-b border-slate-100 py-1 text-sm"><span>{index}. {name}</span><span className="font-mono">{frame?.keypoints[index]?.score.toFixed(3) ?? '—'}</span></div>)}
          </div>
        </details>
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>
}

export default App
