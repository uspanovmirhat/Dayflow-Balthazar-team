import { readHabits, readHabitSettingsHistory, readLogsByRange } from '../repositories/habit.repository'
import { readTaskStatusHistory } from '../repositories/task.repository'
import { readTasks } from '../repositories/task.repository'
import { calculateHabitAnalytics, calculateTaskAnalytics, rankHabits } from '../engines/analytics.engine'
import { calculateStreakSummary, getHabitDay } from '../engines/streak.engine'
import { startOfIsoWeek } from '../utils/dates'
import { validateNonNegativeRange } from '../utils/validation'
import { currentUserContext, runBackendOperation } from './shared'
import type { DashboardSummary, HabitAnalytics, LocalDate, TaskAnalytics } from '../types'

export function getHabitAnalytics(startDate: LocalDate, endDate: LocalDate): Promise<HabitAnalytics[]> {
  return runBackendOperation(async () => {
    validateNonNegativeRange(startDate, endDate)
    const { uid } = await currentUserContext()
    const [habits, history, logs] = await Promise.all([
      readHabits(uid), readHabitSettingsHistory(uid, endDate), readLogsByRange(uid, startDate, endDate),
    ])
    return calculateHabitAnalytics(habits, history, logs, startDate, endDate)
  })
}

export function getWeeklyHabitAnalytics(date?: LocalDate): Promise<HabitAnalytics[]> {
  return runBackendOperation(async () => {
    const { today } = await currentUserContext()
    const selected = date ?? today
    return getHabitAnalytics(startOfIsoWeek(selected), selected)
  })
}

export function getMonthlyHabitAnalytics(date?: LocalDate): Promise<HabitAnalytics[]> {
  return runBackendOperation(async () => {
    const { today } = await currentUserContext()
    const selected = date ?? today
    const [year, month] = selected.split('-').map(Number)
    return getHabitAnalytics(`${year}-${String(month).padStart(2, '0')}-01` as LocalDate, selected)
  })
}

export function getTaskAnalytics(startDate: LocalDate, endDate: LocalDate, today?: LocalDate): Promise<TaskAnalytics> {
  return runBackendOperation(async () => {
    validateNonNegativeRange(startDate, endDate)
    const context = await currentUserContext()
    const [tasks, events] = await Promise.all([
      readTasks(context.uid), readTaskStatusHistory(context.uid, startDate, endDate),
    ])
    return calculateTaskAnalytics(tasks, events, today ?? context.today, startDate, endDate)
  })
}

export function getDashboardSummary(date?: LocalDate): Promise<DashboardSummary> {
  return runBackendOperation(async () => {
    const { uid, today: currentDate } = await currentUserContext()
    const targetDate = date ?? currentDate
    const [habits, history, tasks] = await Promise.all([
      readHabits(uid), readHabitSettingsHistory(uid, targetDate), readTasks(uid),
    ])
    const firstDate = history.map((item) => item.effectiveFrom).sort()[0]
    const logs = firstDate && firstDate <= targetDate ? await readLogsByRange(uid, firstDate, targetDate) : []
    const dayResults = habits.map((habit) => ({ habit, day: getHabitDay(habit, history, logs, targetDate) }))
    const scheduledDays = dayResults.filter(({ day }) => day.scheduled)
    const completedHabits = scheduledDays.filter(({ day }) => day.completed).length
    const currentStreaks = habits.flatMap((habit) => {
      const itemHistory = history.filter((item) => item.habitId === habit.id)
      const applicable = itemHistory
        .filter((item) => item.effectiveFrom <= targetDate)
        .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom) || left.version - right.version)
        .at(-1)
      if (!applicable || applicable.isArchived) return []
      return [{
        habitId: habit.id,
        name: habit.name,
        streak: calculateStreakSummary(habit, history, logs, targetDate).currentStreak,
      }]
    })
    const tasksDue = tasks.filter((task) => task.dueDate === targetDate)
    const completedTasksDue = tasksDue.filter((task) => task.status === 'completed').length
    return {
      date: targetDate,
      scheduledHabits: scheduledDays.length,
      completedHabits,
      habitProgress: scheduledDays.length === 0 ? 0 : Math.round((completedHabits / scheduledDays.length) * 10_000) / 100,
      tasksDue: tasksDue.length,
      completedTasksDue,
      currentStreaks,
    }
  })
}

export async function getHabitRankings(startDate: LocalDate, endDate: LocalDate) {
  return rankHabits(await getHabitAnalytics(startDate, endDate))
}
