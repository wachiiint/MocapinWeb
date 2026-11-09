import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePoseCamera } from '@/pose-check/usePoseCamera'
import { drawOverlay } from '@/pose-check/draw-overlay'
import { KEYPOINT_NAMES } from '@/pose-check/halpe26'
import { RuntimeDebug } from '@/pose-check/RuntimeDebug'
import { QUALITY_CONFIG } from '@/pose-check/quality-config'
import { QualityDebug } from '@/pose-check/QualityDebug'
import { useQualityGate } from '@/pose-check/useQualityGate'
import { REASONS } from '@/pose-check/quality-checks'
import { QUALITY_ADVICE } from '@/pose-check/quality-advice'
import { useVideoRecording } from '@/pose-check/useVideoRecording'
import { RecordingControls } from '@/pose-check/RecordingControls'
import { QualityChecklist } from '@/pose-check/QualityChecklist'

function App() {
  const { videoRef, ...camera } = usePoseCamera()
  const overlay = useRef<HTMLCanvasElement>(null)
  const [device, setDevice] = useState('')
  const [mirror, setMirror] = useState(false)
  const [config, setConfig] = useState({ ...QUALITY_CONFIG })
  const { frame, mode, models, error } = camera
  const active = mode === 'camera' || mode === 'starting'
  const gate = useQualityGate({ mode, models, error, frame, config, cameraFrameAt: camera.cameraFrameAt })
  const recording = useVideoRecording({ getStream: camera.getStream, frame, models,
    checkNow: gate.checkNow, config, cameraActive: mode === 'camera' })
  const recordingBusy = recording.state !== 'idle'
  const statusText = recording.state === 'recording' ? 'กำลังอัด' : recording.state === 'stopping' ? 'กำลังบันทึกวิดีโอ' :
    recording.result ? 'อัดเสร็จแล้ว' : recording.error ? 'เริ่มอัดไม่ได้' :
    recording.countdownSeconds !== null ? `เริ่มอัดใน ${recording.countdownSeconds} วินาที` :
    error || models === 'error' ? 'กล้องหรือระบบตรวจมีปัญหา' : models !== 'ready' ? 'กำลังเตรียมระบบตรวจ' :
    mode === 'off' ? 'กรุณาเปิดกล้อง' : mode === 'image' ? 'ตรวจภาพตัวอย่าง' :
    gate.status === 'Needs Adjustment' ? 'กรุณาปรับตำแหน่ง' : 'กำลังตรวจความพร้อม'
  const advice = recording.result ? 'ดาวน์โหลดวิดีโอก่อนล้างเพื่ออัดใหม่' : recording.error ? 'ตรวจกล้องแล้วกดลองใหม่' :
    models === 'recovering' ? 'กำลังกู้คืนระบบตรวจ กรุณารอสักครู่' : models !== 'ready' ? 'กรุณารอให้ระบบพร้อม' :
    mode === 'off' ? 'เมื่อพร้อม ระบบจะนับถอยหลังแล้วอัดให้อัตโนมัติ' :
    error ? 'ตรวจการเชื่อมต่อกล้อง แล้วเปิดกล้องอีกครั้ง' :
    gate.primaryReason ? QUALITY_ADVICE[gate.primaryReason.reason] :
    mode === 'image' ? 'ภาพตัวอย่างไม่เริ่มอัดวิดีโอ กรุณาเปิดกล้อง' : 'อยู่ในตำแหน่งนี้ ให้เห็นทั้งตัวและเท้าทั้งสองข้าง'
  const threshold = config.keypointScore
  const overlayFrame = gate.showOverlay ? frame : null

  useEffect(() => {
    if (overlay.current) drawOverlay(overlay.current, overlayFrame, threshold)
  }, [overlayFrame, threshold])

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-lg text-slate-900 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
          <div>
            <p className="text-sm font-medium text-slate-500">MOCAPCARE</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">เตรียมอัดวิดีโอ</h1>
          </div>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
              <h2 className="font-semibold">{mode === 'image' ? 'ภาพตัวอย่าง' : 'ภาพจากกล้อง'}</h2>
              <label className="flex min-h-12 items-center gap-2 text-lg">
                <input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} />กลับภาพกระจก
              </label>
            </div>
            <div className="relative min-h-60 bg-slate-950" style={{ transform: mirror ? 'scaleX(-1)' : undefined }}>
              <video ref={videoRef} autoPlay muted playsInline className={`w-full ${mode === 'camera' ? 'block' : 'hidden'}`} />
              {camera.imageUrl && <img src={camera.imageUrl} alt="ภาพตัวอย่างสำหรับตรวจความพร้อม" className="block w-full" />}
              {!active && mode !== 'image' && (
                <div className="flex aspect-video flex-col items-center justify-center gap-3 text-slate-300" style={{ transform: mirror ? 'scaleX(-1)' : undefined }}>
                  <CameraOff size={32} strokeWidth={1.5} /><p>เปิดกล้องเพื่อเริ่มตรวจความพร้อม</p>
                </div>
              )}
              <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
            <div role="status" aria-live="polite" aria-atomic="true" className={`space-y-2 border-y p-5 ${recording.state === 'recording' ? 'border-red-200 bg-red-50 text-red-900' : recording.countdownSeconds !== null ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
              <p className="text-2xl font-bold tabular-nums sm:text-3xl">{statusText}</p>
              <p className="text-lg">{advice}</p>
              {models === 'error' && <Button className="min-h-12 text-lg" variant="outline" onClick={camera.retryModels}>ลองตรวจใหม่</Button>}
            </div>
            <div className="flex flex-wrap items-end gap-3 p-4">
              <label className="min-w-48 flex-1 space-y-1 text-lg font-medium">
                <span>กล้อง</span>
                <select value={device} disabled={active} onChange={(event) => setDevice(event.target.value)} className="min-h-12 w-full rounded-md border border-slate-200 bg-white px-3">
                  <option value="">กล้องเริ่มต้น</option>
                  {camera.devices.map((item, index) => <option key={item.deviceId || index} value={item.deviceId}>{item.label || `กล้อง ${index + 1}`}</option>)}
                </select>
              </label>
              <Button className="min-h-12 rounded-full bg-[#0B65FF] px-5 text-lg text-white hover:bg-[#0052CC]" disabled={models !== 'ready' || active || recordingBusy} onClick={() => void camera.start(device)}>
                <Camera size={18} />{mode === 'starting' ? 'กำลังเปิดกล้อง…' : 'เปิดกล้อง'}
              </Button>
              <Button className="min-h-12 rounded-full px-5 text-lg" variant="outline" disabled={mode === 'off'} onClick={() => { recording.stop('camera-stopped'); camera.stop() }}>{mode === 'image' ? 'ล้างภาพ' : 'ปิดกล้อง'}</Button>
            </div>
          </section>

          <aside className="space-y-4">
            <RecordingControls recording={recording} canStart={gate.canStartRecording} />
            <QualityChecklist gate={gate} />
            <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold">ทดสอบด้วยภาพ</h2>
              <label className="block space-y-2 text-lg">
                <span>เลือกภาพตัวอย่าง</span>
                <input type="file" accept="image/jpeg,image/png" disabled={models !== 'ready' || active || camera.working || recordingBusy} className="block min-h-12 w-full text-lg file:min-h-12 file:mr-2 file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-2" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void camera.inspectImage(file) }} />
              </label>
            </section>
          </aside>
        </div>

        <details className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-semibold">Debug · Runtime, timings & HALPE26 scores</summary>
          <p className="my-3 text-sm">{gate.status} · RTMPose-s HALPE26 · {camera.runtimeMode}</p>
          {error && <p role="alert" className="break-words text-red-700">{error}</p>}
          <dl className="grid grid-cols-2 gap-4">
            <Metric label="Clear Keypoints" value={`${frame ? gate.clearCount : '—'} / 26`} />
            <Metric label="People Detected" value={frame ? String(frame.people.length) : '—'} />
            <Metric label="Camera FPS" value={mode === 'camera' ? camera.previewFps.toFixed(1) : '—'} />
            <Metric label="Pose Updates / s" value={mode === 'camera' ? camera.inferenceFps.toFixed(1) : '—'} />
            <Metric label="Inference Time" value={camera.latency ? `${camera.latency.toFixed(0)} ms` : '—'} />
            <Metric label="Frame Size" value={frame ? `${frame.width} × ${frame.height}` : '—'} />
          </dl>
          {gate.issues.map((issue) => <p key={issue.reason} className="my-2 text-sm">{REASONS[issue.reason].title}: {REASONS[issue.reason].advice}</p>)}
          <RuntimeDebug mode={camera.runtimeMode} info={camera.runtimeInfo}
            disabled={active || camera.working || recordingBusy || models === 'loading' || models === 'recovering'}
            onModeChange={camera.changeRuntimeMode} latest={camera.timing} statistics={camera.statistics}
            sampleCount={camera.sampleCount} recoveryReason={camera.recoveryReason} />
          <fieldset disabled={recordingBusy} className="min-w-0">
            <QualityDebug config={config} onChange={setConfig} gate={gate} />
          </fieldset>
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
