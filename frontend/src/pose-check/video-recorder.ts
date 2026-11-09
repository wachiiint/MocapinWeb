import { collectRecordingQuality, type RecordingQualityReport, type RecordingSnapshot, type RecordingStopReason } from './recording-report.ts'
import type { QualityConfig } from './quality-config.ts'

export type RecorderDevice = Pick<MediaRecorder, 'state' | 'mimeType' | 'start' | 'stop' | 'addEventListener' | 'removeEventListener'>
type Options = {
  config: QualityConfig; source: { width: number; height: number }
  readSnapshot(now: number): RecordingSnapshot
  sourceAlive(): boolean
  onTick(elapsedMs: number): void
  onComplete(video: Blob, report: RecordingQualityReport): void
  onError(message: string): void
  now?: () => number
}

// The device is a native MediaRecorder in production; accepting it directly permits lifecycle tests.
export function recordVideo(recorder: RecorderDevice, options: Options) {
  const now = options.now ?? (() => performance.now())
  const startedAt = now()
  if (!options.readSnapshot(startedAt).readiness.canStartRecording || !options.sourceAlive()) {
    throw new Error('The camera must still be Ready before recording can start.')
  }
  const report = collectRecordingQuality(startedAt, options.config, options.source, new Date().toISOString())
  const chunks: Blob[] = []
  let timer: ReturnType<typeof setInterval> | undefined
  let endedAt: number | null = null, stopReason: RecordingStopReason | null = null, disposed = false
  const sample = () => {
    if (disposed || endedAt !== null) return
    const time = now()
    report.observe(options.readSnapshot(time), time)
    options.onTick(time - startedAt)
  }
  const stop = (reason: RecordingStopReason = 'user-stopped') => {
    if (disposed || endedAt !== null) return
    sample(); endedAt = now(); stopReason = reason; clearInterval(timer)
    if (recorder.state !== 'inactive') recorder.stop()
  }
  const data = (event: Event) => {
    const blob = (event as BlobEvent).data
    if (blob?.size) chunks.push(blob)
  }
  const error = () => {
    options.onError('Recording failed. Any available video will be kept; it may be incomplete.')
    stop('recorder-error')
  }
  const complete = () => {
    if (disposed) return
    if (endedAt === null) { sample(); endedAt = now() }
    clearInterval(timer)
    const reason = stopReason ?? (options.sourceAlive() ? 'recorder-ended' : 'camera-ended')
    const mimeType = chunks[0]?.type || recorder.mimeType || 'application/octet-stream'
    const video = new Blob(chunks, { type: mimeType })
    const result = report.finish(endedAt, reason, mimeType)
    cleanup()
    if (!video.size) options.onError('No video data was produced. The quality report is still available.')
    options.onComplete(video, result)
    chunks.length = 0
  }
  function cleanup() {
    disposed = true; clearInterval(timer)
    recorder.removeEventListener('dataavailable', data)
    recorder.removeEventListener('error', error)
    recorder.removeEventListener('stop', complete)
  }
  recorder.addEventListener('dataavailable', data)
  recorder.addEventListener('error', error)
  recorder.addEventListener('stop', complete)
  try {
    recorder.start(1000)
    sample()
    timer = setInterval(sample, 100)
  } catch (cause) {
    cleanup()
    if (recorder.state !== 'inactive') recorder.stop()
    throw cause
  }
  return { stop, sample, dispose() {
    cleanup(); chunks.length = 0
    if (recorder.state !== 'inactive') recorder.stop()
  } }
}
