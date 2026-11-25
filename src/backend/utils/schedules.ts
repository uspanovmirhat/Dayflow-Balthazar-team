import { BackendError } from './errors'
import { addDays, assertLocalDate, daysBetween, isoWeekday, isLocalDate } from './dates'
import type { HabitSchedule, LocalDate } from '../types'

export function validateSchedule(value: unknown): asserts value is HabitSchedule {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    throw new BackendError('validation', 'schedule must be a supported schedule object.')
  }
  const schedule = value as Record<string, unknown>
  const hasExactKeys = (...keys: string[]) => Object.keys(schedule).length === keys.length && keys.every((key) => Object.hasOwn(schedule, key))
  if (schedule.type === 'daily') {
    if (!hasExactKeys('type')) throw new BackendError('validation', 'Daily schedules only accept the type field.')
    return
  }
  if (schedule.type === 'weekdays') {
    if (!hasExactKeys('type', 'days')) throw new BackendError('validation', 'Weekday schedules only accept type and days fields.')
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
    if (!hasExactKeys('type', 'everyNDays', 'startDate')) throw new BackendError('validation', 'Interval schedules only accept type, everyNDays, and startDate fields.')
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

/** First date on or after `from` when the schedule is due. Interval schedules are computed arithmetically. */
export function nextScheduledDate(schedule: HabitSchedule, from: LocalDate): LocalDate {
  assertLocalDate(from, 'from')
  validateSchedule(schedule)
  if (schedule.type === 'daily') return from
  if (schedule.type === 'interval') {
    if (from <= schedule.startDate) return schedule.startDate
    const remainder = daysBetween(schedule.startDate, from) % schedule.everyNDays
    return remainder === 0 ? from : addDays(from, schedule.everyNDays - remainder)
  }
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(from, offset)
    if (schedule.days.includes(isoWeekday(date))) return date
  }
  throw new BackendError('validation', 'Weekday schedules need at least one day.')
}

export function isValidTimezone(value: unknown): value is string {
  if (!isSupportedTimezone(value)) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

// Keep this allowlist aligned with firestore.rules. Rules cannot validate arbitrary IANA IDs.
export const SUPPORTED_TIMEZONES = [
  'UTC', 'Etc/UTC',
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Africa/Johannesburg',
  'Asia/Almaty', 'Asia/Aqtau', 'Asia/Aqtobe', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qostanay', 'Asia/Qyzylorda',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Pacific/Auckland',
] as const

export function isSupportedTimezone(value: unknown): value is typeof SUPPORTED_TIMEZONES[number] {
  return typeof value === 'string' && (SUPPORTED_TIMEZONES as readonly string[]).includes(value)
}

export function supportedTimezoneOrUtc(value: unknown): typeof SUPPORTED_TIMEZONES[number] {
  return isSupportedTimezone(value) ? value : 'UTC'
}

export function isValidLocalDate(value: unknown): value is LocalDate {
  return isLocalDate(value)
}
