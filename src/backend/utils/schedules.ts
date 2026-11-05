import { BackendError } from './errors'
import { assertLocalDate, daysBetween, isoWeekday, isLocalDate } from './dates'
import type { HabitSchedule, LocalDate } from '../types'

export function validateSchedule(value: unknown): asserts value is HabitSchedule {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    throw new BackendError('validation', 'schedule must be a supported schedule object.')
  }
  const schedule = value as Record<string, unknown>
  if (schedule.type === 'daily') return
  if (schedule.type === 'weekdays') {
    if (!Array.isArray(schedule.days) || schedule.days.length === 0) {
      throw new BackendError('validation', 'Weekday schedules need at least one day.')
    }
    if (!schedule.days.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)) {
      throw new BackendError('validation', 'Weekday values must use ISO numbering from 1 to 7.')
    }
    if (new Set(schedule.days).size !== schedule.days.length) {
      throw new BackendError('validation', 'Weekday schedules cannot contain duplicate days.')
    }
    return
  }
  if (schedule.type === 'interval') {
    if (!Number.isInteger(schedule.everyNDays) || Number(schedule.everyNDays) < 1 || Number(schedule.everyNDays) > 365) {
      throw new BackendError('validation', 'everyNDays must be an integer from 1 to 365.')
    }
    assertLocalDate(schedule.startDate, 'schedule.startDate')
    return
  }
  throw new BackendError('validation', 'schedule.type must be daily, weekdays, or interval.')
}

export function isScheduledDate(schedule: HabitSchedule, date: LocalDate): boolean {
  assertLocalDate(date)
  validateSchedule(schedule)
  if (schedule.type === 'daily') return true
  if (schedule.type === 'weekdays') return schedule.days.includes(isoWeekday(date))
  if (date < schedule.startDate) return false
  return daysBetween(schedule.startDate, date) % schedule.everyNDays === 0
}

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

export function isValidLocalDate(value: unknown): value is LocalDate {
  return isLocalDate(value)
}
