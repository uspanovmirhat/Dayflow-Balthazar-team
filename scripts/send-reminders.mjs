// Sends due reminders as FCM push notifications to every registered device of every user.
// Runs on a schedule in GitHub Actions (.github/workflows/reminders.yml) — free, no Cloud Functions / Blaze plan needed.
//
// Env: FIREBASE_SERVICE_ACCOUNT — the service account JSON (Firebase console → Project settings → Service accounts).
// Local run: FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" node scripts/send-reminders.mjs [--dry-run]
//
// The due logic and the notification key mirror dueReminder() in src/backend/utils/reminders.ts — keep them in sync.
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

const WINDOW_MINUTES = 30 // GitHub cron can start several minutes late; a reminder stays deliverable this long.
const DRY_RUN = process.argv.includes('--dry-run')
const APP_URL = process.env.APP_URL || ''

const raw = process.env.FIREBASE_SERVICE_ACCOUNT
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set.')
  process.exit(1)
}
const serviceAccount = JSON.parse(raw)
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()
const messaging = getMessaging()

function localDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
function localTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type)?.value ?? '00'
  return `${part('hour')}:${part('minute')}`
}
const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
function isoWeekday(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}
function occursOn(schedule, date) {
  if (date < schedule.startDate || (schedule.endDate && date > schedule.endDate)) return false
  const weekday = isoWeekday(date)
  switch (schedule.repeat) {
    case 'once': return date === schedule.startDate
    case 'daily': return true
    case 'weekdays': return weekday <= 5
    case 'weekends': return weekday >= 6
    case 'weekly': return weekday === isoWeekday(schedule.startDate)
    default: return Boolean(schedule.days?.includes(weekday))
  }
}
function dueReminder(reminder, now, timeZone) {
  if (!reminder.enabled) return null
  const windowMs = WINDOW_MINUTES * 60_000
  const snoozedUntil = reminder.snoozedUntil instanceof Timestamp ? reminder.snoozedUntil.toMillis() : null
  if (snoozedUntil !== null && snoozedUntil <= now.getTime() && now.getTime() - snoozedUntil < windowMs) {
    return { key: `${reminder.id}:snooze:${snoozedUntil}`, snoozed: true, date: localDate(new Date(snoozedUntil), timeZone) }
  }
  const today = localDate(now, timeZone)
  const completedAt = reminder.completedAt instanceof Timestamp ? reminder.completedAt.toDate() : null
  if (completedAt && (reminder.schedule.repeat === 'once' || localDate(completedAt, timeZone) === today)) return null
  if (!occursOn(reminder.schedule, today)) return null
  const elapsed = minutesOf(localTime(now, timeZone)) - minutesOf(reminder.time)
  if (elapsed < 0 || elapsed >= WINDOW_MINUTES) return null
  return { key: `${reminder.id}:${today}:${reminder.time}`, snoozed: false, date: today }
}

/** Returns { skip, name } for a reminder linked to a habit or task. */
async function checkLink(userRef, link, date) {
  if (!link) return { skip: false, name: null }
  if (link.kind === 'task') {
    const task = await userRef.collection('tasks').doc(link.id).get()
    if (!task.exists || task.get('isDeleting') || task.get('status') === 'completed') return { skip: true }
    return { skip: false, name: task.get('title') }
  }
  const habit = await userRef.collection('habits').doc(link.id).get()
  if (!habit.exists || habit.get('isArchived') || habit.get('isDeleting')) return { skip: true }
  const logs = await habit.ref.collection('logs').where('date', '==', date).get()
  const done = logs.docs.reduce((sum, log) => sum + (Number(log.get('value')) || 0), 0)
  return { skip: done >= (Number(habit.get('targetPerDay')) || 1), name: habit.get('name') }
}

const INVALID_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'])

async function run() {
  const now = new Date()
  let sent = 0
  let checked = 0
  const users = await db.collection('users').get()
  for (const user of users.docs) {
    const devices = await user.ref.collection('devices').get()
    if (devices.empty) continue
    const timeZone = user.get('timezone') || 'UTC'
    const reminders = await user.ref.collection('reminders').where('enabled', '==', true).get()
    for (const snapshot of reminders.docs) {
      checked += 1
      const reminder = { ...snapshot.data(), id: snapshot.id }
      const due = dueReminder(reminder, now, timeZone)
      if (!due) continue
      // One log document per occurrence — so a later cron run (or an overlapping one) never sends it again.
      const logRef = db.collection('notificationLog').doc(`${user.id}__${due.key.replace(/[/]/g, '_')}`)
      const link = await checkLink(user.ref, reminder.link ?? null, due.date)
      if (link.skip && !due.snoozed) continue
      if (DRY_RUN) { console.log(`[dry-run] ${user.id} → ${reminder.title} (${due.key}) to ${devices.size} device(s)`); continue }
      try {
        await logRef.create({ userId: user.id, reminderId: reminder.id, key: due.key, sentAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(now.getTime() + 7 * 86_400_000) })
      } catch (error) {
        if (error.code === 6 || /already exists/i.test(String(error.message))) continue // already sent
        throw error
      }
      const prefix = reminder.link && link.name && link.name !== reminder.title ? `${reminder.link.kind === 'habit' ? 'Привычка' : 'Задача'}: ${link.name}` : ''
      const body = [prefix, reminder.description].filter(Boolean).join(' · ') || (reminder.link?.kind === 'habit' ? 'Пора выполнить привычку' : reminder.link?.kind === 'task' ? 'Не забудьте про задачу' : '')
      const tokens = devices.docs.map((device) => device.get('token'))
      const response = await messaging.sendEachForMulticast({
        tokens,
        data: { key: due.key, title: reminder.title, body, url: `${APP_URL}/?page=reminders` },
        webpush: { headers: { Urgency: 'high', TTL: String(WINDOW_MINUTES * 60) } },
      })
      sent += response.successCount
      await Promise.all(response.responses.map(async (result, index) => {
        if (result.success) return
        console.warn(`Push failed for ${user.id}/${devices.docs[index].id}: ${result.error?.code}`)
        if (INVALID_TOKEN_CODES.has(result.error?.code)) await devices.docs[index].ref.delete()
      }))
    }
  }
  console.log(`Checked ${checked} reminder(s) of ${users.size} user(s), delivered ${sent} push notification(s).`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
