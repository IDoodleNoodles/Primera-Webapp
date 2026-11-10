import { describe, expect, it } from 'vitest'
import { projectPatientAccount } from './adminPortal.js'

describe('patient account projection', () => {
  it('returns exactly the six permitted fields', () => {
    const projection = projectPatientAccount({
      name: 'Patient One',
      username: 'patient-one',
      email: 'patient@example.com',
      status: 'active',
      registrationDate: '2026-01-01T00:00:00.000Z',
      lastActive: '2026-01-02T00:00:00.000Z',
      lmpDate: 'must not be returned',
      heartRate: 100,
    })
    expect(Object.keys(projection)).toEqual(['name', 'username', 'email', 'status', 'registrationDate', 'lastActive'])
    expect(projection).not.toHaveProperty('lmpDate')
    expect(projection).not.toHaveProperty('heartRate')
  })
})
