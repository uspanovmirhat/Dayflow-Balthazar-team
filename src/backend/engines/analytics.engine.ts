import { getScheduledHabitDays } from './streak.engine'
import type {
  Habit, HabitAnalytics, HabitLog, HabitSettings, LocalDate, Task,
  TaskAnalytics, TaskStatus, TaskStatusEvent,
} from '../types'

export function calculateHabitAnalytics(
  habits: Habit[],
  history: HabitSettings[],
  logs: HabitLog[],
  startDate: LocalDate,
  endDate: LocalDate,
): HabitAnalytics[] {
  return habits.map((habit) => {
    const progress = getScheduledHabitDays(habit, history, logs, startDate, endDate)
      .filter((day) => day.scheduled)
      .map(({ date, completed, value, target }) => ({ date, completed, value, target }))
    const completedDays = progress.filter((day) => day.completed).length
    return {
      habitId: habit.id,
      name: habit.name,
      scheduledDays: progress.length,
      completedDays,
      completionRate: progress.length === 0 ? 0 : Math.round((completedDays / progress.length) * 10_000) / 100,
      progress,
    }
  })
}

export function calculateTaskAnalytics(
  tasks: Task[],
  statusEvents: TaskStatusEvent[],
  today: LocalDate,
  startDate: LocalDate,
  endDate: LocalDate,
): TaskAnalytics {
  const byStatus: Record<TaskStatus, number> = { todo: 0, in_progress: 0, completed: 0 }
  for (const task of tasks) byStatus[task.status] += 1
  const completedTasks = byStatus.completed
  const completedOverTime = new Map<LocalDate, number>()
  for (const event of statusEvents) {
    if (event.status !== 'completed' || event.date < startDate || event.date > endDate) continue
    completedOverTime.set(event.date, (completedOverTime.get(event.date) ?? 0) + 1)
  }
  const totalTasks = tasks.length
  return {
    totalTasks,
    completedTasks,
    pendingTasks: totalTasks - completedTasks,
    overdueTasks: tasks.filter((task) => task.status !== 'completed' && task.dueDate !== null && task.dueDate < today).length,
    completionRate: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 10_000) / 100,
    byStatus,
    completedOverTime: [...completedOverTime.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, count]) => ({ date, count })),
  }
}

export function rankHabits(analytics: HabitAnalytics[]): { best: HabitAnalytics[]; weakest: HabitAnalytics[] } {
  const eligible = analytics.filter((habit) => habit.scheduledDays > 0)
  const sorted = [...eligible].sort((left, right) => right.completionRate - left.completionRate || left.name.localeCompare(right.name))
  return { best: sorted.slice(0, 3), weakest: sorted.slice(-3).reverse() }
}
