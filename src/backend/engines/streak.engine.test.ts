import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { calculateStreakSummary, getHabitDay } from './streak.engine'
import type { Habit, HabitLog, HabitSettings } from '../types'

const createdAt = Timestamp.fromDate(new Date('2026-11-01T00:00:00.000Z'))
const habit: Habit = {
  id: 'read', userId: 'user-1', name: 'Read', description: '', type: 'boolean', targetPerDay: 1,
  schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] }, isArchived: false, archivedFrom: null, isDeleting: false,
  settingsVersion: 1, createdAt, updatedAt: createdAt,
}
const settings: HabitSettings[] = [{
  id: '1', userId: 'user-1', habitId: 'read', type: 'boolean', targetPerDay: 1,
  schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] }, isArchived: false,
  effectiveFrom: '2026-11-02', version: 1, createdAt,
}]

function logsFor(dates: string[]): HabitLog[] {
  return dates.map((date, index) => ({
    id: date, userId: 'user-1', habitId: 'read', value: 1,
    date: date as HabitLog['date'], settingsVersion: 1,
    completedAt: Timestamp.fromDate(new Date(`2026-11-${String(index + 2).padStart(2, '0')}T12:00:00.000Z`)),
  }))
}

describe('streak engine', () => {
  it('does not break a streak on an unscheduled weekend', () => {
    const summary = calculateStreakSummary(habit, settings, logsFor(['2026-11-06', '2026-11-09']), '2026-11-10', '2026-11-10')
    expect(summary.currentStreak).toBe(2)
    expect(summary.longestStreak).toBe(2)
  })

  it('keeps an incomplete current day pending but counts a historical miss as a break', () => {
    const completePriorDays = logsFor(['2026-11-02', '2026-11-03', '2026-11-04'])
    expect(calculateStreakSummary(habit, settings, completePriorDays, '2026-11-05', '2026-11-05').currentStreak).toBe(3)
    expect(calculateStreakSummary(habit, settings, logsFor(['2026-11-02']), '2026-11-04', '2026-11-05').currentStreak).toBe(0)
  })

  it('breaks a historical streak on an incomplete scheduled date and preserves the earlier maximum', () => {
    const summary = calculateStreakSummary(habit, settings, logsFor(['2026-11-02', '2026-11-03']), '2026-11-05', '2026-11-06')
    expect(summary).toMatchObject({ currentStreak: 0, longestStreak: 2, totalCompletedDays: 2 })
  })

  it('rejects an as-of date in the future', () => {
    expect(() => calculateStreakSummary(habit, settings, [], '2026-11-06', '2026-11-05')).toThrow(/future/)
  })

  it('handles interval schedules without counting a historical miss as pending', () => {
    const intervalHabit: Habit = { ...habit, schedule: { type: 'interval', everyNDays: 2, startDate: '2026-11-02' } }
    const intervalSettings: HabitSettings[] = [{ ...settings[0], schedule: intervalHabit.schedule }]
    const logs = logsFor(['2026-11-02', '2026-11-04'])
    const historical = calculateStreakSummary(intervalHabit, intervalSettings, logs, '2026-11-06', '2026-11-07')
    const current = calculateStreakSummary(intervalHabit, intervalSettings, logs, '2026-11-06', '2026-11-06')
    expect(historical.currentStreak).toBe(0)
    expect(current.currentStreak).toBe(2)
  })

  it('uses the settings version effective on each historical date', () => {
    const updated: HabitSettings[] = [
      ...settings,
      { ...settings[0], id: '2', version: 2, effectiveFrom: '2026-11-04', schedule: { type: 'daily' } },
    ]
    expect(getHabitDay(habit, updated, logsFor(['2026-11-02']), '2026-11-03').scheduled).toBe(true)
    expect(getHabitDay(habit, updated, logsFor(['2026-11-02']), '2026-11-07').scheduled).toBe(true)
  })

  it('counts a day habit only when cumulative count reaches the historical target', () => {
    const countHabit: Habit = { ...habit, id: 'water', type: 'count', targetPerDay: 8, schedule: { type: 'daily' } }
    const countSettings: HabitSettings[] = [{ ...settings[0], habitId: 'water', type: 'count', targetPerDay: 8, schedule: { type: 'daily' } }]
    const countLogs: HabitLog[] = [
      { id: 'a', userId: 'user-1', habitId: 'water', value: 3, date: '2026-11-02', settingsVersion: 1, completedAt: createdAt },
      { id: 'b', userId: 'user-1', habitId: 'water', value: 5, date: '2026-11-02', settingsVersion: 1, completedAt: createdAt },
    ]
    expect(getHabitDay(countHabit, countSettings, countLogs, '2026-11-02')).toMatchObject({ value: 8, target: 8, completed: true })
  })
})
