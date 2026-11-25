import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import type { Reminder } from '../types'
import { dueReminder, localTimeInTimeZone, validateReminderLink } from './reminders'

const base: Reminder = {
  id: 'r1', userId: 'u1', title: 'Вода', description: '', time: '09:00',
  schedule: { repeat: 'daily', startDate: '2026-11-01', endDate: null },
  link: null, enabled: true, completedAt: null, snoozedUntil: null,
  createdAt: Timestamp.fromMillis(0), updatedAt: Timestamp.fromMillis(0),
}
// 2026-11-25 09:05 in Asia/Almaty (UTC+5).
const at = (iso: string) => new Date(iso)

describe('dueReminder', () => {
  it('is due from its time for the window, with a stable key', () => {
    expect(dueReminder(base, at('2026-11-25T04:05:00Z'), 'Asia/Almaty')).toEqual({ key: 'r1:2026-11-25:09:00', reminderId: 'r1', date: '2026-11-25', snoozed: false })
    expect(dueReminder(base, at('2026-11-25T03:59:00Z'), 'Asia/Almaty')).toBeNull()
    expect(dueReminder(base, at('2026-11-25T04:30:00Z'), 'Asia/Almaty')).toBeNull()
  })
  it('respects the schedule and enabled flag', () => {
    expect(dueReminder({ ...base, enabled: false }, at('2026-11-25T04:05:00Z'), 'Asia/Almaty')).toBeNull()
    // 2026-11-25 is a Wednesday.
    expect(dueReminder({ ...base, schedule: { ...base.schedule, repeat: 'weekends' } }, at('2026-11-25T04:05:00Z'), 'Asia/Almaty')).toBeNull()
    expect(dueReminder({ ...base, schedule: { ...base.schedule, repeat: 'custom', days: [3] } }, at('2026-11-25T04:05:00Z'), 'Asia/Almaty')).not.toBeNull()
  })
  it('skips a reminder completed today but not one completed yesterday', () => {
    expect(dueReminder({ ...base, completedAt: Timestamp.fromDate(at('2026-11-25T03:00:00Z')) }, at('2026-11-25T04:05:00Z'), 'Asia/Almaty')).toBeNull()
    expect(dueReminder({ ...base, completedAt: Timestamp.fromDate(at('2026-11-24T03:00:00Z')) }, at('2026-11-25T04:05:00Z'), 'Asia/Almaty')).not.toBeNull()
  })
  it('fires again after a snooze', () => {
    const snoozedUntil = Timestamp.fromDate(at('2026-11-25T06:00:00Z'))
    expect(dueReminder({ ...base, snoozedUntil }, at('2026-11-25T06:02:00Z'), 'Asia/Almaty')?.key).toBe(`r1:snooze:${snoozedUntil.toMillis()}`)
  })
})

describe('reminder helpers', () => {
  it('formats local time in a timezone', () => {
    expect(localTimeInTimeZone(at('2026-11-25T19:30:00Z'), 'Asia/Almaty')).toBe('00:30')
  })
  it('validates links', () => {
    expect(() => validateReminderLink(null)).not.toThrow()
    expect(() => validateReminderLink({ kind: 'habit', id: 'abc_123' })).not.toThrow()
    expect(() => validateReminderLink({ kind: 'note' as 'habit', id: 'x' })).toThrow()
    expect(() => validateReminderLink({ kind: 'task', id: 'a/b' })).toThrow()
  })
})
