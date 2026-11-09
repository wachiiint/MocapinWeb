import { useCallback, useEffect, useState } from 'react'
import { evaluateReadiness, type GateInput, type Readiness } from './readiness'

export function useQualityGate(input: Omit<GateInput, 'visible'>) {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const [gate, setGate] = useState<Readiness>(() => evaluateReadiness(null, { ...input, visible }, performance.now()))
  useEffect(() => {
    const change = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  const { mode, models, error, frame, cameraFrameAt, config } = input
  useEffect(() => {
    const tick = () => setGate((previous) => evaluateReadiness(previous,
      { mode, models, error, frame, cameraFrameAt, config, visible }, performance.now()))
    tick()
    const timer = window.setInterval(tick, 100)
    return () => clearInterval(timer)
  }, [mode, models, error, frame, cameraFrameAt, config, visible])
  // Invalidate synchronously on resets; an old Ready render must never survive a new input.
  const observedAt = Math.max(gate.evaluatedAt, frame?.capturedAt ?? 0, cameraFrameAt ?? 0)
  const checkNow = useCallback((now: number) => evaluateReadiness(gate,
    { mode, models, error, frame, cameraFrameAt, config, visible: document.visibilityState === 'visible' }, now),
  [gate, mode, models, error, frame, cameraFrameAt, config])
  return { ...evaluateReadiness(gate, { ...input, visible }, observedAt), checkNow }
}
