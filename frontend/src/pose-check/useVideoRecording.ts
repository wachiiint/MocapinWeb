import { useEffect, useRef, useState } from 'react'
import type { QualityConfig } from './quality-config'
import type { RecordingSnapshot, RecordingStopReason, RecordingQualityReport } from './recording-report'
import { recordVideo } from './video-recorder'
import type { PoseFrame } from './halpe26'
import type { Readiness } from './readiness'

type Result = { videoUrl: string; reportUrl: string; report: RecordingQualityReport; filename: string; extension: string }
type Props = {
  getStream(): MediaStream | null
  frame: PoseFrame | null
  models: string
  checkNow(now: number): Readiness
  config: QualityConfig
  cameraActive: boolean
}

export function useVideoRecording({ getStream, frame, models, checkNow, config, cameraActive }: Props) {
  const session = useRef<ReturnType<typeof recordVideo> | null>(null)
  const snapshot = useRef({ frame, models, checkNow }), source = useRef(getStream)
  const urls = useRef<string[]>([]), mounted = useRef(false)
  const [state, setState] = useState<'idle' | 'recording' | 'stopping'>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  useEffect(() => {
    snapshot.current = { frame, models, checkNow }; source.current = getStream; session.current?.sample()
  }, [frame, models, checkNow, getStream])
  useEffect(() => {
    mounted.current = true
    const visibility = () => session.current?.sample()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false; session.current?.dispose(); session.current = null
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

  function start() {
    // The ref also prevents a second click before React commits the disabled button.
    if (session.current || result) return
    setError('')
    try {
      if (typeof MediaRecorder === 'undefined') throw new Error('Video recording is unavailable in this browser.')
      const stream = getStream()
      if (!stream || !stream.getVideoTracks().some((track) => track.readyState === 'live')) throw new Error('Start the camera before recording.')
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const settings = stream.getVideoTracks()[0].getSettings()
      // Use the current render at the click boundary; subsequent watchdog samples use the latest committed inputs.
      snapshot.current = { frame, models, checkNow }; source.current = getStream
      session.current = recordVideo(recorder, {
        config: { ...config }, source: { width: settings.width ?? 0, height: settings.height ?? 0 },
        readSnapshot: (time): RecordingSnapshot => {
          const current = snapshot.current
          return { frame: current.frame, readiness: current.checkNow(time),
            visible: document.visibilityState === 'visible', modelsReady: current.models === 'ready' }
        },
        sourceAlive: () => source.current()?.getVideoTracks().some((track) => track.readyState === 'live') ?? false,
        onTick: (time) => { if (mounted.current) setElapsedMs(time) },
        onError: (message) => { if (mounted.current) setError(message) },
        onComplete: (video, report) => {
          session.current = null
          if (!mounted.current) return
          const videoUrl = video.size ? URL.createObjectURL(video) : ''
          const reportUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
          urls.current = [videoUrl, reportUrl].filter(Boolean)
          setResult({ videoUrl, reportUrl, report, filename: `mocapin-${report.startedAtIso.replace(/[:.]/g, '-')}`,
            extension: video.type.includes('mp4') ? 'mp4' : video.type.includes('webm') ? 'webm' : 'bin' })
          setElapsedMs(report.durationMs); setState('idle')
        },
      })
      setElapsedMs(0); setState('recording')
    } catch (cause) {
      session.current = null; setState('idle')
      setError(cause instanceof Error ? cause.message : 'Recording could not start.')
    }
  }
  function clear() {
    if (session.current) return
    urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current = []
    setResult(null); setError(''); setElapsedMs(0)
  }
  return { state, elapsedMs, error, result, start, stop, clear }
}
