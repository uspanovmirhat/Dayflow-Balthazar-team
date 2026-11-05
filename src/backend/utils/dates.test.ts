import { describe, expect, it } from 'vitest'
import { addDays, enumerateDates, isLocalDate, localDateInTimeZone, startOfIsoWeek } from './dates'

describe('date utilities', () => {
  it('validates calendar dates instead of only matching their shape', () => {
    expect(isLocalDate('2024-02-29')).toBe(true)
    expect(isLocalDate('2025-02-29')).toBe(false)
    expect(isLocalDate('2026-13-01')).toBe(false)
  })

  it('adds calendar days without DST drift', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
  })

  it('uses the requested timezone to derive local dates', () => {
    expect(localDateInTimeZone(new Date('2026-11-05T01:30:00.000Z'), 'America/Los_Angeles')).toBe('2026-11-04')
  })

  it('enumerates inclusive ranges and ISO weeks', () => {
    expect(enumerateDates('2026-11-02', '2026-11-04')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
    expect(startOfIsoWeek('2026-11-05')).toBe('2026-11-02')
  })
})
