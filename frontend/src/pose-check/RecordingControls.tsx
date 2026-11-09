import type { useVideoRecording } from './useVideoRecording'

export function RecordingControls({ recording, canStart }: {
  recording: ReturnType<typeof useVideoRecording>; canStart: boolean
}) {
  const { state, elapsedMs, result, error } = recording
  const seconds = Math.floor(elapsedMs / 1000)
  return <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="font-semibold">Video recording</h2>
    <p role="status" className="text-sm">{state === 'recording' ? 'Recording' : state === 'stopping' ? 'Finishing recording…' : result ? 'Recording complete' : 'Not recording'}
      {' · '}{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={!canStart || state !== 'idle' || !!result}
        onClick={recording.start} className="min-h-12 rounded-md bg-teal-700 px-4 text-sm font-medium text-white disabled:opacity-40">Start Recording</button>
      <button type="button" disabled={state !== 'recording'} onClick={() => recording.stop()}
        className="min-h-12 rounded-md border border-slate-300 px-4 text-sm font-medium disabled:opacity-40">Stop Recording</button>
    </div>
    {state === 'idle' && !result && !canStart && <p className="text-sm text-slate-600">Wait for Ready — Experimental before starting.</p>}
    {state === 'recording' && !canStart && <p role="alert" className="text-sm text-amber-800">Quality needs attention. Recording continues and issue times are being logged.</p>}
    {error && <p role="alert" className="break-words text-sm text-red-700">{error}</p>}
    {result && <>
      {result.report.stopReason !== 'user-stopped' && <p className="text-sm text-amber-800">Recording ended: {result.report.stopReason}. Any available video has been kept.</p>}
      {result.videoUrl && <video src={result.videoUrl} controls playsInline className="w-full rounded bg-slate-950" aria-label="Recorded video playback" />}
      <p className="text-sm">Quality issue intervals: {result.report.issueIntervals.length}</p>
      <div className="flex flex-wrap gap-3 text-sm">
        {result.videoUrl && <a className="rounded border border-slate-300 px-3 py-2" href={result.videoUrl} download={`${result.filename}.${result.extension}`}>Download Video</a>}
        <a className="rounded border border-slate-300 px-3 py-2" href={result.reportUrl} download={`${result.filename}-quality.json`}>Download Quality Report</a>
        <button type="button" className="rounded border border-slate-300 px-3 py-2" onClick={recording.clear}>Clear Recording</button>
      </div>
    </>}
    <p className="text-xs leading-5 text-slate-500">Camera video only, without audio or skeleton overlay. Mirroring affects the preview only. Video and quality reports stay in browser memory; download before clearing or reloading. Quality warnings do not automatically stop or delete a clip.</p>
  </section>
}
