import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createTaskRecord: vi.fn(),
  deleteTaskRecord: vi.fn(),
  readTask: vi.fn(),
  readTasks: vi.fn(),
  readTasksByDateRange: vi.fn(),
  readTasksByStatus: vi.fn(),
  updateTaskRecord: vi.fn(),
  currentUserContext: vi.fn(),
  currentUserId: vi.fn(),
}))

vi.mock('../repositories/task.repository', () => ({
  createTaskRecord: mocks.createTaskRecord,
  deleteTaskRecord: mocks.deleteTaskRecord,
  readTask: mocks.readTask,
  readTasks: mocks.readTasks,
  readTasksByDateRange: mocks.readTasksByDateRange,
  readTasksByStatus: mocks.readTasksByStatus,
  updateTaskRecord: mocks.updateTaskRecord,
}))
vi.mock('./shared', () => ({
  currentUserContext: mocks.currentUserContext,
  currentUserId: mocks.currentUserId,
  runBackendOperation: (operation: () => Promise<unknown>) => operation(),
}))

import { changeTaskStatus, createTask, deleteTask, getTasks, updateTask } from './task.service'
import type { Task } from '../types'

const task = {
  id: 't1', userId: 'u1', title: 'Plan', description: '', status: 'todo', priority: 'medium',
  dueDate: null, completedAt: null, statusVersion: 1,
} as Task

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUserContext.mockResolvedValue({ uid: 'u1', today: '2026-11-05' })
  mocks.currentUserId.mockReturnValue('u1')
  mocks.createTaskRecord.mockResolvedValue(task)
  mocks.readTask.mockResolvedValue(task)
  mocks.readTasks.mockResolvedValue([task])
  mocks.updateTaskRecord.mockResolvedValue({ ...task, status: 'completed' })
  mocks.deleteTaskRecord.mockResolvedValue(undefined)
})

describe('task service CRUD', () => {
  it('creates a task with defaults and the user local date', async () => {
    await createTask({ title: '  Plan  ' })
    expect(mocks.createTaskRecord).toHaveBeenCalledWith('u1', {
      title: 'Plan', description: '', status: 'todo', priority: 'medium', dueDate: null, localDate: '2026-11-05',
    })
  })

  it('reads tasks and records status transitions with the current local date', async () => {
    expect(await getTasks()).toEqual([task])
    await changeTaskStatus('t1', 'completed')
    expect(mocks.updateTaskRecord).toHaveBeenCalledWith('u1', 't1', expect.objectContaining({ status: 'completed', localDate: '2026-11-05' }))
  })

  it('updates task fields and deletes through its history cleanup operation', async () => {
    await updateTask('t1', { priority: 'high' })
    expect(mocks.updateTaskRecord).toHaveBeenCalledWith('u1', 't1', expect.objectContaining({ priority: 'high', localDate: undefined }))
    await deleteTask('t1')
    expect(mocks.deleteTaskRecord).toHaveBeenCalledWith('u1', 't1')
  })

  it('validates inputs before writing', async () => {
    await expect(createTask({ title: ' ' })).rejects.toMatchObject({ code: 'validation' })
    expect(mocks.createTaskRecord).not.toHaveBeenCalled()
  })

  it('uses the local date for every requested status transition despite a stale pre-read', async () => {
    mocks.readTask.mockResolvedValueOnce({ ...task, status: 'todo' })
    await updateTask('t1', { status: 'todo' })
    expect(mocks.updateTaskRecord).toHaveBeenCalledWith('u1', 't1', expect.objectContaining({ localDate: '2026-11-05' }))
  })
})
