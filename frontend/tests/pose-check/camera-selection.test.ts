import test from 'node:test'
import assert from 'node:assert/strict'
import { requestCameraSource } from '../../src/pose-check/camera-selection.ts'

function cameraMedia(actual?: string) {
  const requests: MediaStreamConstraints[] = []
  let stopped = 0
  const track = { getSettings: () => ({ facingMode: actual }), stop: () => { stopped++ } }
  // Only the browser boundary is stubbed; the production camera request runs unchanged.
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream
  const media = { getSupportedConstraints: () => ({ facingMode: true }),
    getUserMedia: async (constraints: MediaStreamConstraints) => { requests.push(constraints); return stream } }
  return { media, stream, requests, stopped: () => stopped }
}

test('switching requests the exact rear/front camera and reports the actual direction', async () => {
  for (const facing of ['environment', 'user'] as const) {
    const fake = cameraMedia(facing)
    const result = await requestCameraSource(fake.media, '', facing, true)
    assert.deepEqual(fake.requests, [{ audio: false, video: {
      width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { exact: facing },
    } }])
    assert.equal(result.stream, fake.stream)
    assert.equal(result.facing, facing)
    assert.equal(fake.stopped(), 0)
  }
})

test('ordinary starts allow camera preference, while manual camera IDs take precedence', async () => {
  const rear = cameraMedia('environment')
  assert.equal((await requestCameraSource(rear.media, '', 'user')).facing, 'environment')
  assert.deepEqual(rear.requests[0].video, { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'user' } })
  const external = cameraMedia()
  assert.equal((await requestCameraSource(external.media, 'usb-camera', 'user')).facing, null)
  assert.deepEqual(external.requests[0].video, { width: { ideal: 1280 }, height: { ideal: 720 }, deviceId: { exact: 'usb-camera' } })
})

test('unsupported switching makes no request; a wrong returned camera is released rather than mislabeled', async () => {
  const unsupported = cameraMedia()
  unsupported.media.getSupportedConstraints = () => ({ facingMode: false })
  await assert.rejects(requestCameraSource(unsupported.media, '', 'environment', true), /ไม่รองรับ/)
  assert.equal(unsupported.requests.length, 0)
  const wrong = cameraMedia('user')
  await assert.rejects(requestCameraSource(wrong.media, '', 'environment', true), /เปิดกล้องที่เลือกไม่ได้/)
  assert.equal(wrong.stopped(), 1)
})

test('permission and missing-camera failures propagate without retrying a different camera', async () => {
  for (const name of ['NotAllowedError', 'OverconstrainedError']) {
    let requests = 0
    const cause = new Error(name); cause.name = name
    const media = { getSupportedConstraints: () => ({ facingMode: true }),
      getUserMedia: async () => { requests++; throw cause } }
    await assert.rejects(requestCameraSource(media, '', 'environment', true), (error) => error === cause)
    assert.equal(requests, 1)
  }
})
