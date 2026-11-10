import type { RuntimeMode } from './halpe26.ts'

type DeviceSignals = {
  userAgent?: string
  maxTouchPoints?: number
  userAgentData?: { mobile?: boolean }
}

export type DeviceEstimate = {
  kind: 'phone' | 'tablet' | 'desktop' | 'unknown'
  source: 'user-agent' | 'client-hints' | 'touch-heuristic' | 'unavailable'
}

// A hint for initial settings only; runtime support and speed must be measured separately.
export function estimateDevice(signals: DeviceSignals = typeof navigator === 'undefined' ? {} : navigator): DeviceEstimate {
  const ua = signals.userAgent ?? ''
  if (/iPad/i.test(ua)) return { kind: 'tablet', source: 'user-agent' }
  // iPad desktop mode can identify itself as a Mac. Touch is supporting evidence, not proof.
  if (/Macintosh/i.test(ua) && (signals.maxTouchPoints ?? 0) > 1) {
    return { kind: 'tablet', source: 'touch-heuristic' }
  }
  if (signals.userAgentData?.mobile === true) return { kind: 'phone', source: 'client-hints' }
  if (/iPhone|iPod|Windows Phone|Mobi/i.test(ua)) return { kind: 'phone', source: 'user-agent' }
  if (/Android|Tablet/i.test(ua)) return { kind: 'tablet', source: 'user-agent' }
  if (/Windows NT|Macintosh|X11|CrOS|Linux (?:x86_64|i686)/i.test(ua)) {
    return { kind: 'desktop', source: 'user-agent' }
  }
  return { kind: 'unknown', source: 'unavailable' }
}

export function defaultRuntimeMode(signals?: DeviceSignals): RuntimeMode {
  const { kind } = estimateDevice(signals)
  return kind === 'phone' || kind === 'unknown' ? 'wasm' : 'auto'
}
