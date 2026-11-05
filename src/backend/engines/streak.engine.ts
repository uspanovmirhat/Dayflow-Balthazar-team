import { enumerateDates, localDateInTimeZone } from '../utils/dates'
import { BackendError } from '../utils/errors'
import { isScheduledDate } from '../utils/schedules'
import { assertLocalDate } from '../utils/dates'
import type { Habit, HabitDayResult, HabitLog, HabitSettings, LocalDate, StreakSummary } from '../types'

export function settingsForDate(habit: Habit, history: HabitSettings[], date: LocalDate): HabitSettings {
  const matching = history
    .filter((item) => item.habitId === habit.id && item.effectiveFrom <= date)
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom) || left.version - right.version)
  const latest = matching.at(-1)
  if (latest) return latest
  return {
    id: 'fallback', userId: habit.userId, habitId: habit.id, type: habit.type,
    targetPerDay: habit.targetPerDay, schedule: habit.schedule,
    isArchived: habit.isArchived, effectiveFrom: date, version: habit.settingsVersion,
    createdAt: habit.createdAt,
  }
}

export function getHabitDayResult(habit: Habit, settings: HabitSettings, logs: HabitLog[], date: LocalDate): HabitDayResult {
  if (settings.isArchived || date < settings.effectiveFrom || !isScheduledDate(settings.schedule, date)) {
    return { date, scheduled: false, completed: false, value: 0, target: settings.targetPerDay }
  }
  const matchingLogs = logs.filter((log) => log.habitId === habit.id && log.date === date)
  return resultFromLogs(settings, matchingLogs, date)
}

function resultFromLogs(settings: HabitSettings, matchingLogs: HabitLog[], date: LocalDate): HabitDayResult {
  if (settings.isArchived || date < settings.effectiveFrom || !isScheduledDate(settings.schedule, date)) {
    return { date, scheduled: false, completed: false, value: 0, target: settings.targetPerDay }
  }
  const value = matchingLogs.reduce((total, log) => total + log.value, 0)
  const completed = settings.type === 'boolean'
    ? matchingLogs.some((log) => log.value === 1)
    : value >= settings.targetPerDay
  return { date, scheduled: true, completed, value, target: settings.targetPerDay }
}

export function getHabitDay(habit: Habit, history: HabitSettings[], logs: HabitLog[], date: LocalDate): HabitDayResult {
  const itemHistory = history.filter((item) => item.habitId === habit.id)
  if (itemHistory.length > 0 && !itemHistory.some((item) => item.effectiveFrom <= date)) {
    return { date, scheduled: false, completed: false, value: 0, target: habit.targetPerDay }
  }
  return getHabitDayResult(habit, settingsForDate(habit, history, date), logs, date)
}

export function getScheduledHabitDays(habit: Habit, history: HabitSettings[], logs: HabitLog[], startDate: LocalDate, endDate: LocalDate): HabitDayResult[] {
  const dates = enumerateDates(startDate, endDate)
  const habitHistory = history
    .filter((item) => item.habitId === habit.id)
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom) || left.version - right.version)
  const logsByDate = new Map<LocalDate, HabitLog[]>()
  for (const log of logs) {
    if (log.habitId !== habit.id) continue
    const current = logsByDate.get(log.date) ?? []
    current.push(log)
    logsByDate.set(log.date, current)
  }
  let settingsIndex = -1
  return dates.map((date) => {
    while (settingsIndex + 1 < habitHistory.length && habitHistory[settingsIndex + 1].effectiveFrom <= date) settingsIndex += 1
    if (habitHistory.length > 0 && settingsIndex < 0) {
      return { date, scheduled: false, completed: false, value: 0, target: habit.targetPerDay }
    }
    const settings = settingsIndex >= 0 ? habitHistory[settingsIndex] : settingsForDate(habit, [], date)
    return resultFromLogs(settings, logsByDate.get(date) ?? [], date)
  })
}

export function calculateStreakSummary(
  habit: Habit,
  history: HabitSettings[],
  logs: HabitLog[],
  asOfDate: LocalDate,
  currentDate: LocalDate = localDateInTimeZone(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
): StreakSummary {
  assertLocalDate(asOfDate, 'asOfDate')
  assertLocalDate(currentDate, 'currentDate')
  if (asOfDate > currentDate) throw new BackendError('validation', 'asOfDate cannot be in the future.')
  const firstDate = history
    .filter((item) => item.habitId === habit.id)
    .map((item) => item.effectiveFrom)
    .sort()[0]
  if (!firstDate) return { currentStreak: 0, longestStreak: 0, totalCompletedDays: 0, completionRate: 0, scheduledDays: 0 }
  if (firstDate > asOfDate) throw new BackendError('validation', 'asOfDate cannot precede the habit start date.')

  const habitLogs = logs.filter((log) => log.habitId === habit.id)
  const dueDays = getScheduledHabitDays(habit, history, habitLogs, firstDate, asOfDate).filter((day) => day.scheduled)
  const totalCompletedDays = dueDays.filter((day) => day.completed).length
  let longestStreak = 0
  let activeRun = 0
  for (const day of dueDays) {
    activeRun = day.completed ? activeRun + 1 : 0
    longestStreak = Math.max(longestStreak, activeRun)
  }

  let lastDueIndex = dueDays.length - 1
  if (lastDueIndex >= 0 && dueDays[lastDueIndex].date === currentDate && !dueDays[lastDueIndex].completed) lastDueIndex -= 1
  let currentStreak = 0
  for (let index = lastDueIndex; index >= 0 && dueDays[index].completed; index -= 1) currentStreak += 1

  return {
    currentStreak,
    longestStreak,
    totalCompletedDays,
    completionRate: dueDays.length === 0 ? 0 : Math.round((totalCompletedDays / dueDays.length) * 10_000) / 100,
    scheduledDays: dueDays.length,
  }
}
