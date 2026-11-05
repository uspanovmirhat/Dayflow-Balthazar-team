import { readHabits, readHabitSettingsHistory, readLogsByRange } from '../repositories/habit.repository'
import { readTasksByDateRange } from '../repositories/task.repository'
import { buildCalendarDays } from '../engines/calendar.engine'
import { addDays, endOfMonth, startOfIsoWeek } from '../utils/dates'
import { validateNonNegativeRange } from '../utils/validation'
import { currentUserContext, runBackendOperation } from './shared'
import type { CalendarDay, LocalDate } from '../types'

export function getCalendarEvents(startDate: LocalDate, endDate: LocalDate): Promise<CalendarDay[]> {
  return runBackendOperation(async () => {
    validateNonNegativeRange(startDate, endDate)
    const { uid } = await currentUserContext()
    const [habits, history, logs, tasks] = await Promise.all([
      readHabits(uid),
      readHabitSettingsHistory(uid, endDate),
      readLogsByRange(uid, startDate, endDate),
      readTasksByDateRange(uid, startDate, endDate),
    ])
    return buildCalendarDays(habits, history, logs, tasks, startDate, endDate)
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
