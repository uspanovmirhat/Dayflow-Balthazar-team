import { Timestamp } from 'firebase/firestore'
import type { Reminder, ReminderSchedule } from '../types'
import { BackendError } from '../utils/errors'
import { validateReminderSchedule } from '../utils/reminders'
import { asRecord, requireStoredString, requireStoredTimestamp } from './common.schema'

export function parseReminder(value: unknown, uid: string, id: string): Reminder {
  const data = asRecord(value, 'reminder')
  if (data.userId !== uid || data.id !== id) throw new BackendError('failed-precondition', 'Напоминание принадлежит другому пользователю или повреждено.')
  const schedule = data.schedule as ReminderSchedule
  try { validateReminderSchedule(schedule) } catch { throw new BackendError('failed-precondition', 'Расписание напоминания повреждено.') }
  if (typeof data.enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(data.time))) throw new BackendError('failed-precondition', 'Поля напоминания повреждены.')
  if (data.completedAt !== null && !(data.completedAt instanceof Timestamp)) throw new BackendError('failed-precondition', 'Статус напоминания поврежден.')
  if (data.snoozedUntil !== null && !(data.snoozedUntil instanceof Timestamp)) throw new BackendError('failed-precondition', 'Отложенное время повреждено.')
  return { id, userId: uid, title: requireStoredString(data.title, 'reminder.title', 120), description: requireStoredString(data.description, 'reminder.description', 1000, true), time: data.time as string, schedule, enabled: data.enabled, completedAt: data.completedAt, snoozedUntil: data.snoozedUntil, createdAt: requireStoredTimestamp(data.createdAt, 'reminder.createdAt'), updatedAt: requireStoredTimestamp(data.updatedAt, 'reminder.updatedAt') }
}
