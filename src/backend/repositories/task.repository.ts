import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getFirebaseServices } from '../config/firebase'
import type { LocalDate, Task, TaskPriority, TaskStatus, TaskStatusEvent } from '../types'
import { BackendError } from '../utils/errors'
import { parseTask, parseTaskStatusEvent } from '../schemas/task.schema'

export function tasksRef(uid: string) {
  return collection(getFirebaseServices().db, 'users', uid, 'tasks')
}

export function taskRef(uid: string, taskId: string) {
  return doc(getFirebaseServices().db, 'users', uid, 'tasks', taskId)
}

export async function createTaskRecord(uid: string, input: {
  title: string; description: string; status: TaskStatus; priority: TaskPriority; dueDate: LocalDate | null; localDate: LocalDate
}): Promise<Task> {
  const db = getFirebaseServices().db
  const ref = doc(tasksRef(uid))
  await runTransaction(db, async (transaction) => {
    transaction.set(ref, {
      id: ref.id, userId: uid, title: input.title, description: input.description,
      status: input.status, priority: input.priority, dueDate: input.dueDate,
      completedAt: input.status === 'completed' ? serverTimestamp() : null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      statusVersion: 1,
    })
    const event = doc(collection(ref, 'statusHistory'), '1')
    transaction.set(event, {
      id: event.id, userId: uid, taskId: ref.id, status: input.status,
      date: input.localDate, version: 1, changedAt: serverTimestamp(),
    })
  })
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) throw new BackendError('internal', 'Created task could not be read back.')
  return parseTask(snapshot.data(), uid, ref.id)
}

export async function readTask(uid: string, taskId: string): Promise<Task | null> {
  const snapshot = await getDoc(taskRef(uid, taskId))
  return snapshot.exists() ? parseTask(snapshot.data(), uid, snapshot.id) : null
}

export async function readTasks(uid: string): Promise<Task[]> {
  const snapshot = await getDocs(tasksRef(uid))
  return snapshot.docs.map((item) => parseTask(item.data(), uid, item.id))
}

export async function readTasksByStatus(uid: string, status: TaskStatus): Promise<Task[]> {
  const snapshot = await getDocs(query(tasksRef(uid), where('status', '==', status)))
  return snapshot.docs.map((item) => parseTask(item.data(), uid, item.id))
}

export async function readTasksByDateRange(uid: string, startDate: LocalDate, endDate: LocalDate): Promise<Task[]> {
  const snapshot = await getDocs(query(tasksRef(uid), where('dueDate', '>=', startDate), where('dueDate', '<=', endDate)))
  return snapshot.docs.map((item) => parseTask(item.data(), uid, item.id))
}

export async function readTaskStatusHistory(uid: string, startDate?: LocalDate, endDate?: LocalDate): Promise<TaskStatusEvent[]> {
  const filters = [where('userId', '==', uid)]
  if (startDate) filters.push(where('date', '>=', startDate))
  if (endDate) filters.push(where('date', '<=', endDate))
  const snapshot = await getDocs(query(collectionGroup(getFirebaseServices().db, 'statusHistory'), ...filters))
  return snapshot.docs.map((item) => {
    const taskId = item.ref.parent.parent?.id
    if (!taskId) throw new BackendError('failed-precondition', 'Task history is outside the expected path.')
    return parseTaskStatusEvent(item.data(), uid, taskId, item.id)
  })
}

export async function updateTaskRecord(uid: string, taskId: string, patch: {
  title?: string; description?: string; priority?: TaskPriority; dueDate?: LocalDate | null; status?: TaskStatus; localDate?: LocalDate
}): Promise<Task> {
  const db = getFirebaseServices().db
  const ref = taskRef(uid, taskId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new BackendError('not-found')
    const current = snapshot.data()
    const nextStatus = patch.status ?? current.status as TaskStatus
    const statusChanged = patch.status !== undefined && patch.status !== current.status
    const nextVersion = Number(current.statusVersion ?? 1) + (statusChanged ? 1 : 0)
    const changes: Record<string, unknown> = { updatedAt: serverTimestamp() }
    if (patch.title !== undefined) changes.title = patch.title
    if (patch.description !== undefined) changes.description = patch.description
    if (patch.priority !== undefined) changes.priority = patch.priority
    if (patch.dueDate !== undefined) changes.dueDate = patch.dueDate
    if (patch.status !== undefined) {
      changes.status = patch.status
      changes.statusVersion = nextVersion
      changes.completedAt = patch.status === 'completed'
        ? (current.status === 'completed' ? current.completedAt ?? serverTimestamp() : serverTimestamp())
        : null
    }
    transaction.update(ref, changes)
    if (statusChanged) {
      const event = doc(collection(ref, 'statusHistory'), String(nextVersion))
      transaction.set(event, {
        id: event.id, userId: uid, taskId, status: nextStatus,
        date: patch.localDate, version: nextVersion, changedAt: serverTimestamp(),
      })
    }
  })
  const task = await readTask(uid, taskId)
  if (!task) throw new BackendError('not-found', 'Task was not found after update.')
  return task
}

export async function deleteTaskRecord(uid: string, taskId: string): Promise<void> {
  const db = getFirebaseServices().db
  const ref = taskRef(uid, taskId)
  const history = await getDocs(collection(ref, 'statusHistory'))
  for (let offset = 0; offset < history.docs.length; offset += 400) {
    const batch = writeBatch(db)
    history.docs.slice(offset, offset + 400).forEach((item) => batch.delete(item.ref))
    await batch.commit()
  }
  await deleteDoc(ref)
}
