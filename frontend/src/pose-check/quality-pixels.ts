import type { Box, Pixels } from './halpe26.ts'

export type PixelQuality = {
  personLuma: number | null; backgroundLuma: number | null
  // A histogram lets Debug change the clipping threshold without retaining image pixels.
  personHistogram: number[]; sharpness: number | null
}
const SIZE = 128
const unknown = (): PixelQuality => ({ personLuma: null, backgroundLuma: null, personHistogram: [], sharpness: null })

export function measurePixelQuality(image: Pixels, people: Box[]): PixelQuality {
  if (people.length !== 1 || image.width < 2 || image.height < 2 || image.data.length !== image.width * image.height * 4) return unknown()
  const box = people[0]
  if (![box.x1, box.y1, box.x2, box.y2].every(Number.isFinite)) return unknown()
  const left = Math.max(0, box.x1), top = Math.max(0, box.y1)
  const right = Math.min(image.width, box.x2), bottom = Math.min(image.height, box.y2)
  if (right - left < 2 || bottom - top < 2) return unknown()
  const luma = (x: number, y: number) => {
    const index = (y * image.width + x) * 4
    return 0.2126 * image.data[index] + 0.7152 * image.data[index + 1] + 0.0722 * image.data[index + 2]
  }
  const sample = (x: number, y: number) => {
    const x0 = Math.max(0, Math.min(image.width - 1, x)), y0 = Math.max(0, Math.min(image.height - 1, y))
    const ix = Math.floor(x0), iy = Math.floor(y0), dx = x0 - ix, dy = y0 - iy
    const nx = Math.min(image.width - 1, ix + 1), ny = Math.min(image.height - 1, iy + 1)
    return luma(ix, iy) * (1 - dx) * (1 - dy) + luma(nx, iy) * dx * (1 - dy) +
      luma(ix, ny) * (1 - dx) * dy + luma(nx, ny) * dx * dy
  }
  // Normalize every person rectangle to the same analysis size, independent of camera resolution.
  const gray = new Float32Array(SIZE * SIZE), histogram = new Array<number>(256).fill(0)
  let personSum = 0, backgroundSum = 0, backgroundCount = 0
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const value = sample(left + (x + 0.5) * (right - left) / SIZE - 0.5,
      top + (y + 0.5) * (bottom - top) / SIZE - 0.5)
    gray[y * SIZE + x] = value; personSum += value; histogram[Math.round(value)]++
    const bx = (x + 0.5) * image.width / SIZE, by = (y + 0.5) * image.height / SIZE
    if (bx < left || bx >= right || by < top || by >= bottom) {
      backgroundSum += sample(bx - 0.5, by - 0.5); backgroundCount++
    }
  }
  let sum = 0, squared = 0
  for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
    const i = y * SIZE + x
    const laplacian = gray[i - 1] + gray[i + 1] + gray[i - SIZE] + gray[i + SIZE] - 4 * gray[i]
    sum += laplacian; squared += laplacian * laplacian
  }
  const count = (SIZE - 2) ** 2
  return { personLuma: personSum / gray.length, backgroundLuma: backgroundCount ? backgroundSum / backgroundCount : null,
    personHistogram: histogram, sharpness: Math.max(0, squared / count - (sum / count) ** 2) }
}
