export {
  getCurrentUser,
  login,
  logout,
  register,
  requestPasswordReset,
  subscribeToAuthState,
} from './services/auth.service'
export type { RegisterInput } from './services/auth.service'

export { getUserProfile, profileExists, updateUserProfileFields } from './services/user.service'
export { archiveHabit, createHabit, deleteHabit, getHabit, getHabitStreak, getHabits, restoreHabit, updateHabit } from './services/habit.service'
export type { HabitInput } from './services/habit.service'
export { addHabitLog, getDailyProgress, getHabitLogs, removeHabitLog } from './services/habit-log.service'
export { changeTaskPriority, changeTaskStatus, completeTask, createTask, deleteTask, getTask, getTasks, getTasksByDate, getTasksByDateRange, getTasksByStatus, updateTask } from './services/task.service'
export type { TaskInput } from './services/task.service'
export { getCalendarEvents, getCalendarEventsForDay, getCalendarEventsForMonth, getCalendarEventsForWeek } from './services/calendar.service'
export { getDashboardSummary, getHabitAnalytics, getHabitRankings, getMonthlyHabitAnalytics, getTaskAnalytics, getWeeklyHabitAnalytics } from './services/analytics.service'

export { calculateStreakSummary, getHabitDay, getHabitDayResult, getScheduledHabitDays, settingsForDate } from './engines/streak.engine'
export { calculateHabitAnalytics, calculateTaskAnalytics, rankHabits } from './engines/analytics.engine'
export { buildCalendarDays } from './engines/calendar.engine'
export { addDays, assertLocalDate, assertTimeZone, daysBetween, endOfMonth, enumerateDates, isLocalDate, localDateInTimeZone, startOfIsoWeek } from './utils/dates'
export { isScheduledDate, validateSchedule } from './utils/schedules'
export { BackendError, toBackendError } from './utils/errors'
export type * from './types'
