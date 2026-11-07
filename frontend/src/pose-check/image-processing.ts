import type { Box, Keypoint, Pixels } from './halpe26.ts'

// Values and transforms come from each pinned ONNX archive's pipeline.json.
const RGB_MEAN = [123.675, 116.28, 103.53]
const RGB_STD = [58.395, 57.12, 57.375]
const BGR_MEAN = [103.53, 116.28, 123.675]
const BGR_STD = [57.375, 57.12, 58.395]

function pixel(image: Pixels, x: number, y: number, channel: number, border: number) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return border
  return image.data[(y * image.width + x) * 4 + channel]
}

function sample(image: Pixels, x: number, y: number, channel: number, border: number) {
  const left = Math.floor(x), top = Math.floor(y)
  const dx = x - left, dy = y - top
  return pixel(image, left, top, channel, border) * (1 - dx) * (1 - dy) +
    pixel(image, left + 1, top, channel, border) * dx * (1 - dy) +
    pixel(image, left, top + 1, channel, border) * (1 - dx) * dy +
    pixel(image, left + 1, top + 1, channel, border) * dx * dy
}

export function detectorInput(image: Pixels) {
  const ratio = Math.min(320 / image.width, 320 / image.height)
  const width = Math.round(image.width * ratio), height = Math.round(image.height * ratio)
  const scaleX = width / image.width, scaleY = height / image.height
  const data = new Float32Array(3 * 320 * 320)
  for (let y = 0; y < 320; y++) {
    for (let x = 0; x < 320; x++) {
      for (let c = 0; c < 3; c++) {
        // Resize preserves aspect ratio; padding is on the bottom and right.
        const value = x < width && y < height
          ? sample(image, Math.max(0, Math.min(image.width - 1, (x + 0.5) / scaleX - 0.5)),
            Math.max(0, Math.min(image.height - 1, (y + 0.5) / scaleY - 0.5)), 2 - c, 114)
          : 114
        data[c * 320 * 320 + y * 320 + x] = (value - BGR_MEAN[c]) / BGR_STD[c]
      }
    }
  }
  return { data, scaleX, scaleY }
}

export function decodePeople(
  dets: Float32Array, labels: BigInt64Array | Int32Array,
  scaleX: number, scaleY: number, width: number, height: number, threshold: number,
): Box[] {
  const people: Box[] = []
  if (dets.length !== labels.length * 5) throw new Error('Unexpected RTMDet output layout.')
  for (let i = 0; i < labels.length; i++) {
    const [left, top, right, bottom, score] = dets.subarray(i * 5, i * 5 + 5)
    if (Number(labels[i]) !== 0 || score < threshold ||
      ![left, top, right, bottom, score].every(Number.isFinite)) continue
    const box = {
      x1: Math.max(0, left / scaleX), y1: Math.max(0, top / scaleY),
      x2: Math.min(width, right / scaleX), y2: Math.min(height, bottom / scaleY), score,
    }
    if (box.x2 > box.x1 && box.y2 > box.y1) people.push(box)
  }
  // The exported detector already applies NMS. Pose runs on the largest person only.
  return people.sort((a, b) => (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1))
}

export function poseCrop(box: Box) {
  const centerX = (box.x1 + box.x2) / 2, centerY = (box.y1 + box.y2) / 2
  const width = Math.max((box.x2 - box.x1) * 1.25, (box.y2 - box.y1) * 1.25 * 192 / 256)
  const height = width * 256 / 192
  return { left: centerX - width / 2, top: centerY - height / 2, width, height }
}

export function poseInput(image: Pixels, box: Box) {
  const crop = poseCrop(box)
  const data = new Float32Array(3 * 192 * 256)
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 192; x++) {
      for (let c = 0; c < 3; c++) {
        const value = sample(image, crop.left + x * crop.width / 192,
          crop.top + y * crop.height / 256, c, 0)
        data[c * 192 * 256 + y * 192 + x] = (value - RGB_MEAN[c]) / RGB_STD[c]
      }
    }
  }
  return { data, crop }
}

export function decodeSimCC(x: Float32Array, y: Float32Array, crop: ReturnType<typeof poseCrop>): Keypoint[] {
  if (x.length !== 26 * 384 || y.length !== 26 * 512) throw new Error('Expected HALPE26 SimCC outputs.')
  function maximum(values: Float32Array, start: number, length: number) {
    let index = 0, score = -Infinity
    for (let i = 0; i < length; i++) {
      if (values[start + i] > score) { score = values[start + i]; index = i }
    }
    return { index, score }
  }
  return Array.from({ length: 26 }, (_, i) => {
    const px = maximum(x, i * 384, 384), py = maximum(y, i * 512, 512)
    // MMDeploy uses a -1 SimCC location when either axis has no positive response.
    const score = Math.min(px.score, py.score)
    const locationX = score > 0 ? px.index : -1
    const locationY = score > 0 ? py.index : -1
    return {
      x: locationX / 2 / 192 * crop.width + crop.left,
      y: locationY / 2 / 256 * crop.height + crop.top,
      score,
    }
  })
}
