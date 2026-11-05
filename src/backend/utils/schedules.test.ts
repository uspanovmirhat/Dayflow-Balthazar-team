import { describe, expect, it } from 'vitest'
import { isScheduledDate, validateSchedule } from './schedules'

describe('habit schedules', () => {
  it('handles daily schedules', () => {
    expect(isScheduledDate({ type: 'daily' }, '2026-11-05')).toBe(true)
  })

  it('uses ISO weekday numbering including Sunday', () => {
    const schedule = { type: 'weekdays' as const, days: [1, 3, 7] }
    expect(isScheduledDate(schedule, '2026-11-02')).toBe(true)
    expect(isScheduledDate(schedule, '2026-11-04')).toBe(true)
    expect(isScheduledDate(schedule, '2026-11-08')).toBe(true)
    expect(isScheduledDate(schedule, '2026-11-05')).toBe(false)
  })

  it('uses the interval start date as its anchor', () => {
    const schedule = { type: 'interval' as const, everyNDays: 3, startDate: '2026-11-05' as const }
    expect(isScheduledDate(schedule, '2026-11-05')).toBe(true)
    expect(isScheduledDate(schedule, '2026-11-08')).toBe(true)
    expect(isScheduledDate(schedule, '2026-11-07')).toBe(false)
    expect(isScheduledDate(schedule, '2026-11-04')).toBe(false)
  })

  it('rejects malformed schedules and duplicate weekdays', () => {
    expect(() => validateSchedule({ type: 'weekdays', days: [1, 1] })).toThrow()
    expect(() => validateSchedule({ type: 'interval', everyNDays: 0, startDate: '2026-11-05' })).toThrow()
  })
})
