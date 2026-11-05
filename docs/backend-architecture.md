# DAYFLOW Backend Architecture

## Runtime and boundaries

The MVP uses the Firebase Web SDK from the React/Vite client. There is no separate API server or privileged service account. Firebase Authentication identifies the caller; Firestore Security Rules enforce ownership and document invariants. The modules under `src/backend` contain client operations and pure business logic. The React UI is unchanged. The current React entry does not import `src/backend/index.ts`, so the backend is not yet wired into the UI and the current Vite bundle excludes Firebase. A future Node SSR/server runtime must be audited separately because it selects Firestore's Node transport.

The public frontend entry point is `src/backend/index.ts`. It exports services, result types, pure schedule/date helpers, and the engines. Firebase initialization is lazy: importing the public entry point does not fail when local Firebase variables are absent; the first Firebase operation returns a `BackendError` with code `configuration`. Repository reads validate stored documents at runtime. Missing profiles are created; existing malformed profiles return `failed-precondition` and are not silently overwritten.

## Module dependencies

```text
types + validation + errors + local-date/schedule helpers
                         ↓
              Firebase repositories
               ↙        ↓        ↘
          Streaks    Calendar    Tasks/logs
               ↘        ↓        ↙
                    Analytics
```

Streak, analytics, and calendar calculations are pure functions where possible. They consume repository data and do not save calculated totals. Rules and indexes live at the repository root; query/index mappings are described in `firestore-schema.md`.

## Firestore schema

- `users/{uid}`: profile, keyed by Firebase Authentication UID.
- `users/{uid}/habits/{habitId}`: current habit settings, lifecycle state, and deletion lock.
- `users/{uid}/habits/{habitId}/settingsHistory/{version}`: immutable schedule/target/type/archive versions.
- `users/{uid}/habits/{habitId}/logs/{logId}`: source-of-truth completion events with the settings version effective on each local date.
- `users/{uid}/tasks/{taskId}`: current task state.
- `users/{uid}/tasks/{taskId}/statusHistory/{version}`: immutable status transitions.

`userId` and `habitId` are copied onto logs/history records so collection-group queries can be scoped to a caller and a date range. These fields are ownership/query keys; completion totals and analytics are never copied into documents.

## Schedule history and dates

Dates use `YYYY-MM-DD` in the user’s IANA timezone. The timezone is read from the profile when the service chooses “today.” A log’s stored date is permanent and is not recalculated if the user later changes timezone.

When a habit is created, its first settings version takes effect on the current local date. Later edits and archive/restore operations take effect on the next local date. This keeps the current day’s denominator and target stable. The parent habit is updated immediately for ordinary active-list views; historical calculations use `settingsHistory` and its `effectiveFrom` date. Habit type is immutable because changing boolean/count semantics would make old logs ambiguous.

`weekdays.days` uses ISO numbering (Monday 1 through Sunday 7). Interval schedules count whole local calendar dates from `startDate`; calculations use UTC ordinals internally so daylight-saving transitions do not add or remove a scheduled day.

## Logs and concurrency

- Boolean log IDs equal the local date. A Firestore transaction reads the parent habit and effective settings before creating a log and checks for an existing document. Security Rules independently validate the referenced settings version, its schedule/archive state, and deny overwriting an existing log.
- Count logs use unique document IDs. Each positive increment is a separate immutable event, so concurrent additions do not overwrite an aggregate counter. Daily value is the sum of logs; completion means the sum is at least the target effective that date.
- Habit deletion first sets `isDeleting` in a transaction. Log transactions read the parent, and Rules reject new logs once this flag is set. The service then removes logs/history in batches and deletes the parent. If cleanup fails, retrying deletion resumes from the locked parent without reopening writes.
- Removing a log deletes that source event. The next analytics/calendar read reflects the removal without repairing stored aggregates.

## Streaks and analytics

Streaks count consecutive *scheduled* dates. An unscheduled weekday is skipped. A missed scheduled date breaks the run. An incomplete current local day remains pending for current-streak purposes until its date passes. Longest streak and total completed days use the complete available history. Count habits complete a day when the sum reaches that day’s historical target.

Analytics use logs, settings history, tasks, and task status events. Week ranges start Monday; the weekly helper reports Monday through the selected local date. The monthly helper reports the first of the selected month through that date. Task totals/status/overdue counts describe the current task set; `completedOverTime` uses status-transition history and can count a task again if it is reopened and completed again.

The dashboard and lifetime longest-streak calculation read the user’s habit settings history and logs back to the beginning of the relevant habit. Range analytics and calendar requests constrain logs by date. No derived analytics collection is created.

## Calendar and query strategy

Calendar reads habits and settings history, then issues collection-group range queries for logs and date-range queries for tasks. The same logs query serves all habits, avoiding one request per habit. Events are returned as one `CalendarDay` per date, with habit and task event discriminants.

## Security boundary and known limits

Rules limit access to the caller’s UID, validate allowed fields/types, prevent boolean duplicate document creation, validate log schedule/archive state, require task status history to accompany a status transition, and permit habit history deletion only after the deletion lock is set. Logs and history records are immutable after creation, though owners may delete logs.

Rules validate actual calendar dates, evaluate schedule recurrence from the local-date string, and check the log's exact effective settings version. They cannot resolve the profile's IANA timezone from `request.time`; for future-date checks the service uses the profile timezone, while Rules restrict a new settings effective date to a small UTC-relative window and require it to be monotonic. A client can still choose the UTC date at a moment when that is yesterday in its local timezone. Fully authoritative timezone semantics would require a trusted server. The MVP does not use Cloud Functions or a paid server.

### Dependency security note (checked 2026-11-05)

The lockfile resolves `firebase@13.2.0` → `@firebase/firestore@4.19.1` → `@grpc/grpc-js@1.9.16`. Firestore declares the last dependency as `~1.9.0`, which excludes the patched gRPC releases `1.13.6` and `1.14.5`. The advisory concerns a gRPC server certificate-authentication path when `requireClientCertificate` is false; this project uses the browser Firebase SDK and has no gRPC server. The current Vite `dist` bundle contains neither Firebase SDK code nor `@grpc/grpc-js`, so the npm graph finding alone does not demonstrate browser exploitability. The Firebase package's browser entry also avoids the Node gRPC transport.

As of this check, npm reports `firebase@13.2.0` and `@firebase/firestore@4.19.1` as latest, with the same dependency range. The Firebase SDK issue tracking this pin remains open. npm's suggested Firebase 9.14 downgrade is a major downgrade; a forced `@grpc/grpc-js` override falls outside Firestore's declared range and can leave the nested vulnerable version installed. No dependency override or automatic update is applied. Recheck this note when Firebase publishes a Firestore release with a patched gRPC dependency range. See [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j) and the [Firebase SDK tracking issue](https://github.com/firebase/firebase-js-sdk/issues/10400).

Habit deletion explicitly deletes logs and settings history in batches before deleting the habit. Task deletion removes status history before the task. Firestore does not cascade subcollections automatically.
