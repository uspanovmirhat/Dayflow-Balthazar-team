import type { Timestamp } from 'firebase/firestore'

export type LocalDate = `${number}-${number}-${number}`

export type HabitType = 'boolean' | 'count'
export type HabitSchedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] }
  | { type: 'interval'; everyNDays: number; startDate: LocalDate }

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  timezone: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Habit {
  id: string
  userId: string
  name: string
  description: string
  type: HabitType
  targetPerDay: number
  schedule: HabitSchedule
  isArchived: boolean
  archivedFrom: LocalDate | null
  isDeleting?: boolean
  settingsVersion: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface HabitSettings {
  id: string
  userId: string
  habitId: string
  type: HabitType
  targetPerDay: number
  schedule: HabitSchedule
  isArchived: boolean
  effectiveFrom: LocalDate
  version: number
  createdAt: Timestamp
}

export interface HabitLog {
  id: string
  userId: string
  habitId: string
  value: number
  date: LocalDate
  settingsVersion?: number
  completedAt: Timestamp
}

export type TaskStatus = 'todo' | 'in_progress' | 'completed'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  userId: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: LocalDate | null
  completedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
  statusVersion: number
}

export interface TaskStatusEvent {
  id: string
  userId: string
  taskId: string
  status: TaskStatus
  date: LocalDate
  version: number
  changedAt: Timestamp
}

export interface HabitDayResult {
  date: LocalDate
  scheduled: boolean
  completed: boolean
  value: number
  target: number
}

export interface StreakSummary {
  currentStreak: number
  longestStreak: number
  totalCompletedDays: number
  completionRate: number
  scheduledDays: number
}

export interface HabitAnalytics {
  habitId: string
  name: string
  scheduledDays: number
  completedDays: number
  completionRate: number
  progress: Array<{ date: LocalDate; completed: boolean; value: number; target: number }>
}

export interface TaskAnalytics {
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  overdueTasks: number
  completionRate: number
  byStatus: Record<TaskStatus, number>
  completedOverTime: Array<{ date: LocalDate; count: number }>
}

export type CalendarEvent =
  | { kind: 'habit'; id: string; habitId: string; title: string; date: LocalDate; completed: boolean; value: number; target: number }
  | { kind: 'task'; id: string; title: string; date: LocalDate; status: TaskStatus; priority: TaskPriority }

export interface CalendarDay {
  date: LocalDate
  events: CalendarEvent[]
}

export interface DashboardSummary {
  date: LocalDate
  scheduledHabits: number
  completedHabits: number
  habitProgress: number
  tasksDue: number
  completedTasksDue: number
  currentStreaks: Array<{ habitId: string; name: string; streak: number }>
}
