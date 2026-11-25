import { describe, expect, it } from 'vitest'
import { assertValidPassword, checkPassword } from './passwords'

describe('password policy', () => {
  it('accepts passwords with enough length, a letter and a digit', () => {
    expect(checkPassword('dayflow2026')).toMatchObject({ valid: true, missing: [] })
    expect(checkPassword('пароль2026')).toMatchObject({ valid: true })
    expect(() => assertValidPassword('dayflow2026')).not.toThrow()
  })

  it('reports every missing requirement', () => {
    expect(checkPassword('').missing).toEqual(['length', 'letter', 'digit'])
    expect(checkPassword('abcdefgh').missing).toEqual(['digit'])
    expect(checkPassword(' abcdefg1').missing).toEqual(['noEdgeSpaces'])
    expect(checkPassword('a1'.repeat(65)).missing).toEqual(['length'])
  })

  it('scores stronger passwords higher and caps invalid ones', () => {
    expect(checkPassword('abc').score).toBeLessThanOrEqual(1)
    expect(checkPassword('dayflow2026').score).toBe(1)
    expect(checkPassword('Dayflow-2026-strong').score).toBe(4)
  })

  it('throws a readable validation error', () => {
    expect(() => assertValidPassword('short')).toThrow(/Пароль не подходит/)
    expect(() => assertValidPassword(42)).toThrow(/Введите пароль/)
  })
})
