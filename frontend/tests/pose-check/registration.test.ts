import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone, validateRegistration } from '../../src/lib/registration.ts'

const valid = { fullName: 'ผู้ใช้ ทดสอบ', phone: '081-234-5678', ageYears: 68, sex: 'female', heightCm: 160.5, weightKg: 55.2, password: '123456' }

test('signup accepts Thai profile input, normalizes phone and preserves the password', () => {
  assert.deepEqual(validateRegistration(valid), {})
  assert.equal(normalizePhone(' 081-234-5678 '), '0812345678')
  assert.deepEqual(validateRegistration({ ...valid, password: ' 123456 ' }), {})
})

test('signup identifies every invalid field including missing, fractional and non-finite measurements', () => {
  assert.deepEqual(Object.keys(validateRegistration({ fullName: ' ', phone: '123', ageYears: 1.5, sex: '', heightCm: Infinity, weightKg: NaN, password: '12345' })).sort(),
    ['fullName', 'phone', 'ageYears', 'sex', 'heightCm', 'weightKg', 'password'].sort())
  for (const value of [-1, 0]) {
    const errors = validateRegistration({ ...valid, ageYears: value, heightCm: value, weightKg: value })
    assert.ok(errors.ageYears && errors.heightCm && errors.weightKg)
  }
})
