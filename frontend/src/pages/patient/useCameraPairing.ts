import { useEffect, useRef, useState } from 'react'
import { cameraPairing } from '@/lib/camera-pairing'
import type { PairingState } from '@/lib/camera-protocol'
import type { CaptureDevice } from '@/lib/camera-capture'

const idle: PairingState = { connection: 'closed', room: null, lease: null, pending: false, error: '' }

export function useCameraPairing(accountId: string | null, enabled: boolean, readReady: () => boolean, capture: CaptureDevice) {
  const [current, setCurrent] = useState<{ account: string; state: PairingState } | null>(null)
  const client = useRef<ReturnType<typeof cameraPairing> | null>(null)
  const ready = useRef(readReady)
  const device = useRef(capture)
  useEffect(() => { device.current = capture }, [capture])
  useEffect(() => { ready.current = readReady; client.current?.readinessChanged() }, [readReady])
  useEffect(() => {
    if (!accountId || !enabled) return
    let storage: Storage | null = null
    try { storage = window.sessionStorage } catch { /* In-memory pairing remains available. */ }
    const active = cameraPairing({
      url: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/camera/ws`,
      storageKey: `mocapin-camera-${accountId}`, storage,
      onChange: (state) => setCurrent({ account: accountId, state }),
      readReady: () => ready.current(),
      capture: { start: (timing) => device.current.start(timing), stop: (cancelled) => device.current.stop(cancelled), readState: () => device.current.readState() },
    })
    client.current = active
    const visibility = () => active.readinessChanged()
    document.addEventListener('visibilitychange', visibility)
    return () => { document.removeEventListener('visibilitychange', visibility); client.current = null; active.dispose() }
  }, [accountId, enabled])
  const state = enabled && current?.account === accountId ? current.state : idle
  return {
    ...state,
    localReady: enabled && readReady(),
    create: () => client.current?.create(), join: (code: string) => client.current?.join(code),
    leave: () => client.current?.leave(), renewCode: () => client.current?.renewCode(),
    reconnect: () => client.current?.reconnect(),
    retryCapture: () => client.current?.retryCapture(), stopCapture: () => client.current?.stopCapture(), clearCapture: () => client.current?.clearCapture(),
  }
}
