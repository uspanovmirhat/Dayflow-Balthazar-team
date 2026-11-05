import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { buildCalendarDays } from './calendar.engine'
import type { Habit, HabitLog, HabitSettings, Task } from '../types'

const timestamp = Timestamp.fromDate(new Date('2026-11-01T00:00:00.000Z'))

describe('calendar engine', () => {
  it('combines scheduled habit results and due tasks into local date buckets', () => {
    const habits: Habit[] = [{
      id: 'read', userId: 'u', name: 'Read', description: '', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'daily' }, isArchived: false, archivedFrom: null, isDeleting: false, settingsVersion: 1,
      createdAt: timestamp, updatedAt: timestamp,
    }]
    const history: HabitSettings[] = [{
      id: '1', userId: 'u', habitId: 'read', type: 'boolean', targetPerDay: 1, schedule: { type: 'daily' },
      isArchived: false, effectiveFrom: '2026-11-05', version: 1, createdAt: timestamp,
    }]
    const logs: HabitLog[] = [{
      id: '2026-11-05', userId: 'u', habitId: 'read', value: 1, date: '2026-11-05', settingsVersion: 1, completedAt: timestamp,
    }]
    const tasks: Task[] = [{
      id: 't1', userId: 'u', title: 'Plan', description: '', status: 'todo', priority: 'medium',
      dueDate: '2026-11-06', completedAt: null, createdAt: timestamp, updatedAt: timestamp, statusVersion: 1,
    }]
    expect(buildCalendarDays(habits, history, logs, tasks, '2026-11-05', '2026-11-06')).toEqual([
      { date: '2026-11-05', events: [{ kind: 'habit', id: 'read:2026-11-05', habitId: 'read', title: 'Read', date: '2026-11-05', completed: true, value: 1, target: 1 }] },
      { date: '2026-11-06', events: [{ kind: 'habit', id: 'read:2026-11-06', habitId: 'read', title: 'Read', date: '2026-11-06', completed: false, value: 0, target: 1 }, { kind: 'task', id: 't1', title: 'Plan', date: '2026-11-06', status: 'todo', priority: 'medium' }] },
    ])
  })
})
