type CameraVideo = Pick<HTMLVideoElement,
  'readyState' | 'videoWidth' | 'videoHeight' | 'paused' | 'ended' | 'currentTime'> &
  Partial<Pick<HTMLVideoElement, 'requestVideoFrameCallback' | 'cancelVideoFrameCallback'>>

// Playback-quality counters may stay at zero for live camera streams on older iOS.
export function observeCameraFrames(video: CameraVideo, onFrame: (now: number) => void) {
  let stopped = false, handle = 0, lastTime = video.currentTime
  const useVideoCallback = typeof video.requestVideoFrameCallback === 'function'
  const schedule = () => {
    handle = useVideoCallback ? video.requestVideoFrameCallback!(tick) : requestAnimationFrame(tick)
  }
  function tick(now: number) {
    if (stopped) return
    const usable = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.paused && !video.ended
    // A timer alone is never proof of a fresh camera image.
    if (usable && (useVideoCallback || (Number.isFinite(video.currentTime) && video.currentTime !== lastTime))) {
      lastTime = video.currentTime
      onFrame(now)
    }
    if (!stopped) schedule()
  }
  schedule()
  return () => {
    stopped = true
    if (useVideoCallback) video.cancelVideoFrameCallback?.(handle)
    else cancelAnimationFrame(handle)
  }
}
