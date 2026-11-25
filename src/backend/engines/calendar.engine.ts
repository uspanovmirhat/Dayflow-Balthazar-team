import { enumerateDates } from '../utils/dates'
import { getScheduledHabitDays } from './streak.engine'
import type { CalendarDay, CalendarHabitStatus, Habit, HabitDayResult, HabitLog, HabitSettings, LocalDate, Task } from '../types'

function habitStatus(day: HabitDayResult, today: LocalDate | undefined): CalendarHabitStatus {
  if (day.completed) return 'completed'
  if (!today || day.date === today) return 'pending'
  return day.date < today ? 'missed' : 'upcoming'
}

/**
 * Groups scheduled habit occurrences and due tasks into one bucket per local date.
 * Interval habits only produce events on due days (rest days are omitted). When `today` is given,
 * every habit event also carries a status: completed, missed (past), pending (today) or upcoming (future).
 */
export function buildCalendarDays(
  habits: Habit[],
  history: HabitSettings[],
  logs: HabitLog[],
  tasks: Task[],
  startDate: LocalDate,
  endDate: LocalDate,
  today?: LocalDate,
): CalendarDay[] {
  const dates = enumerateDates(startDate, endDate)
  const visibleHabits = habits.filter((habit) => !habit.isDeleting)
  const habitResults = new Map<string, Map<LocalDate, HabitDayResult>>()
  for (const habit of visibleHabits) {
    habitResults.set(habit.id, new Map(getScheduledHabitDays(habit, history, logs, startDate, endDate).map((day) => [day.date, day])))
  }
  const tasksByDate = new Map<LocalDate, Task[]>()
  for (const task of tasks) {
    if (!task.dueDate || task.isDeleting) continue
    tasksByDate.set(task.dueDate, [...(tasksByDate.get(task.dueDate) ?? []), task])
  }
  return dates.map((date) => {
    const habitEvents = visibleHabits.flatMap((habit) => {
      const day = habitResults.get(habit.id)?.get(date)
      return day?.scheduled ? [{
        kind: 'habit' as const,
        id: `${habit.id}:${date}`,
        habitId: habit.id,
        title: habit.name,
        date,
        color: habit.color,
        habitType: habit.type,
        status: habitStatus(day, today),
        completed: day.completed,
        value: day.value,
        target: day.target,
      }] : []
    })
    const taskEvents = (tasksByDate.get(date) ?? [])
      .map((task) => ({ kind: 'task' as const, id: task.id, title: task.title, date, status: task.status, priority: task.priority }))
    return { date, events: [...habitEvents, ...taskEvents] }
  })
}
