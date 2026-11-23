import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { parseHabit } from './habit.schema'

const baseHabit = {
  id: 'habit-legacy', userId: 'u1', name: 'Read', description: '', type: 'boolean', targetPerDay: 1,
  schedule: { type: 'daily' }, isArchived: false, archivedFrom: null, isDeleting: false, settingsVersion: 1,
  createdAt: Timestamp.fromDate(new Date('2026-11-01T00:00:00Z')),
  updatedAt: Timestamp.fromDate(new Date('2026-11-01T00:00:00Z')),
}

describe('habit schema colors', () => {
  it('provides a deterministic color for legacy habits without a color field', () => {
    const first = parseHabit(baseHabit, 'u1', 'habit-legacy')
    const second = parseHabit(baseHabit, 'u1', 'habit-legacy')
    expect(first.color).toMatch(/^#[\da-f]{6}$/i)
    expect(first.color).toBe(second.color)
  })

  it('preserves a valid stored color and rejects malformed stored colors', () => {
    expect(parseHabit({ ...baseHabit, color: '#12aBcD' }, 'u1', 'habit-legacy').color).toBe('#12ABCD')
    expect(() => parseHabit({ ...baseHabit, color: 'red' }, 'u1', 'habit-legacy')).toThrow(/color/i)
  })
})
