import { readHabit, readHabitLog, readHabitSettingsHistory, readLogsByRange, createHabitLogRecord, deleteHabitLogRecord } from '../repositories/habit.repository'
import { getHabitDay, settingsForDate } from '../engines/streak.engine'
import { BackendError } from '../utils/errors'
import { assertLocalDate } from '../utils/dates'
import { isScheduledDate } from '../utils/schedules'
import { validateId, validateNonNegativeRange } from '../utils/validation'
import { currentUserContext, currentUserId, runBackendOperation } from './shared'
import type { HabitLog, LocalDate } from '../types'

export function addHabitLog(habitId: string, input: { value?: number; date?: LocalDate } = {}): Promise<HabitLog> {
  return runBackendOperation(async () => {
    if (!input || typeof input !== 'object') throw new BackendError('validation', 'Habit log input must be an object.')
    validateId(habitId, 'habitId')
    const { uid, today } = await currentUserContext()
    const date = input.date ?? today
    assertLocalDate(date)
    if (date > today) throw new BackendError('validation', 'Habit logs cannot be added for future dates.')
    const habit = await readHabit(uid, habitId)
    if (!habit) throw new BackendError('not-found', 'Habit was not found.')
    if (habit.isDeleting) throw new BackendError('failed-precondition', 'A habit being deleted cannot receive new logs.')
    const history = await readHabitSettingsHistory(uid, date)
    const settings = settingsForDate(habit, history, date)
    if (settings.isArchived) throw new BackendError('failed-precondition', 'Archived habits cannot receive new logs for this date.')
    if (!isScheduledDate(settings.schedule, date)) throw new BackendError('failed-precondition', 'This habit is not scheduled for the selected date.')
    let value = 1
    if (settings.type === 'boolean') {
      if (input.value !== undefined && input.value !== 1) throw new BackendError('validation', 'Boolean habit log value must be 1.')
      const existing = await readLogsByRange(uid, date, date)
      if (existing.some((log) => log.habitId === habitId && log.date === date)) {
        throw new BackendError('already-exists', 'This habit is already completed for the selected date.')
      }
    } else {
      value = input.value ?? 1
      if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
        throw new BackendError('validation', 'Count log value must be greater than 0 and at most 1,000,000.')
      }
    }
    return createHabitLogRecord(uid, { ...habit, type: settings.type, settingsVersion: settings.version }, value, date)
  })
}

export function getHabitLogs(startDate: LocalDate, endDate: LocalDate, habitId?: string): Promise<HabitLog[]> {
  return runBackendOperation(async () => {
    validateNonNegativeRange(startDate, endDate)
    if (habitId) validateId(habitId, 'habitId')
    const uid = currentUserId()
    const logs = await readLogsByRange(uid, startDate, endDate)
    return habitId ? logs.filter((log) => log.habitId === habitId) : logs
  })
}

export function getDailyProgress(habitId: string, date?: LocalDate): Promise<{ value: number; target: number; completed: boolean }> {
  return runBackendOperation(async () => {
    validateId(habitId, 'habitId')
    const { uid, today } = await currentUserContext()
    const selectedDate = date ?? today
    assertLocalDate(selectedDate)
    if (selectedDate > today) throw new BackendError('validation', 'Daily progress is not available for future dates.')
    const habit = await readHabit(uid, habitId)
    if (!habit) throw new BackendError('not-found', 'Habit was not found.')
    const [history, logs] = await Promise.all([
      readHabitSettingsHistory(uid),
      readLogsByRange(uid, selectedDate, selectedDate),
    ])
    const day = getHabitDay(habit, history, logs, selectedDate)
    return { value: day.value, target: day.target, completed: day.completed }
  })
}

export function removeHabitLog(habitId: string, logId: string): Promise<void> {
  return runBackendOperation(async () => {
    validateId(habitId, 'habitId')
    validateId(logId, 'logId')
    const uid = currentUserId()
    if (!await readHabit(uid, habitId)) throw new BackendError('not-found', 'Habit was not found.')
    if (!await readHabitLog(uid, habitId, logId)) throw new BackendError('not-found', 'Habit log was not found.')
    await deleteHabitLogRecord(uid, habitId, logId)
  })
}
