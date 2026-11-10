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
  const [config, setConfig] = useState({ ...QUALITY_CONFIG })
  const { frame, mode, models, error } = camera
  const active = mode === 'camera' || mode === 'starting'
  const gate = useQualityGate({ mode, models, error, frame, config, cameraFrameAt: camera.cameraFrameAt })
  const recording = useVideoRecording({ getStream: camera.getStream, frame, models,
    checkNow: gate.checkNow, config, cameraActive: mode === 'camera' })
  const recordingBusy = recording.state !== 'idle'
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
    <main className="min-h-screen w-full bg-white text-slate-900">
      <header className="border-b border-slate-200/80 bg-[#F4F8FC] px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B65FF] text-sm font-bold text-white">M</span>
          <span className="text-lg font-bold tracking-tight"><span className="text-[#0B65FF]">MOCAP</span>CARE</span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8 lg:py-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ตั้งกล้องและบันทึกวิดีโอ</h1>
        <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF5FF] text-[#0B65FF]"><Camera size={20} aria-hidden="true" /></span>
            <h2 className="text-lg font-bold">{mode === 'image' ? 'ภาพตัวอย่าง' : 'กล้องหลัก'}</h2>
          </div>
          <QualityChecklist gate={gate} />
          <div className="relative overflow-hidden rounded-2xl bg-slate-950">
            <div className="relative min-h-60" style={{ transform: 'scaleX(-1)' }}>
              <video ref={videoRef} autoPlay muted playsInline className={`w-full ${mode === 'camera' ? 'block' : 'hidden'}`} />
              {camera.imageUrl && <img src={camera.imageUrl} alt="ภาพตัวอย่างสำหรับตรวจความพร้อม" className="block w-full" />}
              {!active && mode !== 'image' && (
                <div className="flex aspect-video flex-col items-center justify-center gap-3 px-5 text-center text-slate-300" style={{ transform: 'scaleX(-1)' }}>
                  <CameraOff size={36} strokeWidth={1.5} aria-hidden="true" /><p className="text-lg">เปิดกล้องเพื่อเริ่มตรวจความพร้อม</p>
                </div>
              )}
              <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
            {recording.countdownSeconds !== null && <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/70 p-5 text-center text-white">
              <p className="text-lg font-semibold text-blue-200">เตรียมตัว เริ่มอัดใน</p>
              <p className="text-7xl font-extrabold tabular-nums sm:text-8xl">{recording.countdownSeconds}</p>
              <p className="text-lg">วินาที</p>
            </div>}
            {recording.state === 'recording' && <p role="status" className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-black/65 px-4 py-2 text-lg font-semibold text-white">
              <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />กำลังอัด
            </p>}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 basis-48 space-y-1 text-lg font-medium">
              <span>กล้อง</span>
              <select value={device} disabled={active} onChange={(event) => setDevice(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3">
                <option value="">กล้องเริ่มต้น</option>
                {camera.devices.map((item, index) => <option key={item.deviceId || index} value={item.deviceId}>{item.label || `กล้อง ${index + 1}`}</option>)}
              </select>
            </label>
            <Button className="min-h-12 rounded-full bg-[#0B65FF] px-6 text-lg text-white hover:bg-[#0052CC]" disabled={models !== 'ready' || active || recordingBusy} onClick={() => void camera.start(device)}>
              <Camera size={18} />{mode === 'starting' ? 'กำลังเปิดกล้อง…' : 'เปิดกล้อง'}
            </Button>
            <Button className="min-h-12 rounded-full px-5 text-lg" variant="outline" disabled={mode === 'off'} onClick={() => { recording.stop('camera-stopped'); camera.stop() }}>{mode === 'image' ? 'ล้างภาพ' : 'ปิดกล้อง'}</Button>
          </div>
          {(error || models === 'error') && <div role="alert" className="flex flex-wrap items-center gap-3 text-lg text-red-700">
            <p>กล้องหรือระบบตรวจมีปัญหา</p>
            {models === 'error' && <Button className="min-h-12 rounded-full text-lg" variant="outline" onClick={camera.retryModels}>ลองตรวจใหม่</Button>}
          </div>}
        </section>
        <RecordingControls recording={recording} canStart={gate.canStartRecording} />
        <details className="rounded-2xl border border-slate-200/80 bg-[#F6F9FF] p-5">
          <summary className="min-h-12 cursor-pointer content-center text-lg font-semibold">Debug</summary>
          <div className="mt-4 space-y-4">
            <p className="text-lg text-slate-600">{advice}</p>
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">ทดสอบด้วยภาพ</h2>
              <label className="block space-y-2 text-lg">
                <span>เลือกภาพตัวอย่าง</span>
                <input type="file" accept="image/jpeg,image/png" disabled={models !== 'ready' || active || camera.working || recordingBusy} className="block min-h-12 w-full text-sm file:mr-2 file:min-h-12 file:rounded-full file:border file:border-slate-200 file:bg-white file:px-4" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void camera.inspectImage(file) }} />
              </label>
            </section>
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
