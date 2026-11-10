export type CameraFacing = 'user' | 'environment'

export async function requestCameraSource(
  media: Pick<MediaDevices, 'getUserMedia' | 'getSupportedConstraints'>,
  deviceId: string, facing: CameraFacing, strictFacing = false,
) {
  if (strictFacing && !media.getSupportedConstraints().facingMode) {
    throw new Error('เบราว์เซอร์นี้ไม่รองรับการสลับกล้องหน้า–หลัง กรุณาเลือกกล้องจากรายการ')
  }
  const stream = await media.getUserMedia({ audio: false,
    video: { width: { ideal: 1280 }, height: { ideal: 720 },
      ...(deviceId ? { deviceId: { exact: deviceId } } :
        { facingMode: strictFacing ? { exact: facing } : { ideal: facing } }) },
  })
  const actual = stream.getVideoTracks()[0]?.getSettings().facingMode
  if (strictFacing && actual && actual !== facing) {
    stream.getTracks().forEach((track) => track.stop())
    throw new Error('เปิดกล้องที่เลือกไม่ได้ กรุณาเลือกกล้องจากรายการแล้วลองใหม่')
  }
  return { stream, facing: actual === 'user' || actual === 'environment' ? actual : deviceId ? null : facing }
}
