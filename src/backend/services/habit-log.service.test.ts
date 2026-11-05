import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'

const mocks = vi.hoisted(() => ({
  readHabit: vi.fn(),
  readHabitLog: vi.fn(),
  readHabitSettingsHistory: vi.fn(),
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

import { addHabitLog, removeHabitLog } from './habit-log.service'
import type { Habit, HabitSettings } from '../types'

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
    expect(mocks.createHabitLogRecord).toHaveBeenCalledWith('u1', expect.objectContaining({ settingsVersion: 2 }), 1, '2026-11-05')
  })

  it('validates and forwards count increments and supports log deletion', async () => {
    mocks.readHabit.mockResolvedValue({ ...habit, type: 'count' })
    mocks.settingsForDate.mockReturnValue({ ...settings, type: 'count', targetPerDay: 8 })
    await addHabitLog('h1', { value: 3 })
    expect(mocks.createHabitLogRecord).toHaveBeenCalledWith('u1', expect.objectContaining({ type: 'count', settingsVersion: 2 }), 3, '2026-11-05')
    await removeHabitLog('h1', 'log1')
    expect(mocks.deleteHabitLogRecord).toHaveBeenCalledWith('u1', 'h1', 'log1')
  })
})
