import type { useVideoRecording } from './useVideoRecording'

export function RecordingControls({ recording, canStart }: {
  recording: ReturnType<typeof useVideoRecording>; canStart: boolean
}) {
  const { state, elapsedMs, result, error } = recording
  const seconds = Math.floor(elapsedMs / 1000)
  return <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="font-semibold">วิดีโอ</h2>
    <p role="status" className="text-lg tabular-nums">{state === 'recording' ? 'กำลังอัด' : state === 'stopping' ? 'กำลังบันทึกวิดีโอ…' : result ? 'อัดเสร็จแล้ว' : 'รออัดอัตโนมัติ'}
      {' · '}{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={state !== 'recording'} onClick={() => recording.stop()}
        className="min-h-12 rounded-full border border-slate-300 px-4 text-lg font-medium disabled:opacity-40">หยุดอัด</button>
    </div>
    {state === 'idle' && !result && !error && !canStart && <p className="text-lg text-slate-600">เมื่อผ่านการตรวจ ระบบจะนับถอยหลัง 5 วินาทีแล้วเริ่มอัดเอง</p>}
    {state === 'recording' && !canStart && <p role="alert" className="text-lg text-amber-800">กรุณาปรับตามคำแนะนำ การอัดยังดำเนินต่อ</p>}
    {error && <p role="alert" className="break-words text-lg text-red-700">{error}</p>}
    {error && state === 'idle' && !result && <button type="button" onClick={recording.retry}
      className="min-h-12 rounded-full bg-[#0B65FF] px-5 text-lg font-semibold text-white">ลองใหม่</button>}
    {result && <>
      {result.report.stopReason !== 'user-stopped' && <p className="text-lg text-amber-800">การอัดสิ้นสุดก่อนกดหยุด เก็บวิดีโอที่อัดได้ไว้แล้ว</p>}
      {result.videoUrl && <video src={result.videoUrl} controls playsInline className="w-full rounded bg-slate-950" aria-label="ดูวิดีโอที่อัด" />}
      <p className="text-lg">ช่วงที่ควรตรวจสอบ: {result.report.issueIntervals.length}</p>
      <div className="flex flex-wrap gap-3 text-lg">
        {result.videoUrl && <a className="inline-flex min-h-12 items-center rounded-full border border-slate-300 px-4 py-2" href={result.videoUrl} download={`${result.filename}.${result.extension}`}>ดาวน์โหลดวิดีโอ</a>}
        <a className="inline-flex min-h-12 items-center rounded-full border border-slate-300 px-4 py-2" href={result.reportUrl} download={`${result.filename}-quality.json`}>ดาวน์โหลดรายงาน</a>
        <button type="button" className="inline-flex min-h-12 items-center rounded-full border border-slate-300 px-4 py-2" onClick={recording.clear}>ล้างวิดีโอเพื่ออัดใหม่</button>
      </div>
    </>}
  </section>
}
