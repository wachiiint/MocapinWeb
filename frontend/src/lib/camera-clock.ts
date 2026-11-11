export type ClockSample = { sentAt: number; receivedAt: number; serverTimeMs: number; roundTripMs: number; offsetMs: number }
export type CameraTiming = {
  schemaVersion: 1; roomId: string; takeId: string; role: 'primary' | 'secondary'; targetStartAtMs: number
  clockOffsetMs: number; uncertaintyMs: number; samples: ClockSample[]
  requestedAt: number; estimatedRequestServerMs: number; nativeStartAt: number | null; estimatedNativeStartServerMs: number | null
}

// Server time is estimated against performance.now(), never the phone's wall clock.
export function cameraClock() {
  let samples: ClockSample[] = []
  return {
    reset() { samples = [] },
    observe(sentAt: number, receivedAt: number, serverTimeMs: number) {
      if (![sentAt, receivedAt, serverTimeMs].every(Number.isFinite) || receivedAt < sentAt || sentAt < 0) return
      samples.push({ sentAt, receivedAt, serverTimeMs, roundTripMs: receivedAt - sentAt, offsetMs: serverTimeMs - (sentAt + receivedAt) / 2 })
      samples = samples.slice(-5)
    },
    estimate(now: number) {
      if (samples.length < 5 || now - samples.at(-1)!.receivedAt > 30000) return null
      const best = samples.reduce((a, b) => a.roundTripMs <= b.roundTripMs ? a : b)
      return { serverNowMs: now + best.offsetMs, offsetMs: best.offsetMs, uncertaintyMs: best.roundTripMs / 2, samples: samples.map((sample) => ({ ...sample })) }
    },
  }
}
