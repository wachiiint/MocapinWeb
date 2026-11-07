export const KEYPOINT_NAMES = [
  'Nose', 'Left Eye', 'Right Eye', 'Left Ear', 'Right Ear',
  'Left Shoulder', 'Right Shoulder', 'Left Elbow', 'Right Elbow',
  'Left Wrist', 'Right Wrist', 'Left Hip', 'Right Hip', 'Left Knee',
  'Right Knee', 'Left Ankle', 'Right Ankle', 'Head', 'Neck', 'Hip',
  'Left Big Toe', 'Right Big Toe', 'Left Small Toe', 'Right Small Toe',
  'Left Heel', 'Right Heel',
]

export const SKELETON = [
  [15, 13], [13, 11], [11, 19], [16, 14], [14, 12], [12, 19],
  [17, 18], [18, 19], [18, 5], [5, 7], [7, 9], [18, 6], [6, 8], [8, 10],
  [1, 2], [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6],
  [15, 20], [15, 22], [15, 24], [16, 21], [16, 23], [16, 25],
]

// Engineering thresholds for this demo, not clinical cutoffs.
export const POSE_CONFIG = { detectorScore: 0.5, keypointScore: 0.3, staleMs: 1000 }
export const DEFAULT_MODELS = { detector: 'rtmdet-nano.onnx', pose: 'rtmpose-s-halpe26.onnx' }
export type Box = { x1: number; y1: number; x2: number; y2: number; score: number }
export type Keypoint = { x: number; y: number; score: number }
export type Pixels = { width: number; height: number; data: Uint8ClampedArray }
export type RuntimeMode = 'auto' | 'wasm'
export type Provider = 'webgpu' | 'wasm'
export type ModelRuntime = { provider: Provider; revision: number; fallbackReason?: string }
export type RuntimeInfo = { detector: ModelRuntime; pose: ModelRuntime; revision: number }
export type StageTimings = {
  readPixelsMs: number; detectorPreMs: number; detectorRunMs: number; detectorDecodeMs: number
  posePreMs: number; poseRunMs: number; poseDecodeMs: number; totalWorkerMs: number
}
export type TimingSample = StageTimings & { frameAgeMs: number }
export type PoseFrame = {
  width: number; height: number; people: Box[]; keypoints: Keypoint[]
  inferenceMs: number; capturedAt: number; generation: number
  runtime: RuntimeInfo; timings: StageTimings
}
export type WorkerRequest =
  | { type: 'init'; detectorUrl: string; poseUrl: string; runtimeMode: RuntimeMode }
  | { type: 'frame'; bitmap: ImageBitmap; capturedAt: number; generation: number }
export type WorkerReply =
  | { type: 'ready'; runtime: RuntimeInfo }
  | { type: 'recover'; reason: string }
  | { type: 'result'; frame: PoseFrame }
  | { type: 'error'; message: string }

export function isClear(point: Keypoint, width: number, height: number, threshold: number) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.score) && point.score >= threshold &&
    point.x >= 0 && point.y >= 0 && point.x < width && point.y < height
}
