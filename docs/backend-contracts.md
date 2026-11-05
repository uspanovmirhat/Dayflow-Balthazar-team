# DAYFLOW Backend Contracts

All frontend imports should come from `src/backend/index.ts`:

```ts
import {
  addHabitLog,
  createHabit,
  getHabitStreak,
  getCalendarEventsForMonth,
  getDashboardSummary,
} from './backend'
```

Every Firestore-backed function requires an authenticated user. Services use the current Firebase Auth user and do not accept a caller-supplied UID. Errors are `BackendError` instances with a stable `code` and user-safe message. Codes: `configuration`, `validation`, `unauthenticated`, `permission-denied`, `not-found`, `already-exists`, `failed-precondition`, `unavailable`, `internal`.

## Authentication and profile

- `register({ email, password, displayName, timezone? }): Promise<User>` creates the Firebase Auth account and UID-keyed Firestore profile. Passwords are never written to Firestore; password length must be at least 8.
- `login(email, password): Promise<User>` signs in and repairs a missing profile for accounts from partial registration.
- `logout(): Promise<void>` signs out.
- `getCurrentUser(): User | null` returns the current Firebase Auth user.
- `subscribeToAuthState(callback, onError?): () => void` provides an Auth-state callback and unsubscribe function.
- `requestPasswordReset(email): Promise<void>` sends the Firebase reset email.
- `getUserProfile(): Promise<UserProfile>` reads the current profile and creates it if missing.
- `profileExists(): Promise<boolean>` checks the current user’s profile.
- `updateUserProfileFields({ displayName?, timezone? }): Promise<UserProfile>` updates the profile and synchronizes displayName to Firebase Auth.

Timezones must be in the supported IANA allowlist in `src/backend/utils/schedules.ts`, mirrored by Firestore Rules. When reading a legacy profile with an unsupported timezone, the repository repairs it to `UTC` before returning the profile so other operations remain available.

If Auth registration succeeds but profile creation fails, the Auth account remains signed in; `getUserProfile()` or a subsequent login repairs the missing profile.

## Habits and logs

- `createHabit({ name, description?, type, targetPerDay, schedule }): Promise<Habit>` creates the current document and initial settings-history version effective today in the profile timezone.
- `getHabit(habitId): Promise<Habit>` fetches one habit.
- `getHabits({ includeArchived? }?): Promise<Habit[]>` returns active habits by default.
- `updateHabit(habitId, input): Promise<Habit>` updates name/description/target/schedule, with the new configuration effective next local day. Type is immutable; create a new habit to switch between boolean and count.
- `archiveHabit(habitId)` / `restoreHabit(habitId): Promise<Habit>` change lifecycle state effective next local day. Logs/history remain available.
- `deleteHabit(habitId): Promise<void>` explicitly deletes associated logs and settings history before the parent document. Use archive when the history should remain.
- `addHabitLog(habitId, { value?, date? }?): Promise<HabitLog>` records today by default. Boolean logs use value `1` and are unique per date. Count logs require a positive value (maximum 1,000,000 per event); progress is their sum. The selected date must be scheduled and not in the future.
- `getHabitLogs(startDate, endDate, habitId?): Promise<HabitLog[]>` returns logs within an inclusive local-date range.
- `getDailyProgress(habitId, date?): Promise<{ value, target, completed }>` sums count logs and applies the effective historical target.
- `removeHabitLog(habitId, logId): Promise<void>` removes an owner’s log. Subsequent totals are recalculated from logs.
- `getHabitStreak(habitId, asOfDate?): Promise<StreakSummary>` calculates current/longest streak, total completed days, scheduled days, and lifetime completion rate through a local date.

Schedules are discriminated unions:

```ts
{ type: 'daily' }
{ type: 'weekdays', days: [1, 3, 5] } // ISO: Monday=1 ... Sunday=7
{ type: 'interval', everyNDays: 3, startDate: '2026-11-05' }
```

## Tasks

- `createTask({ title, description?, status?, priority?, dueDate? }): Promise<Task>` defaults status to `todo`, priority to `medium`, and due date to `null`.
- `getTask(taskId): Promise<Task>` and `getTasks(): Promise<Task[]>` read tasks.
- `getTasksByStatus(status): Promise<Task[]>` filters by `todo`, `in_progress`, or `completed`.
- `getTasksByDate(date)` / `getTasksByDateRange(start, end): Promise<Task[]>` filter by inclusive local due date.
- `updateTask(taskId, partialInput): Promise<Task>` updates supplied fields.
- `changeTaskStatus(taskId, status)`, `changeTaskPriority(taskId, priority)`, `completeTask(taskId)` are focused update helpers.
- `deleteTask(taskId): Promise<void>` removes status history and the task.

Status changes set/clear `completedAt` and append an immutable versioned history record in the same transaction. Reopening a task clears its current `completedAt`; the prior completion event remains available for analytics.

## Calendar and analytics

- `getCalendarEvents(startDate, endDate): Promise<CalendarDay[]>` returns one date bucket per day with a discriminated `habit` or `task` event.
- `getCalendarEventsForDay(date)`, `getCalendarEventsForWeek(date)`, `getCalendarEventsForMonth(date)` are convenience range methods. Weeks start Monday.
- `getHabitAnalytics(startDate, endDate): Promise<HabitAnalytics[]>` returns scheduled-day counts, completed-day counts, rates, and daily progress per habit. Days before creation and during archived intervals are excluded.
- `getWeeklyHabitAnalytics(date?)` returns Monday through the selected local date.
- `getMonthlyHabitAnalytics(date?)` returns month start through the selected local date.
- `getHabitRankings(startDate, endDate)` returns best and weakest habits by completion rate (up to three each).
- `getTaskAnalytics(startDate, endDate, today?)` returns current task totals/status/overdue counts and completion events in the selected period.
- `getDashboardSummary(date?)` returns scheduled/completed habits, habit completion percentage, tasks due/completed that date, and current streak per active habit.

Pure functions such as `calculateStreakSummary`, `calculateHabitAnalytics`, `calculateTaskAnalytics`, `buildCalendarDays`, `isScheduledDate`, and date helpers are also exported for reuse and unit testing. Call `calculateStreakSummary(habit, history, logs, asOfDate, currentDate)` with the user's profile-local current date when the as-of date may differ from today; backend services do this automatically.

## Validation and frontend handling

Catch backend errors by stable code rather than parsing Firebase messages:

```ts
try {
  await addHabitLog(habitId)
} catch (error) {
  if (error instanceof BackendError && error.code === 'already-exists') {
    // Show that today was already completed.
  }
}
```

The frontend should subscribe to Auth state once near app startup and unsubscribe when its owner unmounts. It should use the public services rather than writing Firestore documents directly so schedule, date, history, and task transition rules are applied consistently.
