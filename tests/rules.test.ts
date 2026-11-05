import { readFile } from 'node:fs/promises'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

const projectId = 'demo-dayflow-rules'
const mocks = vi.hoisted(() => ({ getFirebaseServices: vi.fn() }))
vi.mock('../src/backend/config/firebase', () => ({ getFirebaseServices: mocks.getFirebaseServices }))

import { createHabitLogRecord, deleteHabitRecord, readHabit } from '../src/backend/repositories/habit.repository'
import { deleteTaskRecord, updateTaskRecord } from '../src/backend/repositories/task.repository'
import { readUserProfile } from '../src/backend/repositories/user.repository'

let testEnvironment: RulesTestEnvironment

function utcDateAfter(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  })
})

afterEach(async () => testEnvironment.clearFirestore())
afterAll(async () => testEnvironment.cleanup())

async function seedOwnHabit() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'users/u1'), {
      uid: 'u1', email: 'u1@example.com', displayName: 'User', timezone: 'UTC',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    await setDoc(doc(db, 'users/u1/habits/h1'), {
      id: 'h1', userId: 'u1', name: 'Read', description: '', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'daily' }, isArchived: false, archivedFrom: null, isDeleting: false, settingsVersion: 1,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    await setDoc(doc(db, 'users/u1/habits/h1/settingsHistory/1'), {
      id: '1', userId: 'u1', habitId: 'h1', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'daily' }, isArchived: false, effectiveFrom: '2026-11-01', version: 1,
      createdAt: serverTimestamp(),
    })
    await setDoc(doc(db, 'users/u1/habits/hweek'), {
      id: 'hweek', userId: 'u1', name: 'Monday only', description: '', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'weekdays', days: [1] }, isArchived: false, archivedFrom: null, isDeleting: false, settingsVersion: 1,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    await setDoc(doc(db, 'users/u1/habits/hweek/settingsHistory/1'), {
      id: '1', userId: 'u1', habitId: 'hweek', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'weekdays', days: [1] }, isArchived: false, effectiveFrom: '2026-11-01', version: 1,
      createdAt: serverTimestamp(),
    })
    await setDoc(doc(db, 'users/u1/habits/hinterval'), {
      id: 'hinterval', userId: 'u1', name: 'Every three days', description: '', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'interval', everyNDays: 3, startDate: '2026-11-02' }, isArchived: false,
      archivedFrom: null, isDeleting: false, settingsVersion: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    await setDoc(doc(db, 'users/u1/habits/hinterval/settingsHistory/1'), {
      id: '1', userId: 'u1', habitId: 'hinterval', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'interval', everyNDays: 3, startDate: '2026-11-02' }, isArchived: false,
      effectiveFrom: '2026-11-01', version: 1, createdAt: serverTimestamp(),
    })
    await setDoc(doc(db, 'users/u1/habits/hcount'), {
      id: 'hcount', userId: 'u1', name: 'Water', description: '', type: 'count', targetPerDay: 8,
      schedule: { type: 'daily' }, isArchived: false, archivedFrom: null, isDeleting: false, settingsVersion: 1,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    await setDoc(doc(db, 'users/u1/habits/hcount/settingsHistory/1'), {
      id: '1', userId: 'u1', habitId: 'hcount', type: 'count', targetPerDay: 8,
      schedule: { type: 'daily' }, isArchived: false, effectiveFrom: '2026-11-01', version: 1,
      createdAt: serverTimestamp(),
    })
  })
}

async function seedOwnTask() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'users/u1'), {
      uid: 'u1', email: 'u1@example.com', displayName: 'User', timezone: 'UTC',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    await setDoc(doc(db, 'users/u1/tasks/t1'), {
      id: 't1', userId: 'u1', title: 'Task', description: '', status: 'todo', priority: 'medium',
      dueDate: null, completedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), statusVersion: 1, isDeleting: false,
    })
    await setDoc(doc(db, 'users/u1/tasks/t1/statusHistory/1'), {
      id: '1', userId: 'u1', taskId: 't1', status: 'todo', date: '2026-11-05', version: 1, changedAt: serverTimestamp(),
    })
  })
}

describe('Firestore security rules', () => {
  it('limits profile and habit reads to the signed-in owner', async () => {
    await seedOwnHabit()
    const owner = testEnvironment.authenticatedContext('u1').firestore()
    const stranger = testEnvironment.authenticatedContext('u2').firestore()
    await assertSucceeds(getDoc(doc(owner, 'users/u1/habits/h1')))
    await assertFails(getDoc(doc(stranger, 'users/u1/habits/h1')))
    await assertFails(getDoc(doc(owner, 'users/u2')))
  })

  it('allows a unique boolean log and rejects a second write to that date', async () => {
    await seedOwnHabit()
    const db = testEnvironment.authenticatedContext('u1').firestore()
    const log = doc(db, 'users/u1/habits/h1/logs/2026-11-05')
    const data = { id: '2026-11-05', userId: 'u1', habitId: 'h1', value: 1, date: '2026-11-05', settingsVersion: 1, completedAt: serverTimestamp() }
    await assertSucceeds(setDoc(log, data))
    await assertFails(setDoc(log, data))
  })

  it('allows only one of two concurrent boolean completions and preserves concurrent count increments', async () => {
    await seedOwnHabit()
    const db = testEnvironment.authenticatedContext('u1').firestore()
    const booleanRef = doc(db, 'users/u1/habits/h1/logs/2026-11-05')
    const booleanValue = { id: '2026-11-05', userId: 'u1', habitId: 'h1', value: 1, date: '2026-11-05', settingsVersion: 1, completedAt: serverTimestamp() }
    const duplicateAttempts = await Promise.allSettled([setDoc(booleanRef, booleanValue), setDoc(booleanRef, booleanValue)])
    expect(duplicateAttempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    expect(duplicateAttempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1)

    const countCollection = collection(db, 'users/u1/habits/hcount/logs')
    const increments = [
      setDoc(doc(countCollection, 'increment-a'), { id: 'increment-a', userId: 'u1', habitId: 'hcount', value: 3, date: '2026-11-05', settingsVersion: 1, completedAt: serverTimestamp() }),
      setDoc(doc(countCollection, 'increment-b'), { id: 'increment-b', userId: 'u1', habitId: 'hcount', value: 5, date: '2026-11-05', settingsVersion: 1, completedAt: serverTimestamp() }),
    ]
    await Promise.all(increments.map((operation) => assertSucceeds(operation)))
    const written = await getDocs(countCollection)
    expect(written.docs.reduce((sum, item) => sum + Number(item.data().value), 0)).toBe(8)
  })

  it('authorizes collection-group log reads only when the query is scoped to the caller', async () => {
    await seedOwnHabit()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'users/u1/habits/h1/logs/2026-11-05'), {
        id: '2026-11-05', userId: 'u1', habitId: 'h1', value: 1, date: '2026-11-05', settingsVersion: 1, completedAt: serverTimestamp(),
      })
      await setDoc(doc(db, 'users/u2/habits/h2/logs/2026-11-05'), {
        id: '2026-11-05', userId: 'u2', habitId: 'h2', value: 1, date: '2026-11-05', settingsVersion: 1, completedAt: serverTimestamp(),
      })
    })
    const db = testEnvironment.authenticatedContext('u1').firestore()
    const ownLogs = query(collectionGroup(db, 'logs'), where('userId', '==', 'u1'))
    expect((await assertSucceeds(getDocs(ownLogs))).size).toBe(1)
    await assertFails(getDocs(collectionGroup(db, 'logs')))
  })

  it('rejects invalid log values and changes to protected profile fields', async () => {
    await seedOwnHabit()
    const db = testEnvironment.authenticatedContext('u1').firestore()
    await assertFails(setDoc(doc(db, 'users/u1/habits/h1/logs/invalid'), {
      id: 'invalid', userId: 'u1', habitId: 'h1', value: -2, date: '2026-11-05', settingsVersion: 1, completedAt: serverTimestamp(),
    }))
    await assertFails(updateDoc(doc(db, 'users/u1'), { uid: 'u2', updatedAt: serverTimestamp() }))
  })

  it('rejects unsupported profile timezones and repairs a legacy invalid timezone', async () => {
    await seedOwnHabit()
    const owner = testEnvironment.authenticatedContext('u1').firestore()
    await assertFails(updateDoc(doc(owner, 'users/u1'), { timezone: 'Mars/Olympus', updatedAt: serverTimestamp() }))
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users/u1'), { timezone: 'Legacy/Invalid' })
    })
    mocks.getFirebaseServices.mockReturnValue({ db: owner })
    const profile = await readUserProfile('u1')
    expect(profile?.timezone).toBe('UTC')
    expect((await getDoc(doc(owner, 'users/u1'))).data()?.timezone).toBe('UTC')
  })

  it('does not allow independent status-history deletion or writes while a task is deleting', async () => {
    await seedOwnTask()
    const db = testEnvironment.authenticatedContext('u1').firestore()
    await assertFails(deleteDoc(doc(db, 'users/u1/tasks/t1/statusHistory/1')))
    await updateDoc(doc(db, 'users/u1/tasks/t1'), { isDeleting: true, updatedAt: serverTimestamp() })
    await assertFails(updateDoc(doc(db, 'users/u1/tasks/t1'), {
      status: 'completed', statusVersion: 2, completedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(db, 'users/u1/tasks/t1/statusHistory/2'), {
      id: '2', userId: 'u1', taskId: 't1', status: 'completed', date: '2026-11-05', version: 2, changedAt: serverTimestamp(),
    }))
  })

  it('serializes task deletion against concurrent status changes and removes all status history', async () => {
    await seedOwnTask()
    const db = testEnvironment.authenticatedContext('u1').firestore()
    mocks.getFirebaseServices.mockReturnValue({ db })
    const outcomes = await Promise.allSettled([
      updateTaskRecord('u1', 't1', { status: 'completed', localDate: '2026-11-05' }),
      deleteTaskRecord('u1', 't1'),
    ])
    expect(outcomes[1].status).toBe('fulfilled')
    expect((await getDoc(doc(db, 'users/u1/tasks/t1'))).exists()).toBe(false)
    expect((await getDocs(collection(db, 'users/u1/tasks/t1/statusHistory'))).empty).toBe(true)
  })

  it('deletes large task histories in bounded batches below Firestore write limits', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'users/u1'), {
        uid: 'u1', email: 'u1@example.com', displayName: 'User', timezone: 'UTC',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      await setDoc(doc(db, 'users/u1/tasks/tlarge'), {
        id: 'tlarge', userId: 'u1', title: 'Large history', description: '', status: 'todo', priority: 'medium',
        dueDate: null, completedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), statusVersion: 401, isDeleting: false,
      })
      const batch = writeBatch(db)
      for (let version = 1; version <= 401; version += 1) {
        batch.set(doc(db, `users/u1/tasks/tlarge/statusHistory/${version}`), {
          id: String(version), userId: 'u1', taskId: 'tlarge', status: 'todo', date: '2026-11-05', version, changedAt: serverTimestamp(),
        })
      }
      await batch.commit()
    })
    const db = testEnvironment.authenticatedContext('u1').firestore()
    mocks.getFirebaseServices.mockReturnValue({ db })
    await deleteTaskRecord('u1', 'tlarge')
    expect((await getDoc(doc(db, 'users/u1/tasks/tlarge'))).exists()).toBe(false)
    expect((await getDocs(collection(db, 'users/u1/tasks/tlarge/statusHistory'))).empty).toBe(true)
  })

  it('rejects logs for unscheduled, archived, or impossible calendar dates', async () => {
    await seedOwnHabit()
    const db = testEnvironment.authenticatedContext('u1').firestore()
    await assertFails(setDoc(doc(db, 'users/u1/habits/hweek/logs/2026-11-05'), {
      id: '2026-11-05', userId: 'u1', habitId: 'hweek', value: 1, date: '2026-11-05', settingsVersion: 1, completedAt: serverTimestamp(),
    }))
    await assertSucceeds(setDoc(doc(db, 'users/u1/habits/hinterval/logs/2026-11-05'), {
      id: '2026-11-05', userId: 'u1', habitId: 'hinterval', value: 1, date: '2026-11-05', settingsVersion: 1, completedAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(db, 'users/u1/habits/hinterval/logs/2026-11-06'), {
      id: '2026-11-06', userId: 'u1', habitId: 'hinterval', value: 1, date: '2026-11-06', settingsVersion: 1, completedAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(db, 'users/u1/habits/h1/logs/2026-02-31'), {
      id: '2026-02-31', userId: 'u1', habitId: 'h1', value: 1, date: '2026-02-31', settingsVersion: 1, completedAt: serverTimestamp(),
    }))

    const effectiveFrom = utcDateAfter(1)
    const archiveBatch = writeBatch(db)
    archiveBatch.update(doc(db, 'users/u1/habits/h1'), {
      isArchived: true, archivedFrom: effectiveFrom, settingsVersion: 2, updatedAt: serverTimestamp(),
    })
    archiveBatch.set(doc(db, 'users/u1/habits/h1/settingsHistory/2'), {
      id: '2', userId: 'u1', habitId: 'h1', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'daily' }, isArchived: true, effectiveFrom, version: 2, createdAt: serverTimestamp(),
    })
    await assertSucceeds(archiveBatch.commit())
    await assertFails(setDoc(doc(db, `users/u1/habits/h1/logs/${effectiveFrom}`), {
      id: effectiveFrom, userId: 'u1', habitId: 'h1', value: 1, date: effectiveFrom, settingsVersion: 2, completedAt: serverTimestamp(),
    }))
  })

  it('rejects direct writes with extra schedule fields or duplicate weekdays', async () => {
    await seedOwnHabit()
    const db = testEnvironment.authenticatedContext('u1').firestore()
    const effectiveFrom = utcDateAfter(1)
    for (const schedule of [{ type: 'daily', extra: true }, { type: 'weekdays', days: [1, 1] }]) {
      const batch = writeBatch(db)
      batch.update(doc(db, 'users/u1/habits/h1'), { schedule, settingsVersion: 2, updatedAt: serverTimestamp() })
      batch.set(doc(db, 'users/u1/habits/h1/settingsHistory/2'), {
        id: '2', userId: 'u1', habitId: 'h1', type: 'boolean', targetPerDay: 1,
        schedule, isArchived: false, effectiveFrom, version: 2, createdAt: serverTimestamp(),
      })
      await assertFails(batch.commit())
    }
  })

  it('rejects backdated settings versions and permits only bounded future effective dates', async () => {
    await seedOwnHabit()
    const db = testEnvironment.authenticatedContext('u1').firestore()
    const ref = doc(db, 'users/u1/habits/h1')
    const history = doc(db, 'users/u1/habits/h1/settingsHistory/2')

    const backdated = writeBatch(db)
    backdated.update(ref, { settingsVersion: 2, updatedAt: serverTimestamp() })
    backdated.set(history, {
      id: '2', userId: 'u1', habitId: 'h1', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'daily' }, isArchived: false, effectiveFrom: '2000-01-01', version: 2, createdAt: serverTimestamp(),
    })
    await assertFails(backdated.commit())

    const future = utcDateAfter(1)
    const validUpdate = writeBatch(db)
    validUpdate.update(ref, { settingsVersion: 2, updatedAt: serverTimestamp() })
    validUpdate.set(history, {
      id: '2', userId: 'u1', habitId: 'h1', type: 'boolean', targetPerDay: 1,
      schedule: { type: 'daily' }, isArchived: false, effectiveFrom: future, version: 2, createdAt: serverTimestamp(),
    })
    await assertSucceeds(validUpdate.commit())

    await assertFails(setDoc(doc(db, `users/u1/habits/h1/logs/${future}`), {
      id: future, userId: 'u1', habitId: 'h1', value: 1, date: future, settingsVersion: 1, completedAt: serverTimestamp(),
    }))
  })

  it('serializes log creation against habit deletion and leaves no orphan log', async () => {
    await seedOwnHabit()
    const db = testEnvironment.authenticatedContext('u1').firestore()
    mocks.getFirebaseServices.mockReturnValue({ db })
    const habit = await readHabit('u1', 'h1')
    expect(habit).not.toBeNull()
    const logRef = doc(db, 'users/u1/habits/h1/logs/2026-11-05')

    await Promise.allSettled([
      createHabitLogRecord('u1', habit!, 1, '2026-11-05'),
      deleteHabitRecord('u1', 'h1'),
    ])

    expect((await getDoc(doc(db, 'users/u1/habits/h1'))).exists()).toBe(false)
    expect((await getDoc(logRef)).exists()).toBe(false)
  })

  it('requires task status history to be written atomically with a status change', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'users/u1/tasks/t1'), {
        id: 't1', userId: 'u1', title: 'Task', description: '', status: 'todo', priority: 'medium',
        dueDate: null, completedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), statusVersion: 1,
      })
      await setDoc(doc(db, 'users/u1/tasks/t1/statusHistory/1'), {
        id: '1', userId: 'u1', taskId: 't1', status: 'todo', date: '2026-11-05', version: 1, changedAt: serverTimestamp(),
      })
    })
    const db = testEnvironment.authenticatedContext('u1').firestore()
    await assertFails(updateDoc(doc(db, 'users/u1/tasks/t1'), {
      status: 'completed', completedAt: serverTimestamp(), updatedAt: serverTimestamp(), statusVersion: 2,
    }))
    const batch = writeBatch(db)
    batch.update(doc(db, 'users/u1/tasks/t1'), {
      status: 'completed', completedAt: serverTimestamp(), updatedAt: serverTimestamp(), statusVersion: 2,
    })
    batch.set(doc(db, 'users/u1/tasks/t1/statusHistory/2'), {
      id: '2', userId: 'u1', taskId: 't1', status: 'completed', date: '2026-11-05', version: 2, changedAt: serverTimestamp(),
    })
    await assertSucceeds(batch.commit())
  })

  it('rejects direct creation of task history with a forged historical date', async () => {
    const db = testEnvironment.authenticatedContext('u1').firestore()
    const batch = writeBatch(db)
    batch.set(doc(db, 'users/u1/tasks/told'), {
      id: 'told', userId: 'u1', title: 'Task', description: '', status: 'todo', priority: 'medium',
      dueDate: null, completedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), statusVersion: 1, isDeleting: false,
    })
    batch.set(doc(db, 'users/u1/tasks/told/statusHistory/1'), {
      id: '1', userId: 'u1', taskId: 'told', status: 'todo', date: '2000-01-01', version: 1, changedAt: serverTimestamp(),
    })
    await assertFails(batch.commit())
  })
})
