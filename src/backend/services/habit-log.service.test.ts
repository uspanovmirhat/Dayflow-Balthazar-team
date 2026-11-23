import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'

const mocks = vi.hoisted(() => ({
  readHabit: vi.fn(),
  readHabitLog: vi.fn(),
  readHabitSettingsHistory: vi.fn(),
  readHabitSettingsForHabit: vi.fn(),
  readHabitLogsByRange: vi.fn(),
  readLogsByRange: vi.fn(),
  createHabitLogRecord: vi.fn(),
  deleteHabitLogRecord: vi.fn(),
  settingsForDate: vi.fn(),
  getHabitDay: vi.fn(),
  currentUserContext: vi.fn(),
  currentUserId: vi.fn(),
}))

vi.mock('../repositories/habit.repository', () => ({
  readHabit: mocks.readHabit,
  readHabitLog: mocks.readHabitLog,
  readHabitSettingsHistory: mocks.readHabitSettingsHistory,
  readHabitSettingsForHabit: mocks.readHabitSettingsForHabit,
  readHabitLogsByRange: mocks.readHabitLogsByRange,
  readLogsByRange: mocks.readLogsByRange,
  createHabitLogRecord: mocks.createHabitLogRecord,
  deleteHabitLogRecord: mocks.deleteHabitLogRecord,
}))
vi.mock('../engines/streak.engine', () => ({
  settingsForDate: mocks.settingsForDate,
  getHabitDay: mocks.getHabitDay,
}))
vi.mock('./shared', () => ({
  currentUserContext: mocks.currentUserContext,
  currentUserId: mocks.currentUserId,
  runBackendOperation: (operation: () => Promise<unknown>) => operation(),
}))

import { addHabitLog, getDailyProgress, getHabitLogs, removeHabitLog } from './habit-log.service'
import type { Habit, HabitSettings, LocalDate } from '../types'

const habit = {
  id: 'h1', userId: 'u1', name: 'Read', description: '', type: 'boolean', targetPerDay: 1,
  schedule: { type: 'daily' }, isArchived: false, archivedFrom: null, isDeleting: false,
  settingsVersion: 2,
} as Habit
const settings = {
  id: '2', userId: 'u1', habitId: 'h1', type: 'boolean', targetPerDay: 1,
  schedule: { type: 'daily' }, isArchived: false, effectiveFrom: '2026-11-05', version: 2,
  createdAt: Timestamp.fromDate(new Date('2026-11-05T00:00:00.000Z')),
} as HabitSettings

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUserContext.mockResolvedValue({ uid: 'u1', today: '2026-11-05' })
  mocks.currentUserId.mockReturnValue('u1')
  mocks.readHabit.mockResolvedValue(habit)
  mocks.readHabitSettingsHistory.mockResolvedValue([settings])
  mocks.readHabitSettingsForHabit.mockResolvedValue([settings])
  mocks.readHabitLogsByRange.mockResolvedValue([])
  mocks.readLogsByRange.mockResolvedValue([])
  mocks.settingsForDate.mockReturnValue(settings)
  mocks.createHabitLogRecord.mockResolvedValue({ id: 'log1' })
  mocks.readHabitLog.mockResolvedValue({ id: 'log1' })
  mocks.deleteHabitLogRecord.mockResolvedValue(undefined)
})

describe('habit log service', () => {
  it('rejects archived or deleting habits before writing', async () => {
    mocks.settingsForDate.mockReturnValue({ ...settings, isArchived: true })
    await expect(addHabitLog('h1')).rejects.toMatchObject({ code: 'failed-precondition' })
    mocks.settingsForDate.mockReturnValue(settings)
    mocks.readHabit.mockResolvedValue({ ...habit, isDeleting: true })
    await expect(addHabitLog('h1')).rejects.toMatchObject({ code: 'failed-precondition' })
    expect(mocks.createHabitLogRecord).not.toHaveBeenCalled()
  })

  it('rejects unscheduled dates and does not create a log', async () => {
    mocks.settingsForDate.mockReturnValue({ ...settings, schedule: { type: 'weekdays', days: [1] } })
    await expect(addHabitLog('h1', { date: '2026-11-05' })).rejects.toMatchObject({ code: 'failed-precondition' })
    expect(mocks.createHabitLogRecord).not.toHaveBeenCalled()
  })

  it('writes a scheduled boolean log using the settings version effective on that date', async () => {
    await addHabitLog('h1')
    expect(mocks.readHabitSettingsForHabit).toHaveBeenCalledWith('u1', 'h1', '2026-11-05')
    expect(mocks.createHabitLogRecord).toHaveBeenCalledWith('u1', expect.objectContaining({ settingsVersion: 2 }), 1, '2026-11-05')
    expect(mocks.readHabitLogsByRange).not.toHaveBeenCalled()
  })

  it('prevents a second boolean completion for the same local day', async () => {
    mocks.createHabitLogRecord.mockRejectedValue(Object.assign(new Error('already exists'), { code: 'already-exists' }))
    await expect(addHabitLog('h1')).rejects.toMatchObject({ code: 'already-exists' })
    expect(mocks.createHabitLogRecord).toHaveBeenCalledOnce()
    expect(mocks.readHabitLogsByRange).not.toHaveBeenCalled()
  })

  it('validates and forwards count increments and supports log deletion', async () => {
    mocks.readHabit.mockResolvedValue({ ...habit, type: 'count' })
    mocks.settingsForDate.mockReturnValue({ ...settings, type: 'count', targetPerDay: 8 })
    await addHabitLog('h1', { value: 3 })
    expect(mocks.createHabitLogRecord).toHaveBeenCalledWith('u1', expect.objectContaining({ type: 'count', settingsVersion: 2 }), 3, '2026-11-05')
    await removeHabitLog('h1', 'log1')
    expect(mocks.deleteHabitLogRecord).toHaveBeenCalledWith('u1', 'h1', 'log1')
  })

  it('allows repeated count completions as separate log records', async () => {
    mocks.readHabit.mockResolvedValue({ ...habit, type: 'count' })
    mocks.settingsForDate.mockReturnValue({ ...settings, type: 'count', targetPerDay: 3 })
    mocks.createHabitLogRecord
      .mockResolvedValueOnce({ id: 'log-1', value: 1 })
      .mockResolvedValueOnce({ id: 'log-2', value: 1 })

    await addHabitLog('h1', { value: 1 })
    await addHabitLog('h1', { value: 1 })

    expect(mocks.createHabitLogRecord).toHaveBeenCalledTimes(2)
    expect(mocks.createHabitLogRecord).toHaveBeenNthCalledWith(1, 'u1', expect.objectContaining({ type: 'count' }), 1, '2026-11-05')
    expect(mocks.createHabitLogRecord).toHaveBeenNthCalledWith(2, 'u1', expect.objectContaining({ type: 'count' }), 1, '2026-11-05')
  })

  it('restores daily progress from persisted habit log values', async () => {
    const logs = [{ id: 'log-1', habitId: 'h1', date: '2026-11-05', value: 1 }, { id: 'log-2', habitId: 'h1', date: '2026-11-05', value: 1 }]
    mocks.readHabit.mockResolvedValue({ ...habit, type: 'count' })
    mocks.readHabitSettingsForHabit.mockResolvedValue([{ ...settings, type: 'count', targetPerDay: 3 }])
    mocks.readHabitLogsByRange.mockResolvedValue(logs)
    mocks.getHabitDay.mockReturnValue({ value: 2, target: 3, completed: false })

    await expect(getDailyProgress('h1')).resolves.toEqual({ value: 2, target: 3, completed: false })
    expect(mocks.readHabitLogsByRange).toHaveBeenCalledWith('u1', 'h1', '2026-11-05', '2026-11-05')
    expect(mocks.getHabitDay).toHaveBeenCalledWith(expect.any(Object), expect.any(Array), logs, '2026-11-05')
  })

  it('reads a habit-scoped log range without using the global collection-group query', async () => {
    const logs = [{ id: 'log-1', habitId: 'h1' }]
    mocks.readHabitLogsByRange.mockResolvedValue(logs)

    await expect(getHabitLogs('2026-11-01' as LocalDate, '2026-11-05' as LocalDate, 'h1')).resolves.toEqual(logs)
    expect(mocks.readHabitLogsByRange).toHaveBeenCalledWith('u1', 'h1', '2026-11-01', '2026-11-05')
    expect(mocks.readLogsByRange).not.toHaveBeenCalled()
  })
})
