import { createTaskRecord, deleteTaskRecord, readTask, readTasks, readTasksByDateRange, readTasksByStatus, updateTaskRecord } from '../repositories/task.repository'
import { currentUserContext, currentUserId, runBackendOperation } from './shared'
import { BackendError } from '../utils/errors'
import { validateId, validateNonNegativeRange, validateTaskInput, validateTaskStatus } from '../utils/validation'
import type { LocalDate, Task, TaskPriority, TaskStatus } from '../types'

export interface TaskInput {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  dueDate?: LocalDate | null
}

export function createTask(input: TaskInput): Promise<Task> {
  return runBackendOperation(async () => {
    validateTaskInput(input)
    const { uid, today } = await currentUserContext()
    return createTaskRecord(uid, {
      title: input.title.trim(), description: input.description?.trim() ?? '',
      status: input.status ?? 'todo', priority: input.priority ?? 'medium',
      dueDate: input.dueDate ?? null, localDate: today,
    })
  })
}

export function getTask(taskId: string): Promise<Task> {
  return runBackendOperation(async () => {
    validateId(taskId, 'taskId')
    const task = await readTask(currentUserId(), taskId)
    if (!task) throw new BackendError('not-found', 'Task was not found.')
    return task
  })
}

export function getTasks(): Promise<Task[]> {
  return runBackendOperation(() => readTasks(currentUserId()))
}

export function getTasksByStatus(status: TaskStatus): Promise<Task[]> {
  return runBackendOperation(() => {
    if (!validateTaskStatus(status)) throw new BackendError('validation', 'status is invalid.')
    return readTasksByStatus(currentUserId(), status)
  })
}

export function getTasksByDateRange(startDate: LocalDate, endDate: LocalDate): Promise<Task[]> {
  return runBackendOperation(() => {
    validateNonNegativeRange(startDate, endDate)
    return readTasksByDateRange(currentUserId(), startDate, endDate)
  })
}

export function getTasksByDate(date: LocalDate): Promise<Task[]> {
  return getTasksByDateRange(date, date)
}

export function updateTask(taskId: string, patch: Partial<TaskInput>): Promise<Task> {
  return runBackendOperation(async () => {
    if (!patch || typeof patch !== 'object') throw new BackendError('validation', 'Task update must be an object.')
    if (Object.keys(patch).length === 0) throw new BackendError('validation', 'Task update must include at least one field.')
    validateId(taskId, 'taskId')
    const uid = currentUserId()
    const current = await readTask(uid, taskId)
    if (!current) throw new BackendError('not-found', 'Task was not found.')
    const merged = {
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      status: patch.status ?? current.status,
      priority: patch.priority ?? current.priority,
      dueDate: patch.dueDate === undefined ? current.dueDate : patch.dueDate,
    }
    validateTaskInput(merged)
    const localDate = patch.status !== undefined && patch.status !== current.status
      ? (await currentUserContext()).today
      : undefined
    return updateTaskRecord(uid, taskId, { ...patch, localDate })
  })
}

export function changeTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
  return updateTask(taskId, { status })
}

export function changeTaskPriority(taskId: string, priority: TaskPriority): Promise<Task> {
  return updateTask(taskId, { priority })
}

export function completeTask(taskId: string): Promise<Task> {
  return changeTaskStatus(taskId, 'completed')
}

export function deleteTask(taskId: string): Promise<void> {
  return runBackendOperation(async () => {
    validateId(taskId, 'taskId')
    const uid = currentUserId()
    if (!await readTask(uid, taskId)) throw new BackendError('not-found', 'Task was not found.')
    await deleteTaskRecord(uid, taskId)
  })
}
