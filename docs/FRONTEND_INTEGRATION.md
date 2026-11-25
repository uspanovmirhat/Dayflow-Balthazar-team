# DAYFLOW Frontend Integration Guide

This guide describes the backend API that currently exists in `src/backend/index.ts`. Import application services and types from that entry point; do not write application documents directly with the Firestore SDK.

## Architecture

DAYFLOW is a React + TypeScript + Vite client using the Firebase Web SDK. There is no separate backend server or privileged Admin SDK. Firebase Authentication supplies the current user, Firestore Security Rules enforce ownership and validate writes, and backend services in `src/backend` implement application workflows.

```text
React components/hooks
        ↓ public functions and types
src/backend/index.ts
        ↓ services
repositories ←→ Firebase Client SDK
        ↓                 ↓
pure engines       Firestore Rules
```

The Firebase configuration module initializes lazily when a backend function needs Firebase. The React app imports everything from the backend entry point `src/backend/index.ts`; this guide describes that integration surface for Aruna's frontend work.

## Backend module map

- `src/backend/index.ts`: public exports for services, pure engines, date/schedule utilities, errors, and domain types.
- `src/backend/services/`: auth/profile, habit/log, task, calendar, and analytics orchestration.
- `src/backend/repositories/`: Firestore reads, transactions, batches, and document paths.
- `src/backend/engines/`: pure streak, analytics, and calendar calculations.
- `src/backend/schemas/`: runtime validation of Firestore documents before returning typed values.
- `src/backend/utils/`: input validation, date/timezone and schedule logic, and error normalization.
- Root `firestore.rules`: owner isolation and write validation.
- Root `firestore.indexes.json`: collection-group indexes used by range queries.

Firestore paths are `users/{uid}`, `users/{uid}/habits/{habitId}`, `users/{uid}/habits/{habitId}/settingsHistory/{version}`, `users/{uid}/habits/{habitId}/logs/{logId}`, `users/{uid}/tasks/{taskId}`, and `users/{uid}/tasks/{taskId}/statusHistory/{version}`. Calculated analytics are derived from logs/history and are not stored separately.

## Firebase setup

The backend reads the standard Vite variables in `.env.local` through its own `src/backend/config/firebase.ts`. Copy `.env.example` to `.env.local`, fill in the Firebase Web App settings locally, and set `VITE_USE_FIREBASE_EMULATORS=false` for cloud use. The backend defaults to `getFirestore(app)`, i.e. the `(default)` Firestore database. Emulator hosts are only used when the flag is the literal string `true`.

Do not print or commit `.env.local`, `.env.test.local`, credentials, or tokens. Firebase web configuration is client configuration, not a server secret; access control must remain in Security Rules. Never add Firebase Admin SDK to the frontend.

For app code, import the backend API rather than initializing a second Firebase app:

```ts
import {
  getCurrentUser,
  login,
  logout,
  register,
  subscribeToAuthState,
} from '../backend'
```

The public backend entry point owns service initialization. Subscribe once near the application root and unsubscribe during cleanup:

```ts
const unsubscribe = subscribeToAuthState((user) => {
  setUser(user)
}, (error) => setAuthError(error))
return unsubscribe
```

`subscribeToAuthState` callback receives `User | null`; it does not create a profile. A successful call to `register` or `login` initializes a missing profile as part of the backend flow.

## Authentication and profile

Available functions are `register(input)`, `login(email, password)`, `logout()`, `getCurrentUser()`, `subscribeToAuthState(callback, onError?)`, `requestPasswordReset(email)`, `resendEmailVerification()`, and `reloadEmailVerificationStatus()`. Passwords are never written to Firestore.

`RegisterInput` requires `email`, `password`, `confirmPassword`, and `displayName`, with optional `timezone`. The backend rejects the request before contacting Firebase when `confirmPassword !== password`, when the display name is shorter than 2 characters, or when the password fails the policy. `register` resolves to `RegisterResult = { user, verificationEmailSent }` (not a bare `User`): after the account is created a verification email is sent; if that email fails, the account still exists and `verificationEmailSent` is `false`.

Password policy (`src/backend/utils/passwords.ts`): 8–128 characters, at least one letter, at least one digit, no leading/trailing spaces. Use `checkPassword(password)` for live form feedback; it returns `{ valid, missing: PasswordRequirement[], score: 0–4 }`, and `PASSWORD_REQUIREMENT_LABELS` maps each requirement to Russian UI text. Do not duplicate these rules in the UI.

Firebase Auth errors are normalized to `BackendError` with Russian, user-facing messages (for example `auth/email-already-in-use` → «Аккаунт с таким email уже существует…», `auth/invalid-credential` → «Неверный email или пароль.»), so `error.message` can be shown directly on the sign-in screen.

`user.emailVerified` from Firebase Auth does not update by itself after the user clicks the link in another tab; call `reloadEmailVerificationStatus()` (resolves to the fresh boolean) when the user says they have confirmed. `resendEmailVerification()` fails with `failed-precondition` when the email is already verified.

```ts
import { checkPassword, register } from '../backend'

const check = checkPassword(password) // { valid, missing, score }
const { user, verificationEmailSent } = await register({ displayName, email, password, confirmPassword })
```

```ts
import { getUserProfile, login, logout } from '../backend'

const user = await login(email, password) // also creates a missing UID-keyed profile
const profile = await getUserProfile()
await logout()
```

`UserProfile` contains `uid`, `email`, `displayName`, `timezone`, `createdAt`, and `updatedAt`. `getUserProfile()` returns the current profile and creates it if absent. `profileExists()` only checks presence. `updateUserProfileFields({ displayName?, timezone? })` updates the profile; display name is also synchronized to Firebase Auth. Supported profile timezones are restricted to the allowlist in `src/backend/utils/schedules.ts`, mirrored in Rules. A legacy unsupported timezone is repaired to `UTC` on profile read.

## Habits and Habit Logs

Import `createHabit`, `getHabit`, `getHabits`, `updateHabit`, `archiveHabit`, `restoreHabit`, `deleteHabit`, and `getHabitStreak`; `HabitInput` is exported.

```ts
import { createHabit, getHabits, updateHabit } from '../backend'
import type { HabitInput } from '../backend'

const input: HabitInput = {
  name: 'Read',
  description: '',
  type: 'boolean',
  targetPerDay: 1,
  schedule: { type: 'daily' },
}
const habit = await createHabit(input)
const habits = await getHabits()
await updateHabit(habit.id, { ...input, name: 'Read each evening' })
```

`HabitInput` requires `name`, `type`, `targetPerDay`, and `schedule`; `description` is optional. Types are `'boolean' | 'count'`. Boolean target must be `1`; count target and log values are positive and capped at 1,000,000. Schedule variants are `{ type: 'daily' }`, `{ type: 'weekdays', days: number[] }` (ISO Monday=1 through Sunday=7), and `{ type: 'interval', everyNDays: number, startDate: LocalDate }`.

Habit settings history is effective-dated. Creation is effective today in the profile timezone; updates and archive/restore take effect the next local day.

Interval schedules count every `everyNDays` days from `startDate` (the cycle anchor). The backend honours the requested `startDate` when it lies in this window, otherwise it falls back:

| Call | Accepted `startDate` | Fallback |
| --- | --- | --- |
| `createHabit` | today … today + 365 | today |
| `updateHabit` | tomorrow … today + 365 | the existing anchor when the habit already had an interval, else tomorrow |

To keep the current rhythm when editing an interval habit, send `nextScheduledDate(habit.schedule, tomorrow)` as `startDate` (this is what the habit form does). `nextScheduledDate(schedule, from)` returns the first due date on or after `from` for any schedule type and is the way to show «следующий раз …» on rest days. Habit type is immutable. `deleteHabit` permanently removes the habit, its logs, and settings history; choose archive when history must be preserved.

```ts
import { addHabitLog, getDailyProgress, getHabitLogs } from '../backend'

const log = await addHabitLog(habit.id) // today by default
const progress = await getDailyProgress(habit.id) // { value, target, completed, scheduled }
const history = await getHabitLogs('2026-11-01', '2026-11-30', habit.id)
```

`getDailyProgress` also returns `scheduled`: `false` means the date is a rest day for that habit (for example between interval occurrences); disable the completion control instead of calling `addHabitLog`, which would fail with «В этот день привычка не запланирована…».

Dates are local calendar strings (`LocalDate`, `YYYY-MM-DD`), not JavaScript timestamps. Future dates are rejected for logs/progress. A selected date must be scheduled and not archived. Boolean logs are unique per habit/date and use that date as the document ID; count logs are separate events whose values sum toward the effective target. `removeHabitLog(habitId, logId)` deletes one owner's log.

## Tasks

Available task operations are `createTask`, `getTask`, `getTasks`, `getTasksByStatus`, `getTasksByDate`, `getTasksByDateRange`, `updateTask`, `changeTaskStatus`, `changeTaskPriority`, `completeTask`, and `deleteTask`. `TaskInput` is exported.

```ts
import { changeTaskStatus, createTask, getTasksByDate } from '../backend'

const task = await createTask({ title: 'Plan week', dueDate: '2026-11-09' })
const due = await getTasksByDate('2026-11-09')
await changeTaskStatus(task.id, 'in_progress')
```

Statuses are `'todo' | 'in_progress' | 'completed'`; priorities are `'low' | 'medium' | 'high'`. Create defaults are `todo`, `medium`, and no due date. Status changes update task state and append immutable versioned status history atomically. Reopening clears current `completedAt` but preserves history. Deletion removes history and task; it is permanent.

## Calendar, streaks, and analytics

```ts
import {
  getCalendarEventsForMonth,
  getDashboardSummary,
  getHabitRankings,
  getWeeklyHabitAnalytics,
  getHabitStreak,
} from '../backend'

const month = await getCalendarEventsForMonth('2026-11-06')
const dashboard = await getDashboardSummary() // today's dashboard in profile timezone
const week = await getWeeklyHabitAnalytics()
const streak = await getHabitStreak(habitId)
const rankings = await getHabitRankings('2026-11-01', '2026-11-06')
```

Other exports include `getCalendarEvents(start, end)`, `getCalendarEventsForDay(date)`, `getCalendarEventsForWeek(date)`, `getCalendarEventsForMonth(date)`, `getHabitAnalytics(start, end)`, `getMonthlyHabitAnalytics(date?)`, `getTaskAnalytics(start, end, today?)`, and `getDashboardSummary(date?)`.

Calendar returns `CalendarDay[]`, including empty day buckets, with discriminated `habit`, `task`, and `reminder` events. A single request may cover at most 400 days. Habit events include `habitType` (`'boolean' | 'count'`) and `status: CalendarHabitStatus`, computed against today in the profile timezone: `completed`, `missed` (past due day without completion), `pending` (due today, not done yet), or `upcoming` (future due day). Interval habits appear only on due days; habits that are being deleted are omitted. Past and today's habit events can be marked from the calendar with `addHabitLog(habitId, { date })` and undone with `getHabitLogs(date, date, habitId)` + `removeHabitLog`. The `reminder` event kind is declared in the types, but `getCalendarEvents` does not emit reminders yet. Weeks begin Monday. Streaks count consecutive scheduled days; unscheduled dates are skipped, missed scheduled historical days break a run, and an incomplete current day remains pending. Count habits complete when the sum for the date reaches that date's historical target. Analytics derive from logs and history; no aggregate collection is maintained. Analytics and dashboard reject unsupported future dates, though calendar can represent a requested date range without applying that future-date restriction.

## Loading, errors, and empty states

Backend calls are promises. Model loading state at the component/hook level; render an empty state when a successful list/range call returns an empty array. Do not treat a rejected call as an empty result. Clear or refresh user-scoped data on sign-out/account change so one account's cached UI is not shown under another account.

Errors are `BackendError` with stable `code` values: `configuration`, `validation`, `unauthenticated`, `permission-denied`, `not-found`, `already-exists`, `failed-precondition`, `unavailable`, and `internal`. Branch on `code`, not Firebase's raw message:

```ts
import { BackendError, addHabitLog } from '../backend'

try {
  await addHabitLog(habitId)
} catch (error) {
  if (error instanceof BackendError && error.code === 'already-exists') {
    setMessage('Already completed for this date')
  } else {
    setError(error instanceof BackendError ? error.message : 'Unexpected error')
  }
}
```

Useful distinctions: `unauthenticated` should prompt sign-in; `validation` should be surfaced near the relevant input; `permission-denied` means the request is not allowed; `not-found` can mean the item was removed; `already-exists` commonly means a boolean completion already exists; `failed-precondition` means the current state does not allow the operation. Avoid optimistic updates that cannot be rolled back after transaction/rules errors.

## TypeScript guidance

Use exported types from `../backend`: `UserProfile`, `Habit`, `HabitInput`, `HabitSchedule`, `HabitLog`, `Task`, `TaskInput`, `TaskStatus`, `TaskPriority`, `LocalDate`, `CalendarDay`, `CalendarEvent`, `HabitAnalytics`, `TaskAnalytics`, `DashboardSummary`, and `StreakSummary`. Use the discriminants `schedule.type` and `event.kind` for narrowing. Keep date values as `LocalDate`; do not convert them to UTC timestamps for display or persistence. Use Firebase `User` only for Auth state; use `UserProfile` for DAYFLOW-specific preferences.

## Firestore and security rules

All owner-scoped services use the authenticated Firebase user internally; callers must not pass a UID. Rules restrict data to `users/{request.auth.uid}` and validate fields, schedules, effective dates, log eligibility, and task transitions. Continue using the backend services so history, transaction, and validation contracts remain intact. Do not create parallel frontend Firestore writes or assume that hidden UI controls are a security boundary. Composite collection-group indexes are defined in `firestore.indexes.json` and must exist in the deployed project for their queries.

## UI handoff: mobile reference and responsive desktop

The existing mobile UI mockup is the original visual reference. Preserve its visual concept, hierarchy, components, color language, and existing design system. Treat mobile as the reference implementation, then adapt thoughtfully for tablet and desktop. Do not simply stretch the phone layout across a wide viewport: design a desktop layout with suitable content width, multi-column composition where it helps, and navigation appropriate to larger screens while retaining the established DAYFLOW visual language.

## Commands

```sh
npm install
npm run dev
npm run lint
npm run build
npm run test
npm run test:rules
```

`npm run test` runs Vitest tests under `src/backend`. `npm run test:rules` starts the Firestore Emulator and runs `tests/rules.test.ts`; a local JDK is required by Firebase Emulator tooling. Do not point Rules tests at production.

## Verified backend status

The latest handoff status recorded for this backend is:

- Build: passed.
- Lint: passed.
- Unit tests: 46 passed.
- Firestore Rules tests: 15 passed.
- Authorized real-project integration test: all stages passed using Firebase Client SDK and two test accounts.
- Cross-user habit read: denied with `permission-denied` as expected.
- Cleanup: successful; test habit and related log/history documents were removed, with no leftovers.
- Firestore SDK emitted `BloomFilterError: Invalid hash count: 0` warnings during the cloud run. They did not affect test outcomes; investigate if they recur or begin correlating with request failures.

These are recorded results from an earlier run. On 2026-11-25 (sign-up confirmation + interval calendar change) build, lint, 92 unit tests, and 16 Firestore Rules tests passed locally, and sign-up and calendar marking were checked in a browser against the Auth/Firestore emulators.

## Known limits

- There is no trusted server or Admin SDK. Client Rules are the security boundary; highly authoritative time/business policies would require trusted server logic.
- Local dates follow the profile timezone. Existing log dates are not recalculated if timezone changes.
- The React application (`src/App.tsx`) is connected to the backend. See `docs/FRONTEND_TASKS.md` for the open frontend work.
- Analytics read source logs/history and may become expensive over long histories; no materialized aggregate data is stored.
- `deleteHabit` and `deleteTask` are permanent and explicitly remove their subcollections because Firestore does not cascade deletes.
- Firebase configuration must be present for service calls; local emulator configuration should be used for Rules tests.
