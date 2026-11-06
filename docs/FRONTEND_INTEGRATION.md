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

The Firebase configuration module initializes lazily when a backend function needs Firebase. Current React source does not yet import the backend entry point; this guide describes the integration surface for Aruna's frontend work.

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

Available functions are `register(input)`, `login(email, password)`, `logout()`, `getCurrentUser()`, `subscribeToAuthState(callback, onError?)`, and `requestPasswordReset(email)`. `RegisterInput` is exported and requires `email`, `password`, `displayName`, with optional `timezone`. Passwords are never written to Firestore.

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

Habit settings history is effective-dated. Creation is effective today in the profile timezone; updates and archive/restore take effect the next local day. Habit type is immutable. `deleteHabit` permanently removes the habit, its logs, and settings history; choose archive when history must be preserved.

```ts
import { addHabitLog, getDailyProgress, getHabitLogs } from '../backend'

const log = await addHabitLog(habit.id) // today by default
const progress = await getDailyProgress(habit.id)
const history = await getHabitLogs('2026-11-01', '2026-11-30', habit.id)
```

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

Calendar returns `CalendarDay[]`, including empty day buckets, with discriminated `habit` and `task` events. Weeks begin Monday. Streaks count consecutive scheduled days; unscheduled dates are skipped, missed scheduled historical days break a run, and an incomplete current day remains pending. Count habits complete when the sum for the date reaches that date's historical target. Analytics derive from logs and history; no aggregate collection is maintained. Analytics and dashboard reject unsupported future dates, though calendar can represent a requested date range without applying that future-date restriction.

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

These are recorded results from the latest reported run, not a claim that this documentation-only change reran those checks.

## Known limits

- There is no trusted server or Admin SDK. Client Rules are the security boundary; highly authoritative time/business policies would require trusted server logic.
- Local dates follow the profile timezone. Existing log dates are not recalculated if timezone changes.
- Backend exports are available, but the current React application has not yet been connected to them.
- Analytics read source logs/history and may become expensive over long histories; no materialized aggregate data is stored.
- `deleteHabit` and `deleteTask` are permanent and explicitly remove their subcollections because Firestore does not cascade deletes.
- Firebase configuration must be present for service calls; local emulator configuration should be used for Rules tests.
