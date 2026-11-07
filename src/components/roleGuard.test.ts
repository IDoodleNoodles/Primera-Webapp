import { describe, expect, it } from 'vitest'
import { isAllowedRole } from './roleGuard'

describe('admin route guard', () => {
  it('allows admins and rejects other roles', () => {
    expect(isAllowedRole('admin', ['admin'])).toBe(true)
    expect(isAllowedRole('doctor', ['admin'])).toBe(false)
    expect(isAllowedRole(undefined, ['admin'])).toBe(false)
  })
})
