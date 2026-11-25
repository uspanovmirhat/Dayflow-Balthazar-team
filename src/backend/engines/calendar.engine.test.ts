import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { buildCalendarDays } from './calendar.engine'
import type { Habit, HabitLog, HabitSettings, Task } from '../types'

const timestamp = Timestamp.fromDate(new Date('2026-11-01T00:00:00.000Z'))

describe('calendar engine', () => {
  it('combines scheduled habit results and due tasks into local date buckets', () => {
    const habits: Habit[] = [{
      id: 'read', userId: 'u', name: 'Read', description: '', color: '#6A9BC5', type: 'boolean', targetPerDay: 1,
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
      { date: '2026-11-05', events: [{ kind: 'habit', id: 'read:2026-11-05', habitId: 'read', title: 'Read', date: '2026-11-05', color: '#6A9BC5', habitType: 'boolean', status: 'completed', completed: true, value: 1, target: 1 }] },
      { date: '2026-11-06', events: [{ kind: 'habit', id: 'read:2026-11-06', habitId: 'read', title: 'Read', date: '2026-11-06', color: '#6A9BC5', habitType: 'boolean', status: 'pending', completed: false, value: 0, target: 1 }, { kind: 'task', id: 't1', title: 'Plan', date: '2026-11-06', status: 'todo', priority: 'medium' }] },
    ])
  })

  it('shows quantitative progress and completion from all logs for a day', () => {
    const habit: Habit = {
      id: 'water', userId: 'u', name: 'Water', description: '', color: '#6A9BC5', type: 'count', targetPerDay: 3,
      schedule: { type: 'daily' }, isArchived: false, archivedFrom: null, isDeleting: false, settingsVersion: 1,
      createdAt: timestamp, updatedAt: timestamp,
    }
    const settings: HabitSettings[] = [{
      id: '1', userId: 'u', habitId: 'water', type: 'count', targetPerDay: 3, schedule: { type: 'daily' },
      isArchived: false, effectiveFrom: '2026-11-05', version: 1, createdAt: timestamp,
    }]
    const logs: HabitLog[] = [1, 2].map((n) => ({
      id: String(n), userId: 'u', habitId: 'water', value: 1, date: '2026-11-05', settingsVersion: 1, completedAt: timestamp,
    }))
    const [day] = buildCalendarDays([habit], settings, logs, [], '2026-11-05', '2026-11-05')
    expect(day.events[0]).toMatchObject({ kind: 'habit', value: 2, target: 3, completed: false })
  })

  it('omits interval habits on rest days while retaining actual completion logs', () => {
    const habit: Habit = {
      id: 'walk', userId: 'u', name: 'Walk', description: '', color: '#6A9BC5', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'interval', everyNDays: 3, startDate: '2026-11-29' }, isArchived: false, archivedFrom: null,
      isDeleting: false, settingsVersion: 1, createdAt: timestamp, updatedAt: timestamp,
    }
    const settings: HabitSettings[] = [{
      id: '1', userId: 'u', habitId: 'walk', type: 'boolean', targetPerDay: 1, schedule: habit.schedule,
      isArchived: false, effectiveFrom: '2026-11-29', version: 1, createdAt: timestamp,
    }]
    const logs: HabitLog[] = [{
      id: 'walk:2026-12-02', userId: 'u', habitId: 'walk', value: 1, date: '2026-12-02', settingsVersion: 1, completedAt: timestamp,
    }]
    const days = buildCalendarDays([habit], settings, logs, [], '2026-11-29', '2026-12-05')
    expect(days.find((day) => day.date === '2026-11-30')?.events).toEqual([])
    expect(days.find((day) => day.date === '2026-12-02')?.events[0]).toMatchObject({ kind: 'habit', completed: true })
    expect(days.find((day) => day.date === '2026-12-05')?.events).toHaveLength(1)
  })

  it('labels interval occurrences as completed, missed, pending or upcoming relative to today', () => {
    const habit: Habit = {
      id: 'walk', userId: 'u', name: 'Walk', description: '', color: '#6A9BC5', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'interval', everyNDays: 2, startDate: '2026-11-01' }, isArchived: false, archivedFrom: null,
      isDeleting: false, settingsVersion: 1, createdAt: timestamp, updatedAt: timestamp,
    }
    const settings: HabitSettings[] = [{
      id: '1', userId: 'u', habitId: 'walk', type: 'boolean', targetPerDay: 1, schedule: habit.schedule,
      isArchived: false, effectiveFrom: '2026-11-01', version: 1, createdAt: timestamp,
    }]
    const logs: HabitLog[] = [{
      id: '2026-11-01', userId: 'u', habitId: 'walk', value: 1, date: '2026-11-01', settingsVersion: 1, completedAt: timestamp,
    }]
    const days = buildCalendarDays([habit], settings, logs, [], '2026-11-01', '2026-11-07', '2026-11-05')
    const statuses = Object.fromEntries(days.flatMap((day) => day.events.map((event) => [day.date, event.kind === 'habit' ? event.status : null])))
    expect(statuses).toEqual({ '2026-11-01': 'completed', '2026-11-03': 'missed', '2026-11-05': 'pending', '2026-11-07': 'upcoming' })
  })

  it('follows a changed interval from its effective date and hides habits being deleted', () => {
    const habit: Habit = {
      id: 'gym', userId: 'u', name: 'Gym', description: '', color: '#6A9BC5', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'interval', everyNDays: 3, startDate: '2026-11-06' }, isArchived: false, archivedFrom: null,
      isDeleting: false, settingsVersion: 2, createdAt: timestamp, updatedAt: timestamp,
    }
    const settings: HabitSettings[] = [
      { id: '1', userId: 'u', habitId: 'gym', type: 'boolean', targetPerDay: 1, schedule: { type: 'daily' }, isArchived: false, effectiveFrom: '2026-11-01', version: 1, createdAt: timestamp },
      { id: '2', userId: 'u', habitId: 'gym', type: 'boolean', targetPerDay: 1, schedule: habit.schedule, isArchived: false, effectiveFrom: '2026-11-06', version: 2, createdAt: timestamp },
    ]
    const due = buildCalendarDays([habit], settings, [], [], '2026-11-04', '2026-11-12', '2026-11-05')
      .filter((day) => day.events.length > 0).map((day) => day.date)
    expect(due).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-12'])
    expect(buildCalendarDays([{ ...habit, isDeleting: true }], settings, [], [], '2026-11-04', '2026-11-12')
      .every((day) => day.events.length === 0)).toBe(true)
  })
})
