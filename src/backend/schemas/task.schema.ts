import { Timestamp } from 'firebase/firestore'
import type { Task, TaskPriority, TaskStatus, TaskStatusEvent } from '../types'
import { BackendError } from '../utils/errors'
import { validateTaskInput } from '../utils/validation'
import { asRecord, requireStoredDate, requireStoredString, requireStoredTimestamp } from './common.schema'

export function parseTask(value: unknown, expectedUid: string, expectedId: string): Task {
  const data = asRecord(value, 'task')
  const id = requireStoredString(data.id, 'task.id', 128)
  const userId = requireStoredString(data.userId, 'task.userId', 128)
  if (id !== expectedId || userId !== expectedUid) throw new BackendError('failed-precondition', 'Task ownership or ID does not match its document path.')
  const status = data.status as TaskStatus
  const priority = data.priority as TaskPriority
  try {
    validateTaskInput({ title: data.title, description: data.description, status, priority, dueDate: data.dueDate })
  } catch {
    throw new BackendError('failed-precondition', 'Stored task fields are invalid.')
  }
  if (data.completedAt !== null && !(data.completedAt instanceof Timestamp)) {
    throw new BackendError('failed-precondition', 'Stored task completedAt is invalid.')
  }
  if ((status === 'completed') !== (data.completedAt !== null)) throw new BackendError('failed-precondition', 'Stored task completion state is inconsistent.')
  if (!Number.isInteger(data.statusVersion) || Number(data.statusVersion) < 1) throw new BackendError('failed-precondition', 'Stored task statusVersion is invalid.')
  const isDeleting = data.isDeleting === undefined ? false : data.isDeleting
  if (typeof isDeleting !== 'boolean') throw new BackendError('failed-precondition', 'Stored task deletion state is invalid.')
  return {
    id, userId,
    title: requireStoredString(data.title, 'task.title', 200),
    description: requireStoredString(data.description, 'task.description', 4000, true),
    status, priority,
    dueDate: data.dueDate === null ? null : requireStoredDate(data.dueDate, 'task.dueDate'),
    completedAt: data.completedAt === null ? null : requireStoredTimestamp(data.completedAt, 'task.completedAt'),
    createdAt: requireStoredTimestamp(data.createdAt, 'task.createdAt'),
    updatedAt: requireStoredTimestamp(data.updatedAt, 'task.updatedAt'),
    statusVersion: Number(data.statusVersion), isDeleting,
  }
}

export function parseTaskStatusEvent(value: unknown, expectedUid: string, expectedTaskId: string, expectedId: string): TaskStatusEvent {
  const data = asRecord(value, 'task status event')
  const id = requireStoredString(data.id, 'status event.id', 128)
  const userId = requireStoredString(data.userId, 'status event.userId', 128)
  const taskId = requireStoredString(data.taskId, 'status event.taskId', 128)
  if (id !== expectedId || userId !== expectedUid || taskId !== expectedTaskId) throw new BackendError('failed-precondition', 'Task event ownership or ID is invalid.')
  if (data.status !== 'todo' && data.status !== 'in_progress' && data.status !== 'completed') throw new BackendError('failed-precondition', 'Stored task event status is invalid.')
  if (!Number.isInteger(data.version) || Number(data.version) < 1) throw new BackendError('failed-precondition', 'Stored task event version is invalid.')
  if (id !== String(data.version)) throw new BackendError('failed-precondition', 'Task event version does not match its document ID.')
  return {
    id, userId, taskId, status: data.status,
    date: requireStoredDate(data.date, 'status event.date'),
    version: Number(data.version),
    changedAt: requireStoredTimestamp(data.changedAt, 'status event.changedAt'),
  }
}
