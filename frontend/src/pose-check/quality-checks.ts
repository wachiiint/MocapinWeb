import { isClear, KEYPOINT_NAMES, REQUIRED_KEYPOINT_INDICES, type PoseFrame } from './halpe26.ts'
import type { QualityConfig } from './quality-config.ts'

export type CheckState = 'pass' | 'fail' | 'unknown'
export type ReasonCode = 'ERROR' | 'NO_PERSON' | 'MULTIPLE_PEOPLE' | 'PEOPLE_UNKNOWN' |
  'PERSON_SMALL' | 'SIZE_UNKNOWN' | 'DARK' | 'LIGHT_UNKNOWN' |
  'CLIPPED' | 'CLIPPING_UNKNOWN' | 'BACKLIGHT' | 'BACKLIGHT_UNKNOWN' | 'BLUR' | 'BLUR_UNKNOWN' |
  'KEYPOINTS' | 'KEYPOINTS_UNKNOWN' | 'CAMERA_STALLED' | 'CAMERA_UNKNOWN' | 'POSE_STALE' | 'POSE_UNKNOWN'
export type QualityCheck = { state: CheckState; reason: ReasonCode; value: number | null; blocking: boolean }
export type QualityFrame = Pick<PoseFrame, 'width' | 'height' | 'people' | 'keypoints' | 'quality'>
export const REASONS: Record<ReasonCode, { title: string; advice: string; priority: number }> = {
  ERROR: { title: 'Camera or Model Error', advice: 'Resolve the error and retry.', priority: 0 },
  NO_PERSON: { title: 'No Person Detected', advice: 'Step into view with your whole body and both feet visible.', priority: 1 },
  MULTIPLE_PEOPLE: { title: 'Multiple People Detected', advice: 'Keep only the person being assessed in view.', priority: 1 },
  PEOPLE_UNKNOWN: { title: 'Checking for a Person', advice: 'Wait for a recent pose result.', priority: 1 },
  PERSON_SMALL: { title: 'Person Is Too Small', advice: 'Move closer while keeping your whole body and both feet visible.', priority: 2 },
  SIZE_UNKNOWN: { title: 'Could Not Check Person Size', advice: 'Keep one person clearly visible.', priority: 2 },
  DARK: { title: 'Image Is Too Dark', advice: 'Add light in front of the person.', priority: 3 },
  LIGHT_UNKNOWN: { title: 'Could Not Check Brightness', advice: 'Keep one person clearly visible.', priority: 3 },
  CLIPPED: { title: 'Image Is Too Bright', advice: 'Reduce direct light or adjust the camera exposure.', priority: 3 },
  CLIPPING_UNKNOWN: { title: 'Could Not Check Bright Pixels', advice: 'Keep one person clearly visible.', priority: 3 },
  BACKLIGHT: { title: 'Possible Backlighting', advice: 'Face the light and avoid a bright window behind you.', priority: 3 },
  BACKLIGHT_UNKNOWN: { title: 'Could Not Check Backlighting', advice: 'Leave some background visible around the person.', priority: 3 },
  BLUR: { title: 'Image May Be Blurry', advice: 'Hold the camera steady and check focus and lighting.', priority: 4 },
  BLUR_UNKNOWN: { title: 'Could Not Check Sharpness', advice: 'Keep one person clearly visible.', priority: 4 },
  KEYPOINTS: { title: 'Required Keypoints Incomplete', advice: 'Keep your head, body, limbs and both feet visible. Adjust position or lighting.', priority: 5 },
  KEYPOINTS_UNKNOWN: { title: 'Could Not Check All 21 Required Keypoints', advice: 'Keep one person clearly visible.', priority: 5 },
  CAMERA_STALLED: { title: 'Camera Frames Interrupted', advice: 'Check the camera connection and close other camera apps.', priority: 6 },
  CAMERA_UNKNOWN: { title: 'Checking Camera Frames', advice: 'Wait for new camera frames.', priority: 6 },
  POSE_STALE: { title: 'Pose Updates Too Slow', advice: 'Wait for a fresh result. Close demanding apps or try another runtime.', priority: 6 },
  POSE_UNKNOWN: { title: 'Waiting for Pose Updates', advice: 'Keep the preview visible while the models check the image.', priority: 6 },
}

const WARNING_REASONS = new Set(['CLIPPED', 'CLIPPING_UNKNOWN', 'BACKLIGHT', 'BACKLIGHT_UNKNOWN', 'BLUR', 'BLUR_UNKNOWN'])
export function isBlockingReason(reason: string) { return !WARNING_REASONS.has(reason) }

function check(value: number | null, pass: boolean, reason: ReasonCode, unknown: ReasonCode): QualityCheck {
  return { state: value === null || !Number.isFinite(value) ? 'unknown' : pass ? 'pass' : 'fail',
    reason: value === null || !Number.isFinite(value) ? unknown : reason, value, blocking: isBlockingReason(reason) }
}

export function evaluateQuality(frame: QualityFrame | null, config: QualityConfig) {
  const count = frame?.people.length ?? null
  const single = count === 1 && frame !== null
  const validSize = !!frame && frame.width > 0 && frame.height > 0
  const frameWidth = frame?.width ?? 0, frameHeight = frame?.height ?? 0
  const box = single ? frame.people[0] : null
  const boxValid = box && [box.x1, box.x2, box.y1, box.y2].every(Number.isFinite) && box.x2 > box.x1 && box.y2 > box.y1
  const points = single && validSize && frame.keypoints.length === KEYPOINT_NAMES.length ? frame.keypoints : null
  const unclear = points ? KEYPOINT_NAMES.filter((_, i) => !isClear(points[i], frameWidth, frameHeight, config.keypointScore)) : [...KEYPOINT_NAMES]
  const requiredUnclear = REQUIRED_KEYPOINT_INDICES.filter((index) => !points ||
    !isClear(points[index], frameWidth, frameHeight, config.keypointScore))
  const requiredClearCount = points ? REQUIRED_KEYPOINT_INDICES.length - requiredUnclear.length : 0
  const height = boxValid && validSize ? (box.y2 - box.y1) / frame.height : null
  const width = boxValid && validSize ? (box.x2 - box.x1) / frame.width : null
  const pixels = single ? frame.quality : null
  const brightness = pixels?.personLuma ?? null, background = pixels?.backgroundLuma ?? null
  const histogram = pixels?.personHistogram ?? []
  const samples = histogram.reduce((sum, n) => sum + n, 0)
  const clipped = samples ? histogram.slice(Math.ceil(config.clippedLuma)).reduce((sum, n) => sum + n, 0) / samples : null
  const delta = brightness !== null && background !== null ? background - brightness : null
  const sharpness = pixels?.sharpness ?? null
  const checks: QualityCheck[] = [
    check(count, count === 1, count === 0 ? 'NO_PERSON' : 'MULTIPLE_PEOPLE', 'PEOPLE_UNKNOWN'),
    check(height, height !== null && width !== null && height >= config.minPersonHeight && width >= config.minPersonWidth, 'PERSON_SMALL', 'SIZE_UNKNOWN'),
    check(brightness, brightness !== null && brightness >= config.minPersonLuma, 'DARK', 'LIGHT_UNKNOWN'),
    check(clipped, clipped !== null && clipped <= config.maxClippedFraction, 'CLIPPED', 'CLIPPING_UNKNOWN'),
    check(delta, delta !== null && (delta <= config.backlightDelta || brightness! >= config.backlightPersonMax), 'BACKLIGHT', 'BACKLIGHT_UNKNOWN'),
    check(sharpness, sharpness !== null && sharpness >= config.minSharpness, 'BLUR', 'BLUR_UNKNOWN'),
    check(points ? requiredClearCount : null, requiredUnclear.length === 0, 'KEYPOINTS', 'KEYPOINTS_UNKNOWN'),
  ]
  return { checks, unclear, clearCount: points ? points.length - unclear.length : 0, requiredClearCount }
}

export function sortIssues(checks: QualityCheck[]) {
  return checks.filter((c) => c.state !== 'pass').sort((a, b) =>
    Number(b.blocking) - Number(a.blocking) || REASONS[a.reason].priority - REASONS[b.reason].priority)
}
