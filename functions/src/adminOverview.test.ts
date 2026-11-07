import { describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { buildAdminOverview } from './adminOverview.js'
import { hasAdminRole } from './adminGuard.js'

describe('admin overview callable contract', () => {
  it('returns the documented output shape when sources are empty', async () => {
    const emptyQuery = {
      where: () => emptyQuery,
      get: async () => ({ docs: [], size: 0 }),
    }
    const db = {
      collection: () => emptyQuery,
      collectionGroup: () => emptyQuery,
    } as unknown as Firestore

    const result = await buildAdminOverview(db)
    expect(result).toEqual({
      doctorWorkload: [],
      patientsWithoutDoctor: [],
      pipeline: {
        smartwatchSyncsToday: 0,
        voiceCheckInsToday: 0,
        functionErrorCount: null,
      },
    })
  })

  it('requires the admin custom claim', () => {
    expect(hasAdminRole({ auth: { token: { role: 'admin' } } })).toBe(true)
    expect(hasAdminRole({ auth: { token: { role: 'doctor' } } })).toBe(false)
    expect(hasAdminRole({})).toBe(false)
  })
})
