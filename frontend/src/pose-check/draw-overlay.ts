import { isClear, SKELETON, type PoseFrame } from './halpe26'

export function drawOverlay(canvas: HTMLCanvasElement, frame: PoseFrame | null, threshold: number) {
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  if (!frame) return
  canvas.width = frame.width; canvas.height = frame.height
  context.lineWidth = Math.max(2, frame.width / 450)
  context.strokeStyle = '#14b8a6'
  frame.people.forEach((box, index) => {
    context.strokeStyle = index === 0 ? '#14b8a6' : '#f59e0b'
    context.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1)
  })
  const clear = (index: number) => isClear(frame.keypoints[index], frame.width, frame.height, threshold)
  if (!frame.keypoints.length) return
  context.strokeStyle = '#14b8a6'
  for (const [a, b] of SKELETON) {
    if (!clear(a) || !clear(b)) continue
    context.beginPath(); context.moveTo(frame.keypoints[a].x, frame.keypoints[a].y)
    context.lineTo(frame.keypoints[b].x, frame.keypoints[b].y); context.stroke()
  }
  frame.keypoints.forEach((point, index) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
    context.fillStyle = clear(index) ? '#14b8a6' : '#f59e0b'
    context.beginPath(); context.arc(point.x, point.y, Math.max(3, frame.width / 250), 0, Math.PI * 2); context.fill()
  })
}
