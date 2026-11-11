export type Registration = {
  fullName: string; phone: string; ageYears: number; sex: string
  heightCm: number; weightKg: number; password: string
}
export type RegistrationErrors = Partial<Record<keyof Registration, string>>

export function normalizePhone(value: string) { return value.trim().replace(/[ -]/g, '') }

export function validateRegistration(value: Registration): RegistrationErrors {
  const errors: RegistrationErrors = {}
  if (!value.fullName.trim() || Array.from(value.fullName.trim()).length > 200) errors.fullName = 'กรุณากรอกชื่อและนามสกุล ไม่เกิน 200 ตัวอักษร'
  if (!/^0[0-9]{9}$/.test(normalizePhone(value.phone))) errors.phone = 'กรุณากรอกเบอร์โทรศัพท์ 10 หลัก ขึ้นต้นด้วย 0'
  if (!Number.isInteger(value.ageYears) || value.ageYears < 1 || value.ageYears > 32767) errors.ageYears = 'กรุณากรอกอายุเป็นจำนวนเต็มมากกว่า 0'
  if (!['male', 'female'].includes(value.sex)) errors.sex = 'กรุณาเลือกเพศ'
  if (!Number.isFinite(value.heightCm) || value.heightCm <= 0) errors.heightCm = 'กรุณากรอกส่วนสูงมากกว่า 0'
  if (!Number.isFinite(value.weightKg) || value.weightKg <= 0) errors.weightKg = 'กรุณากรอกน้ำหนักมากกว่า 0'
  const length = Array.from(value.password).length
  if (length < 6 || length > 128) errors.password = 'กรุณาตั้งรหัสผ่าน 6–128 ตัวอักษร'
  return errors
}
