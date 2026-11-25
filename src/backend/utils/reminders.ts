import type { LocalDate, Reminder, ReminderSchedule } from '../types'
import { addDays, assertLocalDate, enumerateDates, isoWeekday } from './dates'
import { BackendError } from './errors'

export function validateReminderSchedule(schedule: ReminderSchedule) {
  if (!schedule || !['once', 'daily', 'weekdays', 'weekends', 'weekly', 'custom'].includes(schedule.repeat)) throw new BackendError('validation', 'Выберите повторение напоминания.')
  assertLocalDate(schedule.startDate, 'startDate')
  if (schedule.endDate) { assertLocalDate(schedule.endDate, 'endDate'); if (schedule.endDate < schedule.startDate) throw new BackendError('validation', 'Дата окончания должна быть позже даты начала.') }
  if (schedule.repeat === 'custom' && (!Array.isArray(schedule.days) || !schedule.days.length || schedule.days.some((day) => !Number.isInteger(day) || day < 1 || day > 7))) throw new BackendError('validation', 'Выберите дни недели.')
}

export function reminderOccursOn(schedule: ReminderSchedule, date: LocalDate): boolean {
  if (date < schedule.startDate || (schedule.endDate && date > schedule.endDate)) return false
  const weekday = isoWeekday(date)
  if (schedule.repeat === 'once') return date === schedule.startDate
  if (schedule.repeat === 'daily') return true
  if (schedule.repeat === 'weekdays') return weekday <= 5
  if (schedule.repeat === 'weekends') return weekday >= 6
  if (schedule.repeat === 'weekly') return weekday === isoWeekday(schedule.startDate)
  return Boolean(schedule.days?.includes(weekday))
}

export function nextReminderOccurrence(reminder: Reminder, from: LocalDate): LocalDate | null {
  if (!reminder.enabled || reminder.completedAt) return null
  const end = reminder.schedule.endDate ?? addDays(from, 366)
  const start = from < reminder.schedule.startDate ? reminder.schedule.startDate : from
  return enumerateDates(start, end).find((date) => reminderOccursOn(reminder.schedule, date)) ?? null
}

export function reminderOccurrencesBetween(schedule: ReminderSchedule, start: LocalDate, end: LocalDate): LocalDate[] {
  return enumerateDates(start, end).filter((date) => reminderOccursOn(schedule, date))
}
