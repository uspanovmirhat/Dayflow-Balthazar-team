import type { LocalDate, Reminder, ReminderLink, ReminderSchedule } from '../types'
import { addDays, assertLocalDate, enumerateDates, isoWeekday, localDateInTimeZone } from './dates'
import { BackendError } from './errors'

export function validateReminderSchedule(schedule: ReminderSchedule) {
  if (!schedule || !['once', 'daily', 'weekdays', 'weekends', 'weekly', 'custom'].includes(schedule.repeat)) throw new BackendError('validation', 'Выберите повторение напоминания.')
  assertLocalDate(schedule.startDate, 'startDate')
  if (schedule.endDate) { assertLocalDate(schedule.endDate, 'endDate'); if (schedule.endDate < schedule.startDate) throw new BackendError('validation', 'Дата окончания должна быть позже даты начала.') }
  if (schedule.repeat === 'custom' && (!Array.isArray(schedule.days) || !schedule.days.length || schedule.days.some((day) => !Number.isInteger(day) || day < 1 || day > 7))) throw new BackendError('validation', 'Выберите дни недели.')
}

export function validateReminderLink(link: ReminderLink | null | undefined) {
  if (link === null || link === undefined) return
  if (typeof link !== 'object' || (link.kind !== 'habit' && link.kind !== 'task') || typeof link.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(link.id) || Object.keys(link).some((key) => key !== 'kind' && key !== 'id')) {
    throw new BackendError('validation', 'Выберите привычку или задачу для напоминания.')
  }
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

/** Local wall-clock time `HH:MM` in the given IANA timezone. */
export function localTimeInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '00'
  return `${part('hour')}:${part('minute')}`
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

export interface DueReminder { key: string; reminderId: string; date: LocalDate; snoozed: boolean }

/**
 * Decides whether a reminder should notify right now.
 * A reminder is due from its time until `windowMinutes` later (so a late check still delivers it); a snoozed one is due
 * from `snoozedUntil` for the same window. The returned `key` is identical in the app and in `scripts/send-reminders.mjs`
 * so the same occurrence is never shown twice on one device. Keep both implementations in sync.
 */
export function dueReminder(reminder: Reminder, now: Date, timeZone: string, windowMinutes = 30): DueReminder | null {
  if (!reminder.enabled) return null
  const windowMs = windowMinutes * 60_000
  const snoozedUntil = reminder.snoozedUntil?.toMillis() ?? null
  if (snoozedUntil !== null && snoozedUntil <= now.getTime() && now.getTime() - snoozedUntil < windowMs) {
    return { key: `${reminder.id}:snooze:${snoozedUntil}`, reminderId: reminder.id, date: localDateInTimeZone(new Date(snoozedUntil), timeZone), snoozed: true }
  }
  const today = localDateInTimeZone(now, timeZone)
  const completedAt = reminder.completedAt?.toDate() ?? null
  if (completedAt && (reminder.schedule.repeat === 'once' || localDateInTimeZone(completedAt, timeZone) === today)) return null
  if (!reminderOccursOn(reminder.schedule, today)) return null
  const elapsed = minutesOf(localTimeInTimeZone(now, timeZone)) - minutesOf(reminder.time)
  if (elapsed < 0 || elapsed >= windowMinutes) return null
  return { key: `${reminder.id}:${today}:${reminder.time}`, reminderId: reminder.id, date: today, snoozed: false }
}
