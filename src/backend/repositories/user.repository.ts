import { doc, getDoc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import type { UserProfile } from '../types'
import { getFirebaseServices } from '../config/firebase'
import { parseUserProfile } from '../schemas/user.schema'

export function userRef(uid: string) {
  return doc(getFirebaseServices().db, 'users', uid)
}

export async function readUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(userRef(uid))
  return snapshot.exists() ? parseUserProfile(snapshot.data(), uid) : null
}

export async function createProfileIfMissing(user: User, timezone: string): Promise<UserProfile> {
  const ref = userRef(user.uid)
  await runTransaction(getFirebaseServices().db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.exists()) return
    transaction.set(ref, {
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      timezone,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  const profile = await readUserProfile(user.uid)
  if (!profile) throw new Error('Profile transaction completed without creating a profile.')
  return profile
}

export async function updateUserProfile(uid: string, fields: Partial<Pick<UserProfile, 'displayName' | 'timezone' | 'email'>>): Promise<void> {
  await updateDoc(userRef(uid), { ...fields, updatedAt: serverTimestamp() })
}
