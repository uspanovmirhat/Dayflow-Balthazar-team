# Firestore Schema and Indexes

## Collections

| Path | Purpose | Important fields |
| --- | --- | --- |
| `users/{uid}` | User profile | `uid`, `email`, `displayName`, `timezone`, `createdAt`, `updatedAt` |
| `users/{uid}/habits/{habitId}` | Current habit and deletion lock | `name`, `type`, `targetPerDay`, `schedule`, `isArchived`, `archivedFrom`, `isDeleting`, `settingsVersion` |
| `users/{uid}/habits/{habitId}/settingsHistory/{version}` | Effective-dated settings | `userId`, `habitId`, `type`, `targetPerDay`, `schedule`, `isArchived`, `effectiveFrom`, `version` |
| `users/{uid}/habits/{habitId}/logs/{logId}` | Completion event | `userId`, `habitId`, `value`, `date`, `settingsVersion`, `completedAt` |
| `users/{uid}/tasks/{taskId}` | Current task | `title`, `status`, `priority`, `dueDate`, `completedAt`, `statusVersion` |
| `users/{uid}/tasks/{taskId}/statusHistory/{version}` | Status transition | `userId`, `taskId`, `status`, `date`, `version`, `changedAt` |

Timestamps are Firestore `serverTimestamp()` values. Dates are local-date strings (`YYYY-MM-DD`) based on the profile timezone. A boolean log document ID is its date; count log IDs are generated uniquely. New logs store the settings-history version effective on their date so Rules can validate schedule and archive state without trusting a stale client-side precheck. Legacy logs without this field remain readable; new client writes must include it. Legacy habit documents without `isDeleting` are treated as unlocked until deletion begins.

## Composite indexes

`firestore.indexes.json` contains these collection-group indexes:

| Index | Query requiring it |
| --- | --- |
| `logs`: `userId ASC, date ASC` | All-user habit log range reads for analytics/calendar (`userId == uid`, `date >= start`, `date <= end`). |
| `settingsHistory`: `userId ASC, effectiveFrom ASC` | Read a user’s effective-dated settings versions; versions are then selected in memory for each requested date. |
| `statusHistory`: `userId ASC, date ASC` | Read task status transitions for a selected period. |

Task queries filter by one field at a time (`status == ...` or `dueDate` range), so Firestore’s automatic single-field indexes cover the current repository methods. If a future UI asks for status plus due-date filtering or multi-field ordering, add the matching composite index alongside that query.

## Security Rules

`firestore.rules` allow a signed-in user to access only `users/{request.auth.uid}`. Collection-group reads require the record’s `userId` to match the caller. Rules reject unknown fields, impossible calendar dates, invalid task statuses/priorities, invalid habit types/schedules, logs for unscheduled or archived dates, boolean log overwrites, and task status changes without the corresponding atomic history event. Task status event dates are restricted to a narrow window around the current UTC date to accommodate local timezones while rejecting forged historical events. New settings versions must be monotonic and have an effective date in a narrow window around the current UTC date, accounting for the user's local date being up to one calendar day ahead or behind UTC.

Rules validate calendar dates and evaluate weekday/interval schedules. Profile timezones are restricted to the allowlist mirrored in `src/backend/utils/schedules.ts`; unsupported legacy values are repaired to UTC on profile reads. The public service additionally checks that dates are not future dates in the profile timezone. Rules cannot resolve an IANA timezone from `request.time`; their effective-date window prevents arbitrary backdating but may accept the UTC date when it is still the current local date in a timezone east of UTC. The system remains client-side; authoritative timezone enforcement requires a trusted server.
