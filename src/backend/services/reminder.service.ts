import { createReminderRecord, deleteReminderRecord, readReminders, updateReminderRecord } from '../repositories/reminder.repository'
import type { Reminder, ReminderInput } from '../types'
import { BackendError } from '../utils/errors'
import { validateReminderLink, validateReminderSchedule } from '../utils/reminders'
import { validateId, requireString } from '../utils/validation'
import { currentUserId, runBackendOperation } from './shared'

function validate(input: ReminderInput) {
  if (!input || typeof input !== 'object') throw new BackendError('validation', 'Укажите данные напоминания.')
  requireString(input.title, 'title', 120)
  if (input.description !== undefined) requireString(input.description, 'description', 1000, true)
  if (typeof input.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new BackendError('validation', 'Укажите корректное время.')
  validateReminderSchedule(input.schedule)
  validateReminderLink(input.link)
}
export function getReminders(): Promise<Reminder[]> { return runBackendOperation(() => readReminders(currentUserId())) }
export function createReminder(input: ReminderInput): Promise<Reminder> { return runBackendOperation(() => { validate(input); return createReminderRecord(currentUserId(), { ...input, title: input.title.trim(), description: input.description?.trim() ?? '' }) }) }
export function updateReminder(id: string, input: Partial<ReminderInput>): Promise<Reminder> { return runBackendOperation(async () => { validateId(id); const uid = currentUserId(); const existing = (await readReminders(uid)).find((item) => item.id === id); if (!existing) throw new BackendError('not-found'); const next = { title: input.title ?? existing.title, description: input.description ?? existing.description, time: input.time ?? existing.time, schedule: input.schedule ?? existing.schedule, link: input.link !== undefined ? input.link : existing.link, enabled: input.enabled ?? existing.enabled }; validate(next); return updateReminderRecord(uid, id, { ...input, ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.description !== undefined ? { description: input.description.trim() } : {}) }) }) }
export function snoozeReminder(id: string, minutes: 5 | 10 | 15 | 30): Promise<Reminder> { return runBackendOperation(async () => { validateId(id); const uid = currentUserId(); if (![5, 10, 15, 30].includes(minutes)) throw new BackendError('validation', 'Время откладывания некорректно.'); return updateReminderRecord(uid, id, { snoozedUntil: new Date(Date.now() + minutes * 60_000) }) }) }
export function completeReminder(id: string): Promise<Reminder> { return runBackendOperation(async () => { validateId(id); return updateReminderRecord(currentUserId(), id, { completedAt: new Date() }) }) }
export function deleteReminder(id: string): Promise<void> { return runBackendOperation(async () => { validateId(id); await deleteReminderRecord(currentUserId(), id) }) }
