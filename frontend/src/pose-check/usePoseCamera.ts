import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_MODELS, POSE_CONFIG, type PoseFrame, type WorkerReply, type WorkerRequest,
  type RuntimeInfo, type RuntimeMode, type TimingSample } from './halpe26'
import { newTimingWindow, recordTiming, summarizeTimings } from './runtime-stats'
import { observeCameraFrames } from './camera-frames'
import { defaultRuntimeMode, estimateDevice } from './device-info'
import { newFramePacing, recordFrameCompletion, takeCameraFrame } from './frame-pacing'
import { requestCameraSource, type CameraFacing } from './camera-selection'

type Mode = 'off' | 'starting' | 'camera' | 'image'

export function usePoseCamera(modelsRequested: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cancelCapture = useRef<(() => void) | null>(null), generation = useRef(0), busy = useRef(false)
  const modeRef = useRef<Mode>('off'), objectUrl = useRef('')
  const imageSource = useRef<File | null>(null)
  const latest = useRef<PoseFrame | null>(null)
  const workerReady = useRef(false)
  const timingWindow = useRef(newTimingWindow())
  const pacing = useRef(newFramePacing(estimateDevice().kind))
  const cameraFrameTime = useRef<number | null>(null)
  const preferredFacing = useRef<CameraFacing>('user')
  const [cameraFacing, setCameraFacing] = useState<CameraFacing | null>(null)
  const [mode, setMode] = useState<Mode>('off')
  const [models, setModels] = useState<'loading' | 'recovering' | 'ready' | 'error'>('loading')
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(() => defaultRuntimeMode())
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null)
  const [recoveryReason, setRecoveryReason] = useState('')
  const [timing, setTiming] = useState<TimingSample | null>(null)
  const [statistics, setStatistics] = useState<ReturnType<typeof summarizeTimings>>({})
  const [sampleCount, setSampleCount] = useState(0)
  const [error, setError] = useState('')
  const [frame, setFrame] = useState<PoseFrame | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [working, setWorking] = useState(false)
  const [previewFps, setPreviewFps] = useState(0)
  const [inferenceFps, setInferenceFps] = useState(0)
  const [latency, setLatency] = useState(0)
  const [imageUrl, setImageUrl] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [cameraFrameAt, setCameraFrameAt] = useState<number | null>(null)

  const stop = useCallback(() => {
    generation.current++
    cancelCapture.current?.(); cancelCapture.current = null
    modeRef.current = 'off'
    streamRef.current?.getTracks().forEach((track) => { track.onended = null; track.stop() })
    streamRef.current = null
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = ''
    imageSource.current = null
    latest.current = null
    cameraFrameTime.current = null; setCameraFrameAt(null)
    pacing.current = newFramePacing(estimateDevice().kind)
    timingWindow.current = newTimingWindow()
    setTiming(null); setStatistics({}); setSampleCount(0)
    setImageUrl(''); setFrame(null); setMode('off'); setPreviewFps(0); setInferenceFps(0); setLatency(0)
  }, [])

  const refreshDevices = useCallback(async () => {
    try {
      const available = await navigator.mediaDevices.enumerateDevices()
      setDevices(available.filter((device) => device.kind === 'videoinput'))
    }
    catch { /* Device labels may be unavailable before camera permission. */ }
  }, [])

  useEffect(() => {
    if (!modelsRequested) return
    busy.current = false
    let worker: Worker
    let recovered = false
    let count = 0, since = performance.now(), measuredGeneration = -1
    const fail = (message: string) => {
      stop(); busy.current = false; workerReady.current = false
      worker?.terminate(); setWorking(false); setModels('error'); setError(message)
    }
    const receive = (source: Worker, event: MessageEvent<WorkerReply>) => {
      if (source !== workerRef.current) return
      const message = event.data
      if (message.type === 'ready') {
        workerReady.current = true; setModels('ready'); setRuntimeInfo(message.runtime)
        if (recovered && modeRef.current === 'image' && imageSource.current) {
          const current = generation.current
          busy.current = true; setWorking(true)
          void createImageBitmap(imageSource.current).then((bitmap) => {
            if (source !== workerRef.current || current !== generation.current) {
              bitmap.close()
              if (source === workerRef.current) { busy.current = false; setWorking(false) }
              return
            }
            source.postMessage({ type: 'frame', bitmap, capturedAt: performance.now(), generation: current } satisfies WorkerRequest, [bitmap])
          }).catch((cause: unknown) => {
            if (source === workerRef.current && current === generation.current) fail(String(cause))
          })
        }
        void refreshDevices(); return
      }
      if (message.type === 'recover') {
        if (recovered || runtimeMode === 'wasm') { fail(`WASM recovery failed: ${message.reason}`); return }
        recovered = true; workerReady.current = false; busy.current = false
        latest.current = null; timingWindow.current = newTimingWindow()
        pacing.current = newFramePacing(estimateDevice().kind)
        setFrame(null); setWorking(false); setModels('recovering'); setRecoveryReason(message.reason)
        setTiming(null); setStatistics({}); setSampleCount(0); setInferenceFps(0); setLatency(0)
        count = 0; since = performance.now(); measuredGeneration = -1
        launch('wasm'); return
      }
      if (message.type === 'error') { fail(message.message); return }
      busy.current = false; setWorking(false)
      const result = message.frame
      if (result.generation !== generation.current || modeRef.current === 'off') return
      setLatency(result.inferenceMs)
      setRuntimeInfo(result.runtime)
      const now = performance.now()
      const sample = { ...result.timings, frameAgeMs: now - result.capturedAt }
      setTiming(sample)
      if (modeRef.current === 'camera') {
        recordFrameCompletion(pacing.current, now, result.capturedAt, result.runtime.revision)
        recordTiming(timingWindow.current, result.runtime.revision, sample)
        setStatistics(summarizeTimings(timingWindow.current)); setSampleCount(timingWindow.current.samples.length)
        if (measuredGeneration !== result.generation) { measuredGeneration = result.generation; count = 0; since = now }
        count++
        if (now - since >= 1000) { setInferenceFps(count * 1000 / (now - since)); count = 0; since = now }
      }
      if (modeRef.current === 'image' || now - result.capturedAt <= POSE_CONFIG.staleMs) {
        latest.current = result; setFrame(result)
      }
    }
    const asset = (filename: string) => new URL(`${import.meta.env.BASE_URL}${filename}`, location.origin).href
    function launch(selected: RuntimeMode) {
      worker?.terminate()
      workerReady.current = false
      worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
      const source = worker
      workerRef.current = source
      source.onmessage = (event: MessageEvent<WorkerReply>) => receive(source, event)
      source.onerror = () => { if (source === workerRef.current) fail('Pose worker failed. Retry models before starting the camera.') }
      source.postMessage({ type: 'init', detectorUrl: asset(DEFAULT_MODELS.detector), poseUrl: asset(DEFAULT_MODELS.pose), runtimeMode: selected } satisfies WorkerRequest)
    }
    launch(runtimeMode)
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
    const watchdog = window.setInterval(() => {
      if (modeRef.current === 'camera') setCameraFrameAt(cameraFrameTime.current)
      if (modeRef.current === 'camera' && latest.current && performance.now() - latest.current.capturedAt > POSE_CONFIG.staleMs) {
        latest.current = null; setFrame(null); setInferenceFps(0)
      }
    }, 100)
    return () => {
      clearInterval(watchdog); navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
      stop(); worker.terminate(); workerRef.current = null; workerReady.current = false
    }
  }, [modelsRequested, attempt, runtimeMode, refreshDevices, stop])

  async function start(deviceId: string, facing = preferredFacing.current, strictFacing = false) {
    if (models !== 'ready' || modeRef.current === 'starting') return
    stop(); setError('')
    const current = generation.current
    modeRef.current = 'starting'; setMode('starting')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera requires localhost or HTTPS in a supported browser.')
      const source = await requestCameraSource(navigator.mediaDevices, deviceId, facing, strictFacing)
      const { stream } = source
      if (current !== generation.current) { stream.getTracks().forEach((track) => track.stop()); return }
      streamRef.current = stream
      setCameraFacing(source.facing)
      if (source.facing) preferredFacing.current = source.facing
      const video = videoRef.current
      if (!video) throw new Error('Camera preview is unavailable.')
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => { stop(); setError('Camera disconnected. Check its connection and start again.') }
      })
      video.srcObject = stream
      await video.play()
      if (current !== generation.current) return
      modeRef.current = 'camera'; setMode('camera')
      void refreshDevices()
      const capture = { frames: 0, since: performance.now() }
      cancelCapture.current = observeCameraFrames(video, (now) => {
        if (current !== generation.current) return
        cameraFrameTime.current = now
        capture.frames++
        if (now - capture.since >= 1000) {
          setPreviewFps(capture.frames * 1000 / (now - capture.since))
          capture.frames = 0; capture.since = now
        }
        if (!workerReady.current || busy.current || !takeCameraFrame(pacing.current, now)) return
        busy.current = true; setWorking(true)
        const targetWorker = workerRef.current
        void createImageBitmap(video).then((bitmap) => {
          if (current !== generation.current || !targetWorker || targetWorker !== workerRef.current) {
            bitmap.close()
            if (workerRef.current === targetWorker) { busy.current = false; setWorking(false) }
            return
          }
          targetWorker.postMessage({ type: 'frame', bitmap, capturedAt: now, generation: current } satisfies WorkerRequest, [bitmap])
        }).catch((cause: unknown) => {
          if (workerRef.current === targetWorker) { busy.current = false; setWorking(false) }
          if (current !== generation.current) return
          stop(); setError(cause instanceof Error ? cause.message : 'Could not read the camera frame.')
        })
      })
    } catch (cause) {
      if (current !== generation.current) return
      stop()
      const name = cause instanceof Error ? cause.name : ''
      setError(name === 'NotAllowedError' ? 'Camera Access Denied. Allow camera access in browser settings and start again.' :
        name === 'NotFoundError' ? 'No Camera Found. Connect a webcam and start again.' :
        name === 'NotReadableError' ? 'Camera Unavailable. Close other apps using the camera and start again.' :
        name === 'OverconstrainedError' ? 'ไม่พบกล้องที่เลือก กรุณาเลือกกล้องจากรายการแล้วเปิดใหม่' :
        cause instanceof Error ? cause.message : 'Camera could not start.')
    }
  }

  async function inspectImage(file: File) {
    if (models !== 'ready' || busy.current) return
    stop(); setError(''); busy.current = true; setWorking(true)
    imageSource.current = file
    const current = generation.current
    try {
      const bitmap = await createImageBitmap(file)
      if (current !== generation.current) { bitmap.close(); busy.current = false; setWorking(false); return }
      objectUrl.current = URL.createObjectURL(file)
      setImageUrl(objectUrl.current); modeRef.current = 'image'; setMode('image')
      workerRef.current?.postMessage({ type: 'frame', bitmap, capturedAt: performance.now(), generation: current } satisfies WorkerRequest, [bitmap])
    } catch {
      busy.current = false; setWorking(false); stop(); setError('Image could not be opened. Choose a valid JPEG or PNG.')
    }
  }

  function resetRuntime() {
    stop(); setModels('loading'); setError(''); setWorking(false)
    setRuntimeInfo(null); setRecoveryReason('')
  }
  function changeRuntimeMode(value: RuntimeMode) {
    if (mode === 'camera' || mode === 'starting' || working || value === runtimeMode) return
    resetRuntime(); setRuntimeMode(value)
  }
  const getStream = useCallback(() => streamRef.current, [])
  async function switchCamera() {
    if (modeRef.current !== 'camera') return
    await start('', (cameraFacing ?? preferredFacing.current) === 'user' ? 'environment' : 'user', true)
  }
  return { videoRef, getStream, mode, models, error, frame, devices, working, previewFps, inferenceFps, cameraFrameAt,
    cameraFacing, switchCamera,
    runtimeMode, runtimeInfo, recoveryReason, timing, statistics, sampleCount, changeRuntimeMode,
    latency, imageUrl, start, stop, inspectImage, retryModels: () => {
      resetRuntime(); setAttempt((value) => value + 1)
    } }
}
