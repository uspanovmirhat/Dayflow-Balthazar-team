import { describe, expect, it } from 'vitest'
import { isHabitColor, randomHabitColor, stableHabitColor, validateHabitColor } from './colors'

describe('habit colors', () => {
  it('accepts only six-digit hexadecimal colors', () => {
    expect(isHabitColor('#12aBcD')).toBe(true)
    expect(isHabitColor('12aBcD')).toBe(false)
    expect(() => validateHabitColor('#abc')).toThrow()
  })

  it('generates stable fallback colors for legacy habits', () => {
    expect(stableHabitColor('habit-1')).toBe(stableHabitColor('habit-1'))
    expect(stableHabitColor('habit-1')).toMatch(/^#[\da-f]{6}$/i)
  })

  it('generates a valid random color', () => {
    expect(randomHabitColor()).toMatch(/^#[\da-f]{6}$/i)
  })
})
