import { readHabits, readHabitSettingsHistory, readLogsByRange } from '../repositories/habit.repository'
import { readTasksByDateRange } from '../repositories/task.repository'
import { buildCalendarDays } from '../engines/calendar.engine'
import { addDays, daysBetween, endOfMonth, startOfIsoWeek } from '../utils/dates'
import { BackendError } from '../utils/errors'
import { validateNonNegativeRange } from '../utils/validation'
import { currentUserContext, runBackendOperation } from './shared'
import type { CalendarDay, LocalDate } from '../types'

/** Longest range a single calendar request may cover (a little over a year). */
const MAX_CALENDAR_RANGE_DAYS = 400

export function getCalendarEvents(startDate: LocalDate, endDate: LocalDate): Promise<CalendarDay[]> {
  return runBackendOperation(async () => {
    validateNonNegativeRange(startDate, endDate)
    if (daysBetween(startDate, endDate) >= MAX_CALENDAR_RANGE_DAYS) throw new BackendError('validation', `Calendar range cannot exceed ${MAX_CALENDAR_RANGE_DAYS} days.`)
    const { uid, today } = await currentUserContext()
    const [habits, history, logs, tasks] = await Promise.all([
      readHabits(uid),
      readHabitSettingsHistory(uid),
      readLogsByRange(uid, startDate, endDate),
      readTasksByDateRange(uid, startDate, endDate),
    ])
    return buildCalendarDays(habits, history, logs, tasks, startDate, endDate, today)
  })
}

export function getCalendarEventsForDay(date: LocalDate): Promise<CalendarDay[]> {
  return getCalendarEvents(date, date)
}

export function getCalendarEventsForWeek(date: LocalDate): Promise<CalendarDay[]> {
  const start = startOfIsoWeek(date)
  return getCalendarEvents(start, addDays(start, 6))
}

export function getCalendarEventsForMonth(date: LocalDate): Promise<CalendarDay[]> {
  const [year, month] = date.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01` as LocalDate
  return getCalendarEvents(start, endOfMonth(date))
}
