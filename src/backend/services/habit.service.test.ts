import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createHabitRecord: vi.fn(),
  deleteHabitRecord: vi.fn(),
  readHabit: vi.fn(),
  readHabits: vi.fn(),
  setHabitArchived: vi.fn(),
  updateHabitSettings: vi.fn(),
  readHabitSettingsHistory: vi.fn(),
  readLogsByRange: vi.fn(),
  currentUserContext: vi.fn(),
  currentUserId: vi.fn(),
}))

vi.mock('../repositories/habit.repository', () => ({
  createHabitRecord: mocks.createHabitRecord,
  deleteHabitRecord: mocks.deleteHabitRecord,
  readHabit: mocks.readHabit,
  readHabits: mocks.readHabits,
  setHabitArchived: mocks.setHabitArchived,
  updateHabitSettings: mocks.updateHabitSettings,
  readHabitSettingsHistory: mocks.readHabitSettingsHistory,
  readLogsByRange: mocks.readLogsByRange,
}))
vi.mock('./shared', () => ({
  currentUserContext: mocks.currentUserContext,
  currentUserId: mocks.currentUserId,
  runBackendOperation: (operation: () => Promise<unknown>) => operation(),
}))

import { archiveHabit, createHabit, deleteHabit, getHabits, updateHabit } from './habit.service'
import type { Habit } from '../types'

const habit = {
  id: 'h1', userId: 'u1', name: 'Read', description: '', type: 'boolean', targetPerDay: 1,
  schedule: { type: 'daily' }, isArchived: false, archivedFrom: null, isDeleting: false,
  settingsVersion: 1,
} as Habit

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUserContext.mockResolvedValue({ uid: 'u1', today: '2026-11-05' })
  mocks.currentUserId.mockReturnValue('u1')
  mocks.readHabit.mockResolvedValue(habit)
  mocks.readHabits.mockResolvedValue([habit, { ...habit, id: 'deleting', isDeleting: true }])
  mocks.createHabitRecord.mockResolvedValue(habit)
  mocks.updateHabitSettings.mockResolvedValue(habit)
  mocks.setHabitArchived.mockResolvedValue({ ...habit, isArchived: true })
  mocks.deleteHabitRecord.mockResolvedValue(undefined)
})

describe('habit service CRUD', () => {
  it('creates a trimmed habit with initial settings effective today', async () => {
    await createHabit({ name: '  Read  ', type: 'boolean', targetPerDay: 1, schedule: { type: 'daily' } })
    expect(mocks.createHabitRecord).toHaveBeenCalledWith('u1', expect.objectContaining({ name: 'Read', effectiveFrom: '2026-11-05' }))
  })

  it('updates settings effective next local day and rejects type changes', async () => {
    await updateHabit('h1', { name: 'Read more', type: 'boolean', targetPerDay: 1, schedule: { type: 'daily' } })
    expect(mocks.updateHabitSettings).toHaveBeenCalledWith('u1', 'h1', expect.objectContaining({ effectiveFrom: '2026-11-06' }))
    await expect(updateHabit('h1', { name: 'Read', type: 'count', targetPerDay: 2, schedule: { type: 'daily' } })).rejects.toMatchObject({ code: 'failed-precondition' })
  })

  it('archives via a versioned settings change and excludes deleting habits from reads', async () => {
    await archiveHabit('h1')
    expect(mocks.setHabitArchived).toHaveBeenCalledWith('u1', 'h1', true, '2026-11-06')
    expect(await getHabits()).toEqual([habit])
    expect(await getHabits({ includeArchived: true })).toEqual([habit])
  })

  it('deletes the habit through the repository cleanup operation', async () => {
    await deleteHabit('h1')
    expect(mocks.deleteHabitRecord).toHaveBeenCalledWith('u1', 'h1')
  })
})
