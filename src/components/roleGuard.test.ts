import { describe, expect, it } from 'vitest'
import { isAllowedRole } from './roleGuard'

describe('admin role guard', () => {
  it('allows administrators', () => {
    expect(isAllowedRole('admin', ['admin'])).toBe(true)
  })

  it('rejects missing roles', () => {
    expect(isAllowedRole(undefined, ['admin'])).toBe(false)
  })
})
