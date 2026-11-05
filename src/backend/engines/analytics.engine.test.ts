import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { calculateHabitAnalytics, calculateTaskAnalytics, rankHabits } from './analytics.engine'
import type { Habit, HabitLog, HabitSettings, Task } from '../types'

const timestamp = Timestamp.fromDate(new Date('2026-11-01T00:00:00.000Z'))
const habit: Habit = {
  id: 'walk', userId: 'u', name: 'Walk', description: '', type: 'boolean', targetPerDay: 1,
  schedule: { type: 'daily' }, isArchived: false, archivedFrom: null, isDeleting: false, settingsVersion: 1,
  createdAt: timestamp, updatedAt: timestamp,
}
const settings: HabitSettings[] = [{
  id: '1', userId: 'u', habitId: 'walk', type: 'boolean', targetPerDay: 1, schedule: { type: 'daily' },
  isArchived: false, effectiveFrom: '2026-11-02', version: 1, createdAt: timestamp,
}]

describe('analytics engine', () => {
  it('calculates completion rates from due days and ignores pre-creation days', () => {
    const logs: HabitLog[] = [{ id: '2026-11-03', userId: 'u', habitId: 'walk', value: 1, date: '2026-11-03', settingsVersion: 1, completedAt: timestamp }]
    expect(calculateHabitAnalytics([habit], settings, logs, '2026-11-01', '2026-11-04')[0]).toMatchObject({
      scheduledDays: 3, completedDays: 1, completionRate: 33.33,
    })
  })

  it('returns zero completion rate for empty task data and ranks only active habits', () => {
    const empty = calculateTaskAnalytics([], [], '2026-11-05', '2026-11-01', '2026-11-05')
    expect(empty.completionRate).toBe(0)
    expect(rankHabits([{ habitId: 'x', name: 'No days', scheduledDays: 0, completedDays: 0, completionRate: 0, progress: [] }])).toEqual({ best: [], weakest: [] })
  })

  it('counts overdue open tasks and completion events by local date', () => {
    const tasks = [{
      id: 't1', userId: 'u', title: 'Task', description: '', status: 'in_progress', priority: 'high',
      dueDate: '2026-11-04', completedAt: null, createdAt: timestamp, updatedAt: timestamp, statusVersion: 2,
    }] as Task[]
    const result = calculateTaskAnalytics(tasks, [], '2026-11-05', '2026-11-01', '2026-11-05')
    expect(result).toMatchObject({ totalTasks: 1, pendingTasks: 1, overdueTasks: 1, completionRate: 0 })
  })
})
