import { SDK_VERSION } from 'firebase/app'
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseServices } from '../config/firebase'
import type { NotificationDevice } from '../types'
import { BackendError } from '../utils/errors'
import { currentUserId, runBackendOperation } from './shared'

/**
 * Notifications work in two layers:
 *  1. Local: while Dayflow is open (a tab or an installed app, even in the background) the app checks reminders itself
 *     and shows them through the service worker. Free, no setup.
 *  2. Push: the device's FCM token is saved in users/{uid}/devices, and scripts/send-reminders.mjs (GitHub Actions cron)
 *     sends reminders even when Dayflow is closed. Needs VITE_FIREBASE_VAPID_KEY.
 */

const DEVICE_ID_KEY = 'dayflow:device-id'
const PUSH_ENABLED_KEY = 'dayflow:push-enabled'
const SHOWN_CACHE = 'dayflow-shown-notifications'

export type NotificationPermissionState = NotificationPermission | 'unsupported'

export interface NotificationStatus {
  /** Browser can show notifications at all. */
  supported: boolean
  permission: NotificationPermissionState
  /** Web push (closed app) is possible in this browser and a VAPID key is configured. */
  pushAvailable: boolean
  /** This device is registered for push for the current user. */
  pushEnabled: boolean
  /** iOS only shows web notifications for an app added to the Home Screen. */
  needsInstallOnIos: boolean
}

const devicesRef = (uid: string) => collection(getFirebaseServices().db, 'users', uid, 'devices')
const deviceRef = (uid: string, id: string) => doc(getFirebaseServices().db, 'users', uid, 'devices', id)

function browserSupportsNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function vapidKey(): string {
  return String(import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '').trim()
}

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = crypto.randomUUID().replace(/-/g, '')
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | undefined

/** Registers /sw.js once. Resolves null when service workers are unavailable (old browser, http, private mode). */
export function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!registrationPromise) {
    registrationPromise = (async () => {
      if (!('serviceWorker' in navigator)) return null
      try {
        await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(SDK_VERSION)}`, { scope: '/' })
        return await navigator.serviceWorker.ready
      } catch {
        return null
      }
    })()
  }
  return registrationPromise
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  const supported = browserSupportsNotifications()
  const needsInstallOnIos = isIos() && !isStandalone()
  if (!supported) return { supported: false, permission: 'unsupported', pushAvailable: false, pushEnabled: false, needsInstallOnIos }
  const pushAvailable = Boolean(vapidKey()) && await isSupported().catch(() => false)
  return {
    supported,
    permission: Notification.permission,
    pushAvailable,
    pushEnabled: pushAvailable && Notification.permission === 'granted' && localStorage.getItem(PUSH_ENABLED_KEY) === getFirebaseServices().auth.currentUser?.uid,
    needsInstallOnIos,
  }
}

async function saveDeviceToken(registration: ServiceWorkerRegistration) {
  const uid = currentUserId()
  const token = await getToken(getMessaging(getFirebaseServices().app), { vapidKey: vapidKey(), serviceWorkerRegistration: registration })
  if (!token) throw new BackendError('unavailable', 'Не удалось получить токен для push-уведомлений.')
  const id = deviceId()
  const ref = deviceRef(uid, id)
  const existing = await getDoc(ref)
  if (existing.exists() && existing.data().token === token) return
  await setDoc(ref, {
    id,
    userId: uid,
    token,
    userAgent: navigator.userAgent.slice(0, 300),
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  localStorage.setItem(PUSH_ENABLED_KEY, uid)
}

/**
 * Asks for permission (must be called from a click) and enables notifications on this device.
 * Returns whether push for a closed app was enabled too; local notifications work either way once permission is granted.
 */
export function enableNotifications(): Promise<{ push: boolean }> {
  return runBackendOperation(async () => {
    if (!browserSupportsNotifications()) {
      throw new BackendError('failed-precondition', isIos() && !isStandalone()
        ? 'На iPhone уведомления работают только в приложении: нажмите «Поделиться» → «На экран „Домой“» и откройте Dayflow оттуда.'
        : 'Этот браузер не поддерживает уведомления.')
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (permission !== 'granted') {
      throw new BackendError('permission-denied', permission === 'denied'
        ? 'Уведомления запрещены в настройках браузера. Разрешите их для этого сайта (значок слева от адреса) и попробуйте снова.'
        : 'Разрешение на уведомления не получено.')
    }
    const registration = await registerAppServiceWorker()
    if (!registration) throw new BackendError('unavailable', 'Не удалось запустить фоновый обработчик уведомлений.')
    if (!vapidKey() || !await isSupported().catch(() => false)) return { push: false }
    await saveDeviceToken(registration)
    return { push: true }
  })
}

/** Stops push on this device for the current user. Local notifications stop because permission is checked by the app. */
export function disablePushNotifications(): Promise<void> {
  return runBackendOperation(async () => {
    const uid = currentUserId()
    localStorage.removeItem(PUSH_ENABLED_KEY)
    await deleteDoc(deviceRef(uid, deviceId()))
    if (await isSupported().catch(() => false)) await deleteToken(getMessaging(getFirebaseServices().app)).catch(() => undefined)
  })
}

/** Call after sign-in: FCM tokens rotate, so an enabled device re-saves its current token. Never prompts. */
export async function refreshPushRegistration(): Promise<void> {
  const status = await getNotificationStatus().catch(() => null)
  if (!status?.pushEnabled) return
  const registration = await registerAppServiceWorker()
  if (registration) await runBackendOperation(() => saveDeviceToken(registration)).catch(() => undefined)
}

/** Removes this device's token before sign-out so the next account on this browser does not get the previous user's pushes. */
export async function forgetDeviceBeforeLogout(): Promise<void> {
  if (localStorage.getItem(PUSH_ENABLED_KEY) !== getFirebaseServices().auth.currentUser?.uid) return
  await disablePushNotifications().catch(() => undefined)
}

export function getNotificationDevices(): Promise<NotificationDevice[]> {
  return runBackendOperation(async () => (await getDocs(devicesRef(currentUserId()))).docs.map((snapshot) => snapshot.data() as NotificationDevice))
}

/** Marks a reminder occurrence as shown on this device; the service worker skips a push with the same key. */
async function markShown(key: string) {
  if (!('caches' in window)) return
  const cache = await caches.open(SHOWN_CACHE)
  await cache.put(new Request(`/__shown/${encodeURIComponent(key)}`), new Response(String(Date.now())))
}

export async function wasNotificationShown(key: string): Promise<boolean> {
  if (!('caches' in window)) return false
  return Boolean(await (await caches.open(SHOWN_CACHE)).match(new Request(`/__shown/${encodeURIComponent(key)}`)))
}

/** Shows a notification through the service worker (required on Android) with `tag = key`, so repeats replace each other. */
export async function showLocalNotification(key: string, title: string, body: string): Promise<boolean> {
  if (!browserSupportsNotifications() || Notification.permission !== 'granted') return false
  const registration = await registerAppServiceWorker()
  const options: NotificationOptions = { body, tag: key, icon: '/icon-192.png', badge: '/badge-96.png', data: { url: '/?page=reminders', key } }
  if (registration) await registration.showNotification(title, options)
  else new Notification(title, options)
  await markShown(key).catch(() => undefined)
  return true
}
