// One countdown per uninterrupted readiness run. The caller owns the timer.
export function recordingCountdown() {
  let deadline: number | null = null, key = '', lastTick: number | null = null, fired = false
  function reset() { deadline = null; key = ''; lastTick = null; fired = false }
  function tick(now: number, ready: boolean, runKey: string, maxGapMs: number) {
    if (!ready) { reset(); return { seconds: null, start: false } }
    if (key !== runKey || (lastTick !== null && (now < lastTick || now - lastTick > maxGapMs))) reset()
    key = runKey; lastTick = now
    if (fired) return { seconds: null, start: false }
    deadline ??= now + 5000
    if (now >= deadline) { fired = true; return { seconds: null, start: true } }
    return { seconds: Math.ceil((deadline - now) / 1000), start: false }
  }
  return { tick, reset }
}
