import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readHabits: vi.fn(), readHabitSettingsHistory: vi.fn(), readLogsByRange: vi.fn(),
  readTaskStatusHistory: vi.fn(), readTasks: vi.fn(), currentUserContext: vi.fn(),
}))

vi.mock('../repositories/habit.repository', () => ({
  readHabits: mocks.readHabits, readHabitSettingsHistory: mocks.readHabitSettingsHistory, readLogsByRange: mocks.readLogsByRange,
}))
vi.mock('../repositories/task.repository', () => ({ readTaskStatusHistory: mocks.readTaskStatusHistory, readTasks: mocks.readTasks }))
vi.mock('./shared', () => ({
  currentUserContext: mocks.currentUserContext,
  runBackendOperation: (operation: () => Promise<unknown>) => operation(),
}))

import { getDashboardSummary, getHabitAnalytics, getTaskAnalytics } from './analytics.service'
import type { Habit, HabitLog, HabitSettings } from '../types'

const habit = {
  id: 'h1', userId: 'u1', name: 'Read', description: '', type: 'boolean', targetPerDay: 1,
  schedule: { type: 'daily' }, isArchived: false, archivedFrom: null, settingsVersion: 1,
} as Habit
const settings = [{
  id: '1', userId: 'u1', habitId: 'h1', type: 'boolean', targetPerDay: 1, schedule: { type: 'daily' },
  isArchived: false, effectiveFrom: '2026-11-02', version: 1, createdAt: {} as HabitSettings['createdAt'],
}] as HabitSettings[]
const logs = ['2026-11-02', '2026-11-03'].map((date) => ({
  id: date, userId: 'u1', habitId: 'h1', value: 1, date, completedAt: {} as HabitLog['completedAt'],
})) as HabitLog[]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUserContext.mockResolvedValue({ uid: 'u1', today: '2026-11-05' })
  mocks.readHabits.mockResolvedValue([habit])
  mocks.readHabitSettingsHistory.mockResolvedValue(settings)
  mocks.readLogsByRange.mockResolvedValue(logs)
  mocks.readTasks.mockResolvedValue([])
  mocks.readTaskStatusHistory.mockResolvedValue([])
})

describe('analytics service date boundaries', () => {
  it('rejects future ranges and future dashboard dates', async () => {
    await expect(getHabitAnalytics('2026-11-01', '2026-11-06')).rejects.toMatchObject({ code: 'validation' })
    await expect(getTaskAnalytics('2026-11-01', '2026-11-06')).rejects.toMatchObject({ code: 'validation' })
    await expect(getDashboardSummary('2026-11-06')).rejects.toMatchObject({ code: 'validation' })
    expect(mocks.readHabits).not.toHaveBeenCalled()
  })

  it('counts a past incomplete scheduled day as a streak break in historical dashboard results', async () => {
    const dashboard = await getDashboardSummary('2026-11-04')
    expect(dashboard.currentStreaks).toEqual([{ habitId: 'h1', name: 'Read', streak: 0 }])
  })

  it('keeps an incomplete selected current day pending in dashboard streaks', async () => {
    mocks.readLogsByRange.mockResolvedValue([...logs, {
      id: '2026-11-04', userId: 'u1', habitId: 'h1', value: 1, date: '2026-11-04', completedAt: {} as HabitLog['completedAt'],
    }])
    const dashboard = await getDashboardSummary('2026-11-05')
    expect(dashboard.currentStreaks[0].streak).toBe(3)
  })
})
