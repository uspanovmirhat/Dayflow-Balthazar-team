import { describe, expect, it } from 'vitest'
import { BackendError } from './errors'
import { validateHabitInput, validateProfileInput, validateTaskInput } from './validation'

describe('backend validation', () => {
  it('rejects empty names and invalid habit targets', () => {
    expect(() => validateHabitInput({ name: ' ', type: 'boolean', targetPerDay: 1, schedule: { type: 'daily' } })).toThrow(BackendError)
    expect(() => validateHabitInput({ name: 'Read', type: 'boolean', targetPerDay: 2, schedule: { type: 'daily' } })).toThrow(BackendError)
  })

  it('validates task status, priority and dates', () => {
    expect(() => validateTaskInput({ title: 'Task', status: 'blocked' })).toThrow(BackendError)
    expect(() => validateTaskInput({ title: 'Task', dueDate: '2026-02-30' })).toThrow(BackendError)
    expect(() => validateTaskInput({ title: 'Task', priority: 'urgent' })).toThrow(BackendError)
  })

  it('requires a timezone in the Rules-supported IANA allowlist', () => {
    expect(() => validateProfileInput({ timezone: 'Mars/Olympus' })).toThrow(BackendError)
    expect(() => validateProfileInput({ timezone: 'Asia/Qyzylorda' })).not.toThrow()
    expect(() => validateProfileInput({ timezone: 'America/Detroit' })).toThrow(BackendError)
  })
})
