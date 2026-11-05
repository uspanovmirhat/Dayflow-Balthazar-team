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
  type Transaction,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getFirebaseServices } from '../config/firebase'
import type { Habit, HabitLog, HabitSchedule, HabitSettings, HabitType, LocalDate } from '../types'
import { BackendError } from '../utils/errors'
import { parseHabit, parseHabitLog, parseHabitSettings } from '../schemas/habit.schema'
import { isScheduledDate } from '../utils/schedules'
export function habitsRef(uid: string) {
  return collection(getFirebaseServices().db, 'users', uid, 'habits')
}

export function habitRef(uid: string, habitId: string) {
  return doc(getFirebaseServices().db, 'users', uid, 'habits', habitId)
}

export function logsRef(uid: string, habitId: string) {
  return collection(habitRef(uid, habitId), 'logs')
}

export function settingsRef(uid: string, habitId: string) {
  return collection(habitRef(uid, habitId), 'settingsHistory')
}

export async function createHabitRecord(uid: string, input: {
  name: string
  description: string
  type: HabitType
  targetPerDay: number
  schedule: HabitSchedule
  effectiveFrom: LocalDate
}): Promise<Habit> {
  const db = getFirebaseServices().db
  const habit = doc(habitsRef(uid))
  const history = doc(settingsRef(uid, habit.id), '1')
  await runTransaction(db, async (transaction) => {
    transaction.set(habit, {
      id: habit.id, userId: uid, name: input.name, description: input.description,
      type: input.type, targetPerDay: input.targetPerDay, schedule: input.schedule,
      isArchived: false, archivedFrom: null, isDeleting: false, settingsVersion: 1,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    transaction.set(history, {
      id: history.id, userId: uid, habitId: habit.id, type: input.type,
      targetPerDay: input.targetPerDay, schedule: input.schedule, isArchived: false,
      effectiveFrom: input.effectiveFrom, version: 1, createdAt: serverTimestamp(),
    })
  })
  const snapshot = await getDoc(habit)
  if (!snapshot.exists()) throw new BackendError('internal', 'Created habit could not be read back.')
  return parseHabit(snapshot.data(), uid, habit.id)
}

export async function readHabit(uid: string, habitId: string): Promise<Habit | null> {
  const snapshot = await getDoc(habitRef(uid, habitId))
  return snapshot.exists() ? parseHabit(snapshot.data(), uid, snapshot.id) : null
}

export async function readHabits(uid: string): Promise<Habit[]> {
  const snapshot = await getDocs(habitsRef(uid))
  return snapshot.docs.map((item) => parseHabit(item.data(), uid, item.id))
}

export async function updateHabitSettings(uid: string, habitId: string, settings: {
  name: string
  description: string
  type: HabitType
  targetPerDay: number
  schedule: HabitSchedule
  effectiveFrom: LocalDate
}): Promise<Habit> {
  const db = getFirebaseServices().db
  const ref = habitRef(uid, habitId)
  let nextVersion = 0
  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(ref)
    if (!current.exists()) throw new BackendError('not-found', 'Habit was not found.')
    if (current.data().isDeleting === true) throw new BackendError('failed-precondition', 'A habit being deleted cannot be updated.')
    nextVersion = Number(current.data().settingsVersion ?? 1) + 1
    transaction.update(ref, {
      name: settings.name,
      description: settings.description,
      type: settings.type,
      targetPerDay: settings.targetPerDay,
      schedule: settings.schedule,
      settingsVersion: nextVersion,
      updatedAt: serverTimestamp(),
    })
    const history = doc(settingsRef(uid, habitId), String(nextVersion))
    transaction.set(history, {
      id: history.id, userId: uid, habitId, type: settings.type,
      targetPerDay: settings.targetPerDay, schedule: settings.schedule,
      isArchived: Boolean(current.data().isArchived), effectiveFrom: settings.effectiveFrom,
      version: nextVersion, createdAt: serverTimestamp(),
    })
  })
  const habit = await readHabit(uid, habitId)
  if (!habit) throw new BackendError('not-found', 'Habit was not found after update.')
  return habit
}

export async function setHabitArchived(uid: string, habitId: string, archived: boolean, effectiveFrom: LocalDate): Promise<Habit> {
  const db = getFirebaseServices().db
  const ref = habitRef(uid, habitId)
  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(ref)
    if (!current.exists()) throw new BackendError('not-found', 'Habit was not found.')
    const data = current.data()
    if (data.isDeleting === true) throw new BackendError('failed-precondition', 'A habit being deleted cannot be updated.')
    const version = Number(data.settingsVersion ?? 1) + 1
    transaction.update(ref, {
      isArchived: archived,
      archivedFrom: archived ? effectiveFrom : null,
      settingsVersion: version,
      updatedAt: serverTimestamp(),
    })
    const history = doc(settingsRef(uid, habitId), String(version))
    transaction.set(history, {
      id: history.id, userId: uid, habitId, type: data.type,
      targetPerDay: data.targetPerDay, schedule: data.schedule,
      isArchived: archived, effectiveFrom, version, createdAt: serverTimestamp(),
    })
  })
  const habit = await readHabit(uid, habitId)
  if (!habit) throw new BackendError('not-found', 'Habit was not found after archive update.')
  return habit
}

export async function readHabitSettingsHistory(uid: string, throughDate?: LocalDate): Promise<HabitSettings[]> {
  const filters = [where('userId', '==', uid)]
  if (throughDate) filters.push(where('effectiveFrom', '<=', throughDate))
  const snapshot = await getDocs(query(
    collectionGroup(getFirebaseServices().db, 'settingsHistory'),
    ...filters,
  ))
  return snapshot.docs.map((item) => {
    const habitId = item.ref.parent.parent?.id
    if (!habitId) throw new BackendError('failed-precondition', 'Habit settings are outside the expected path.')
    return parseHabitSettings(item.data(), uid, habitId, item.id)
  })
}

export async function readLogsByRange(uid: string, startDate: LocalDate, endDate: LocalDate): Promise<HabitLog[]> {
  const snapshot = await getDocs(query(
    collectionGroup(getFirebaseServices().db, 'logs'),
    where('userId', '==', uid),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
  ))
  return snapshot.docs.map((item) => {
    const habitId = item.ref.parent.parent?.id
    if (!habitId) throw new BackendError('failed-precondition', 'Habit log is outside the expected path.')
    return parseHabitLog(item.data(), uid, habitId, item.id)
  })
}

export async function readHabitLog(uid: string, habitId: string, logId: string): Promise<HabitLog | null> {
  const snapshot = await getDoc(doc(logsRef(uid, habitId), logId))
  return snapshot.exists() ? parseHabitLog(snapshot.data(), uid, habitId, snapshot.id) : null
}

export async function createHabitLogRecord(uid: string, habit: Habit, value: number, date: LocalDate): Promise<HabitLog> {
  const db = getFirebaseServices().db
  const log = habit.type === 'boolean' ? doc(logsRef(uid, habit.id), date) : doc(logsRef(uid, habit.id))
  const settingsVersion = habit.settingsVersion
  const data = { id: log.id, userId: uid, habitId: habit.id, value, date, settingsVersion, completedAt: serverTimestamp() }
  const verifyWriteIsAllowed = async (transaction: Transaction) => {
    const parent = await transaction.get(habitRef(uid, habit.id))
    if (!parent.exists()) throw new BackendError('not-found', 'Habit was not found.')
    const parentData = parent.data()
    if (parentData.isDeleting === true) throw new BackendError('failed-precondition', 'A habit being deleted cannot receive new logs.')
    const currentVersion = Number(parentData.settingsVersion)
    if (!Number.isInteger(settingsVersion) || settingsVersion < 1 || settingsVersion > currentVersion) {
      throw new BackendError('failed-precondition', 'Habit settings changed before the log could be saved.')
    }

    const selectedRef = doc(settingsRef(uid, habit.id), String(settingsVersion))
    const selectedSnapshot = await transaction.get(selectedRef)
    if (!selectedSnapshot.exists()) throw new BackendError('failed-precondition', 'Habit settings for the selected date were not found.')
    const selected = parseHabitSettings(selectedSnapshot.data(), uid, habit.id, String(settingsVersion))
    if (selected.effectiveFrom > date || selected.isArchived || selected.type !== habit.type || !isScheduledDate(selected.schedule, date)) {
      throw new BackendError('failed-precondition', 'The habit is archived or not scheduled for the selected date.')
    }

    if (settingsVersion < currentVersion) {
      const nextSnapshot = await transaction.get(doc(settingsRef(uid, habit.id), String(settingsVersion + 1)))
      if (nextSnapshot.exists()) {
        const next = parseHabitSettings(nextSnapshot.data(), uid, habit.id, String(settingsVersion + 1))
        if (next.effectiveFrom <= date) throw new BackendError('failed-precondition', 'Habit settings changed before the selected date.')
      }
    }
  }

  if (habit.type === 'boolean') {
    await runTransaction(db, async (transaction) => {
      await verifyWriteIsAllowed(transaction)
      const existing = await transaction.get(log)
      if (existing.exists()) throw new BackendError('already-exists', 'This habit is already completed for the selected date.')
      transaction.set(log, data)
    })
  } else {
    await runTransaction(db, async (transaction) => {
      await verifyWriteIsAllowed(transaction)
      transaction.set(log, data)
    })
  }
  const snapshot = await getDoc(log)
  if (!snapshot.exists()) throw new BackendError('internal', 'Created habit log could not be read back.')
  return parseHabitLog(snapshot.data(), uid, habit.id, log.id)
}

export async function deleteHabitLogRecord(uid: string, habitId: string, logId: string): Promise<void> {
  await deleteDoc(doc(logsRef(uid, habitId), logId))
}

export async function deleteHabitRecord(uid: string, habitId: string): Promise<void> {
  const db = getFirebaseServices().db
  const parentRef = habitRef(uid, habitId)
  await runTransaction(db, async (transaction) => {
    const parent = await transaction.get(parentRef)
    if (!parent.exists()) throw new BackendError('not-found', 'Habit was not found.')
    if (parent.data().isDeleting !== true) {
      transaction.update(parentRef, { isDeleting: true, updatedAt: serverTimestamp() })
    }
  })

  const subcollections = [logsRef(uid, habitId), settingsRef(uid, habitId)]
  for (const subcollection of subcollections) {
    while (true) {
      const page = await getDocs(subcollection)
      if (page.empty) break
      const batch = writeBatch(db)
      page.docs.slice(0, 400).forEach((item) => batch.delete(item.ref))
      await batch.commit()
    }
  }
  await deleteDoc(parentRef)
}
