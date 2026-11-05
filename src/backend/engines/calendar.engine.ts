import { enumerateDates } from '../utils/dates'
import { getScheduledHabitDays } from './streak.engine'
import type { CalendarDay, Habit, HabitLog, HabitSettings, LocalDate, Task } from '../types'

export function buildCalendarDays(
  habits: Habit[],
  history: HabitSettings[],
  logs: HabitLog[],
  tasks: Task[],
  startDate: LocalDate,
  endDate: LocalDate,
): CalendarDay[] {
  const dates = enumerateDates(startDate, endDate)
  const habitResults = new Map<string, Map<LocalDate, ReturnType<typeof getScheduledHabitDays>[number]>>()
  for (const habit of habits) {
    habitResults.set(habit.id, new Map(getScheduledHabitDays(habit, history, logs, startDate, endDate).map((day) => [day.date, day])))
  }
  return dates.map((date) => {
    const habitEvents = habits.flatMap((habit) => {
      const day = habitResults.get(habit.id)?.get(date)
      return day?.scheduled ? [{
        kind: 'habit' as const,
        id: `${habit.id}:${date}`,
        habitId: habit.id,
        title: habit.name,
        date,
        completed: day.completed,
        value: day.value,
        target: day.target,
      }] : []
    })
    const taskEvents = tasks
      .filter((task) => task.dueDate === date)
      .map((task) => ({ kind: 'task' as const, id: task.id, title: task.title, date, status: task.status, priority: task.priority }))
    return { date, events: [...habitEvents, ...taskEvents] }
  })
}
