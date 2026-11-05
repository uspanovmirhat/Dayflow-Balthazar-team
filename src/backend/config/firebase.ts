import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { BackendError } from '../utils/errors'

let services: { app: ReturnType<typeof initializeApp>; auth: ReturnType<typeof getAuth>; db: ReturnType<typeof getFirestore> } | undefined

export function getFirebaseServices() {
  if (services) return services
  const env = import.meta.env
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ] as const
  const missing = required.filter((key) => !env[key])
  if (missing.length) {
    throw new BackendError('configuration', `Missing Firebase environment variables: ${missing.join(', ')}.`)
  }

  const app = getApps().length > 0 ? getApp() : initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  })
  const auth = getAuth(app)
  const db = getFirestore(app)

  if (env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    const authHost = env.VITE_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
    const firestoreHost = env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
    const [authHostname, authPort] = authHost.split(':')
    const [firestoreHostname, firestorePort] = firestoreHost.split(':')
    connectAuthEmulator(auth, `http://${authHostname}:${authPort || '9099'}`, { disableWarnings: true })
    connectFirestoreEmulator(db, firestoreHostname || '127.0.0.1', Number(firestorePort || '8080'))
  }

  services = { app, auth, db }
  return services
}
