import { addDays } from '../utils/dates'
import { BackendError } from '../utils/errors'
import { validateHabitInput, validateId } from '../utils/validation'
import { createHabitRecord, deleteHabitRecord, readHabit, readHabits, setHabitArchived, updateHabitSettings } from '../repositories/habit.repository'
import { readHabitSettingsHistory, readLogsByRange } from '../repositories/habit.repository'
import { calculateStreakSummary } from '../engines/streak.engine'
import { currentUserContext, currentUserId, runBackendOperation } from './shared'
import type { Habit, HabitSchedule, HabitType, LocalDate } from '../types'
import { assertLocalDate } from '../utils/dates'

export interface HabitInput {
  name: string
  description?: string
  type: HabitType
  targetPerDay: number
  schedule: HabitSchedule
}

export function createHabit(input: HabitInput): Promise<Habit> {
  return runBackendOperation(async () => {
    validateHabitInput(input)
    const { uid, today } = await currentUserContext()
    return createHabitRecord(uid, {
      name: input.name.trim(), description: input.description?.trim() ?? '',
      type: input.type, targetPerDay: input.targetPerDay, schedule: input.schedule, effectiveFrom: today,
    })
  })
}

export function getHabit(habitId: string): Promise<Habit> {
  return runBackendOperation(async () => {
    validateId(habitId, 'habitId')
    const habit = await readHabit(currentUserId(), habitId)
    if (!habit) throw new BackendError('not-found', 'Habit was not found.')
    return habit
  })
}

export function getHabits(options: { includeArchived?: boolean } = {}): Promise<Habit[]> {
  return runBackendOperation(async () => {
    if (!options || typeof options !== 'object') throw new BackendError('validation', 'Habit query options must be an object.')
    const habits = await readHabits(currentUserId())
    return options.includeArchived ? habits.filter((habit) => !habit.isDeleting) : habits.filter((habit) => !habit.isArchived && !habit.isDeleting)
  })
}

export function updateHabit(habitId: string, input: HabitInput): Promise<Habit> {
  return runBackendOperation(async () => {
    validateId(habitId, 'habitId')
    validateHabitInput(input)
    const { uid, today } = await currentUserContext()
    const existing = await readHabit(uid, habitId)
    if (!existing) throw new BackendError('not-found', 'Habit was not found.')
    if (existing.isDeleting) throw new BackendError('failed-precondition', 'A habit being deleted cannot be updated.')
    if (existing.type !== input.type) throw new BackendError('failed-precondition', 'Habit type is immutable. Create a new habit to change between boolean and count.')
    return updateHabitSettings(uid, habitId, {
      name: input.name.trim(), description: input.description?.trim() ?? '',
      type: input.type, targetPerDay: input.targetPerDay, schedule: input.schedule,
      effectiveFrom: addDays(today, 1),
    })
  })
}

export function archiveHabit(habitId: string): Promise<Habit> {
  return setArchived(habitId, true)
}

export function restoreHabit(habitId: string): Promise<Habit> {
  return setArchived(habitId, false)
}

function setArchived(habitId: string, archived: boolean): Promise<Habit> {
  return runBackendOperation(async () => {
    validateId(habitId, 'habitId')
    const { uid, today } = await currentUserContext()
    const habit = await readHabit(uid, habitId)
    if (!habit) throw new BackendError('not-found', 'Habit was not found.')
    if (habit.isDeleting) throw new BackendError('failed-precondition', 'A habit being deleted cannot be updated.')
    if (habit.isArchived === archived) return habit
    return setHabitArchived(uid, habitId, archived, addDays(today, 1))
  })
}

export function deleteHabit(habitId: string): Promise<void> {
  return runBackendOperation(async () => {
    validateId(habitId, 'habitId')
    const uid = currentUserId()
    if (!await readHabit(uid, habitId)) throw new BackendError('not-found', 'Habit was not found.')
    await deleteHabitRecord(uid, habitId)
  })
}

export function getHabitStreak(habitId: string, asOfDate?: LocalDate) {
  return runBackendOperation(async () => {
    validateId(habitId, 'habitId')
    const { uid, today } = await currentUserContext()
    const date = asOfDate ?? today
    assertLocalDate(date)
    if (date > today) throw new BackendError('validation', 'Streaks cannot be calculated for future dates.')
    const habit = await readHabit(uid, habitId)
    if (!habit) throw new BackendError('not-found', 'Habit was not found.')
    const history = await readHabitSettingsHistory(uid, date)
    const firstDate = history.filter((item) => item.habitId === habitId).map((item) => item.effectiveFrom).sort()[0]
    if (!firstDate || firstDate > date) return { currentStreak: 0, longestStreak: 0, totalCompletedDays: 0, completionRate: 0, scheduledDays: 0 }
    const logs = await readLogsByRange(uid, firstDate, date)
    return calculateStreakSummary(habit, history, logs, date, today)
  })
}
