import { useEffect, useRef, useState } from 'react'
import type { QualityConfig } from './quality-config'
import type { RecordingSnapshot, RecordingStopReason, RecordingQualityReport } from './recording-report'
import { recordVideo } from './video-recorder'
import type { PoseFrame } from './halpe26'
import type { Readiness } from './readiness'
import { recordingCountdown } from './recording-countdown'
import type { CameraTiming } from '@/lib/camera-clock'

type Result = { videoUrl: string; reportUrl: string; report: RecordingQualityReport; filename: string; extension: string; timingUrl?: string }
type Props = {
  getStream(): MediaStream | null
  frame: PoseFrame | null
  models: string
  checkNow(now: number): Readiness
  config: QualityConfig
  cameraActive: boolean
  canRecord?: boolean
  autoStart?: boolean
}

export function useVideoRecording({ getStream, frame, models, checkNow, config, cameraActive, canRecord = true, autoStart = true }: Props) {
  const session = useRef<ReturnType<typeof recordVideo> | null>(null)
  const snapshot = useRef({ frame, models, checkNow }), source = useRef(getStream)
  const urls = useRef<string[]>([]), mounted = useRef(false)
  const [state, setState] = useState<'idle' | 'recording' | 'stopping'>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null)
  const countdown = useRef(recordingCountdown())
  const latestStart = useRef<(() => void) | null>(null)
  const activeTiming = useRef<CameraTiming | null>(null)
  const [activeTakeId, setActiveTakeId] = useState<string | undefined>()
  useEffect(() => {
    snapshot.current = { frame, models, checkNow }; source.current = getStream; session.current?.sample()
  }, [frame, models, checkNow, getStream])
  useEffect(() => {
    mounted.current = true
    const clock = countdown.current
    const visibility = () => {
      session.current?.sample()
      countdown.current.reset(); setCountdownSeconds(null)
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false; session.current?.dispose(); session.current = null
      clock.reset()
      urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current = []
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  function stop(reason: RecordingStopReason = 'user-stopped') {
    if (!session.current) return
    setState('stopping'); session.current.stop(reason)
  }
  useEffect(() => {
    if (!cameraActive && session.current) { setState('stopping'); session.current.stop('camera-ended') }
  }, [cameraActive])

  useEffect(() => {
    const clock = countdown.current
    clock.reset()
    const tick = () => {
      if (!autoStart || !canRecord || !cameraActive || state !== 'idle' || result || error) { setCountdownSeconds(null); return }
      const now = performance.now(), current = snapshot.current
      const gate = current.checkNow(now)
      const ready = document.visibilityState === 'visible' && current.models === 'ready' &&
        gate.canStartRecording && !!source.current()?.getVideoTracks().some((track) => track.readyState === 'live')
      const next = clock.tick(now, ready, `${gate.runKey}:${gate.passingSince}`, config.maxFrameAgeMs)
      setCountdownSeconds(next.seconds)
      if (next.start) latestStart.current?.()
    }
    const initial = window.setTimeout(tick, 0)
    if (!autoStart || !canRecord || !cameraActive || state !== 'idle' || result || error) return () => clearTimeout(initial)
    const timer = window.setInterval(tick, 100)
    return () => { clearTimeout(initial); clearInterval(timer); clock.reset() }
  }, [autoStart, canRecord, cameraActive, state, result, error, config.maxFrameAgeMs])

  function start(timing?: CameraTiming): boolean {
    // The session ref prevents duplicate starts before React commits the new state.
    if (!canRecord || session.current || result) return false
    setError('')
    try {
      if (!checkNow(performance.now()).canStartRecording || document.visibilityState !== 'visible') return false
      if (typeof MediaRecorder === 'undefined') throw new Error('เบราว์เซอร์นี้ไม่รองรับการอัดวิดีโอ')
      const stream = getStream()
      if (!stream || !stream.getVideoTracks().some((track) => track.readyState === 'live')) throw new Error('กรุณาเปิดกล้องอีกครั้ง')
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const settings = stream.getVideoTracks()[0].getSettings()
      // Start with the current inputs; watchdog samples use the latest committed inputs.
      snapshot.current = { frame, models, checkNow }; source.current = getStream
      activeTiming.current = timing ? { ...timing } : null
      setActiveTakeId(timing?.takeId)
      session.current = recordVideo(recorder, {
        config: { ...config }, source: { width: settings.width ?? 0, height: settings.height ?? 0 },
        readSnapshot: (time): RecordingSnapshot => {
          const current = snapshot.current
          return { frame: current.frame, readiness: current.checkNow(time),
            visible: document.visibilityState === 'visible', modelsReady: current.models === 'ready' }
        },
        sourceAlive: () => source.current()?.getVideoTracks().some((track) => track.readyState === 'live') ?? false,
        onTick: (time) => { if (mounted.current) setElapsedMs(time) },
        onStarted: (at) => { if (activeTiming.current) { activeTiming.current.nativeStartAt = at; activeTiming.current.estimatedNativeStartServerMs = at + activeTiming.current.clockOffsetMs } },
        onError: () => { if (mounted.current) setError('การอัดมีปัญหา วิดีโอที่เก็บได้อาจไม่สมบูรณ์') },
        onComplete: (video, report) => {
          session.current = null
          if (!mounted.current) return
          const videoUrl = video.size ? URL.createObjectURL(video) : ''
          const reportUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
          const timing = activeTiming.current ? { ...activeTiming.current } : undefined
          const timingUrl = timing ? URL.createObjectURL(new Blob([JSON.stringify(timing, null, 2)], { type: 'application/json' })) : undefined
          urls.current = [videoUrl, reportUrl, timingUrl ?? ''].filter(Boolean)
          setResult({ videoUrl, reportUrl, report, timingUrl,
            filename: timing ? `mocapin-${timing.takeId}-${timing.role === 'primary' ? 'cam1' : 'cam2'}` : `mocapin-${report.startedAtIso.replace(/[:.]/g, '-')}`,
            extension: video.type.includes('mp4') ? 'mp4' : video.type.includes('webm') ? 'webm' : 'bin' })
          setElapsedMs(report.durationMs); setState('idle')
        },
      })
      setElapsedMs(0); setState('recording')
      return true
    } catch {
      session.current = null; setState('idle')
      setError('เริ่มอัดไม่ได้ กรุณาตรวจกล้องแล้วกดลองใหม่')
      return false
    }
  }
  useEffect(() => { latestStart.current = start })

  function clear() {
    if (session.current) return
    urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current = []
    setResult(null); setError(''); setElapsedMs(0)
    activeTiming.current = null
    setActiveTakeId(undefined)
  }
  function retry() { countdown.current.reset(); setError('') }
  return { state, elapsedMs, error, result, countdownSeconds, retry, start, stop, clear, activeTakeId }
}
