import type { Habit, HabitLog, HabitSettings, HabitType, LocalDate } from '../types'
import { BackendError } from '../utils/errors'
import { validateHabitInput } from '../utils/validation'
import { assertLocalDate } from '../utils/dates'
import { asRecord, requireStoredDate, requireStoredString, requireStoredTimestamp } from './common.schema'

function storedSchedule(value: unknown) {
  try {
    validateHabitInput({ name: 'valid', type: 'boolean', targetPerDay: 1, schedule: value })
    return value as Habit['schedule']
  } catch {
    throw new BackendError('failed-precondition', 'Stored habit schedule is invalid.')
  }
}

function storedType(value: unknown): HabitType {
  if (value !== 'boolean' && value !== 'count') throw new BackendError('failed-precondition', 'Stored habit type is invalid.')
  return value
}

function storedTarget(value: unknown, type: HabitType): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || (type === 'boolean' && value !== 1)) {
    throw new BackendError('failed-precondition', 'Stored habit target is invalid.')
  }
  return value
}

export function parseHabit(value: unknown, expectedUid: string, expectedId: string): Habit {
  const data = asRecord(value, 'habit')
  const id = requireStoredString(data.id, 'habit.id', 128)
  const userId = requireStoredString(data.userId, 'habit.userId', 128)
  if (id !== expectedId || userId !== expectedUid) throw new BackendError('failed-precondition', 'Habit ownership or ID does not match its document path.')
  const type = storedType(data.type)
  const targetPerDay = storedTarget(data.targetPerDay, type)
  const isArchived = typeof data.isArchived === 'boolean' ? data.isArchived : null
  if (isArchived === null) throw new BackendError('failed-precondition', 'Stored habit archive state is invalid.')
  const isDeleting = data.isDeleting === undefined ? false : data.isDeleting
  if (typeof isDeleting !== 'boolean') throw new BackendError('failed-precondition', 'Stored habit deletion state is invalid.')
  let archivedFrom: LocalDate | null
  if (isArchived) archivedFrom = requireStoredDate(data.archivedFrom, 'habit.archivedFrom')
  else if (data.archivedFrom === null) archivedFrom = null
  else throw new BackendError('failed-precondition', 'Active habit cannot have archivedFrom set.')
  if (!Number.isInteger(data.settingsVersion) || Number(data.settingsVersion) < 1) throw new BackendError('failed-precondition', 'Stored habit settingsVersion is invalid.')
  try {
    validateHabitInput({ name: data.name, description: data.description, type, targetPerDay, schedule: data.schedule })
  } catch {
    throw new BackendError('failed-precondition', 'Stored habit fields are invalid.')
  }
  return {
    id, userId,
    name: requireStoredString(data.name, 'habit.name', 120),
    description: requireStoredString(data.description, 'habit.description', 2000, true),
    type, targetPerDay, schedule: storedSchedule(data.schedule), isArchived, archivedFrom,
    isDeleting,
    settingsVersion: Number(data.settingsVersion),
    createdAt: requireStoredTimestamp(data.createdAt, 'habit.createdAt'),
    updatedAt: requireStoredTimestamp(data.updatedAt, 'habit.updatedAt'),
  }
}

export function parseHabitSettings(value: unknown, expectedUid: string, expectedHabitId: string, expectedId: string): HabitSettings {
  const data = asRecord(value, 'habit settings')
  const id = requireStoredString(data.id, 'settings.id', 128)
  const userId = requireStoredString(data.userId, 'settings.userId', 128)
  const habitId = requireStoredString(data.habitId, 'settings.habitId', 128)
  if (id !== expectedId || userId !== expectedUid || habitId !== expectedHabitId) throw new BackendError('failed-precondition', 'Habit settings ownership or ID is invalid.')
  const type = storedType(data.type)
  const targetPerDay = storedTarget(data.targetPerDay, type)
  const isArchived = typeof data.isArchived === 'boolean' ? data.isArchived : null
  if (isArchived === null || !Number.isInteger(data.version) || Number(data.version) < 1) throw new BackendError('failed-precondition', 'Stored habit settings are invalid.')
  if (id !== String(data.version)) throw new BackendError('failed-precondition', 'Habit settings version does not match its document ID.')
  const schedule = storedSchedule(data.schedule)
  const effectiveFrom = requireStoredDate(data.effectiveFrom, 'settings.effectiveFrom')
  if (schedule.type === 'interval') assertLocalDate(schedule.startDate, 'settings.schedule.startDate')
  return {
    id, userId, habitId, type, targetPerDay, schedule, isArchived,
    effectiveFrom, version: Number(data.version),
    createdAt: requireStoredTimestamp(data.createdAt, 'settings.createdAt'),
  }
}

export function parseHabitLog(value: unknown, expectedUid: string, expectedHabitId: string, expectedId: string): HabitLog {
  const data = asRecord(value, 'habit log')
  const id = requireStoredString(data.id, 'log.id', 128)
  const userId = requireStoredString(data.userId, 'log.userId', 128)
  const habitId = requireStoredString(data.habitId, 'log.habitId', 128)
  if (id !== expectedId || userId !== expectedUid || habitId !== expectedHabitId) throw new BackendError('failed-precondition', 'Habit log ownership or ID is invalid.')
  if (typeof data.value !== 'number' || !Number.isFinite(data.value) || data.value <= 0 || data.value > 1_000_000) {
    throw new BackendError('failed-precondition', 'Stored habit log value is invalid.')
  }
  const settingsVersion = data.settingsVersion === undefined ? undefined : Number(data.settingsVersion)
  if (settingsVersion !== undefined && (!Number.isInteger(settingsVersion) || settingsVersion < 1)) {
    throw new BackendError('failed-precondition', 'Stored habit log settingsVersion is invalid.')
  }
  return {
    id, userId, habitId, value: data.value,
    date: requireStoredDate(data.date, 'log.date'),
    ...(settingsVersion === undefined ? {} : { settingsVersion }),
    completedAt: requireStoredTimestamp(data.completedAt, 'log.completedAt'),
  }
}
