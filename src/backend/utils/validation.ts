import { BackendError } from './errors'
import { assertLocalDate } from './dates'
import { isValidTimezone, validateSchedule } from './schedules'
import type { HabitType, TaskPriority, TaskStatus } from '../types'

export function requireString(value: unknown, field: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string') throw new BackendError('validation', `${field} must be a string.`)
  const normalized = value.trim()
  if ((!allowEmpty && normalized.length === 0) || normalized.length > maxLength) {
    throw new BackendError('validation', `${field} must be ${allowEmpty ? 'at most' : 'between 1 and'} ${maxLength} characters.`)
  }
  return normalized
}

export function validateHabitInput(input: {
  name: unknown
  description?: unknown
  type: unknown
  targetPerDay: unknown
  schedule: unknown
}): void {
  if (!input || typeof input !== 'object') throw new BackendError('validation', 'Habit input must be an object.')
  requireString(input.name, 'name', 120)
  if (input.description !== undefined) requireString(input.description, 'description', 2000, true)
  if (input.type !== 'boolean' && input.type !== 'count') throw new BackendError('validation', 'type must be boolean or count.')
  if (typeof input.targetPerDay !== 'number' || !Number.isFinite(input.targetPerDay) || input.targetPerDay <= 0 || input.targetPerDay > 1_000_000) {
    throw new BackendError('validation', 'targetPerDay must be greater than 0 and at most 1,000,000.')
  }
  if (input.type === 'boolean' && input.targetPerDay !== 1) {
    throw new BackendError('validation', 'Boolean habits must have targetPerDay equal to 1.')
  }
  validateSchedule(input.schedule)
}

export function validateHabitType(value: unknown): value is HabitType {
  return value === 'boolean' || value === 'count'
}

export function validateTaskStatus(value: unknown): value is TaskStatus {
  return value === 'todo' || value === 'in_progress' || value === 'completed'
}

export function validateTaskPriority(value: unknown): value is TaskPriority {
  return value === 'low' || value === 'medium' || value === 'high'
}

export function validateTaskInput(input: { title: unknown; description?: unknown; status?: unknown; priority?: unknown; dueDate?: unknown }): void {
  if (!input || typeof input !== 'object') throw new BackendError('validation', 'Task input must be an object.')
  requireString(input.title, 'title', 200)
  if (input.description !== undefined) requireString(input.description, 'description', 4000, true)
  if (input.status !== undefined && !validateTaskStatus(input.status)) throw new BackendError('validation', 'status is invalid.')
  if (input.priority !== undefined && !validateTaskPriority(input.priority)) throw new BackendError('validation', 'priority is invalid.')
  if (input.dueDate !== undefined && input.dueDate !== null) assertLocalDate(input.dueDate, 'dueDate')
}

export function validateProfileInput(input: { displayName?: unknown; timezone?: unknown }): void {
  if (!input || typeof input !== 'object') throw new BackendError('validation', 'Profile input must be an object.')
  if (input.displayName !== undefined) requireString(input.displayName, 'displayName', 120, true)
  if (input.timezone !== undefined) {
    if (!isValidTimezone(input.timezone)) throw new BackendError('validation', 'timezone is not in the supported timezone list.')
  }
}

export function validateNonNegativeRange(startDate: string, endDate: string): void {
  assertLocalDate(startDate, 'startDate')
  assertLocalDate(endDate, 'endDate')
  if (startDate > endDate) throw new BackendError('validation', 'startDate must be on or before endDate.')
}

export function validateId(value: unknown, field = 'id'): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('/')) {
    throw new BackendError('validation', `${field} is invalid.`)
  }
}
