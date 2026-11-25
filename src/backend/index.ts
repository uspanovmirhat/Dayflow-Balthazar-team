export {
  completeGoogleRedirect,
  getCurrentUser,
  isGoogleAccount,
  login,
  logout,
  register,
  reloadEmailVerificationStatus,
  requestPasswordReset,
  resendEmailVerification,
  signInWithGoogle,
  subscribeToAuthState,
} from './services/auth.service'
export type { RegisterInput, RegisterResult } from './services/auth.service'
export { assertValidPassword, checkPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENT_LABELS } from './utils/passwords'
export type { PasswordCheck, PasswordRequirement } from './utils/passwords'

export { getUserProfile, profileExists, updateUserProfileFields } from './services/user.service'
export { archiveHabit, createHabit, deleteHabit, getHabit, getHabitStreak, getHabits, restoreHabit, updateHabit } from './services/habit.service'
export type { HabitInput } from './services/habit.service'
export { addHabitLog, getDailyProgress, getHabitLogs, removeHabitLog } from './services/habit-log.service'
export { changeTaskPriority, changeTaskStatus, completeTask, createTask, deleteTask, getTask, getTasks, getTasksByDate, getTasksByDateRange, getTasksByStatus, updateTask } from './services/task.service'
export { completeReminder, createReminder, deleteReminder, getReminders, snoozeReminder, updateReminder } from './services/reminder.service'
export type { TaskInput } from './services/task.service'
export { getCalendarEvents, getCalendarEventsForDay, getCalendarEventsForMonth, getCalendarEventsForWeek } from './services/calendar.service'
export { getDashboardSummary, getHabitAnalytics, getHabitRankings, getMonthlyHabitAnalytics, getTaskAnalytics, getWeeklyHabitAnalytics } from './services/analytics.service'

export { calculateStreakSummary, getHabitDay, getHabitDayResult, getScheduledHabitDays, settingsForDate } from './engines/streak.engine'
export { calculateHabitAnalytics, calculateTaskAnalytics, rankHabits } from './engines/analytics.engine'
export { buildCalendarDays } from './engines/calendar.engine'
export { addDays, assertLocalDate, assertTimeZone, daysBetween, endOfMonth, enumerateDates, isLocalDate, localDateInTimeZone, startOfIsoWeek } from './utils/dates'
export { isScheduledDate, nextScheduledDate, validateSchedule } from './utils/schedules'
export { dueReminder, localTimeInTimeZone, nextReminderOccurrence, reminderOccurrencesBetween, reminderOccursOn, validateReminderLink, validateReminderSchedule } from './utils/reminders'
export type { DueReminder } from './utils/reminders'
export { disablePushNotifications, enableNotifications, forgetDeviceBeforeLogout, getNotificationDevices, getNotificationStatus, refreshPushRegistration, registerAppServiceWorker, showLocalNotification, wasNotificationShown } from './services/notification.service'
export type { NotificationPermissionState, NotificationStatus } from './services/notification.service'
export { isHabitColor, randomHabitColor, stableHabitColor, validateHabitColor } from './utils/colors'
export { BackendError, toBackendError } from './utils/errors'
export type * from './types'
