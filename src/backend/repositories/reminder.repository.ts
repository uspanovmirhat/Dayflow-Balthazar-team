import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { getFirebaseServices } from '../config/firebase'
import type { Reminder, ReminderInput } from '../types'
import { BackendError } from '../utils/errors'
import { parseReminder } from '../schemas/reminder.schema'

const remindersRef = (uid: string) => collection(getFirebaseServices().db, 'users', uid, 'reminders')
const reminderRef = (uid: string, id: string) => doc(getFirebaseServices().db, 'users', uid, 'reminders', id)
export async function readReminders(uid: string): Promise<Reminder[]> { const result = await getDocs(remindersRef(uid)); return result.docs.map((snapshot) => parseReminder(snapshot.data(), uid, snapshot.id)) }
export async function createReminderRecord(uid: string, input: ReminderInput): Promise<Reminder> {
  const ref = doc(remindersRef(uid)); await setDoc(ref, { id: ref.id, userId: uid, title: input.title, description: input.description ?? '', time: input.time, schedule: input.schedule, link: input.link ?? null, enabled: input.enabled ?? true, completedAt: null, snoozedUntil: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  const snapshot = await getDoc(ref); if (!snapshot.exists()) throw new BackendError('internal', 'Созданное напоминание не удалось прочитать.')
  return parseReminder(snapshot.data(), uid, ref.id)
}
export async function updateReminderRecord(uid: string, id: string, changes: Partial<ReminderInput> & { completedAt?: Date | null; snoozedUntil?: Date | null }): Promise<Reminder> {
  await updateDoc(reminderRef(uid, id), { ...changes, updatedAt: serverTimestamp() }); const snapshot = await getDoc(reminderRef(uid, id)); if (!snapshot.exists()) throw new BackendError('not-found'); return parseReminder(snapshot.data(), uid, id)
}
export async function deleteReminderRecord(uid: string, id: string) { await deleteDoc(reminderRef(uid, id)) }
