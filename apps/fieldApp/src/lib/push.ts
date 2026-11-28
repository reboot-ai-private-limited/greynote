import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

import { ApiError, apiDelete, apiPut } from './api';
import { getDeviceInfo } from './device';
import { markInboxRead, nudgeInbox } from './inbox';
import { storage } from './storage';
import { syncNow } from '@/offline/engine';

/**
 * Push notifications through Firebase (docs/mobile/notifications.md). The server sends to the phone's own FCM token; every push
 * is also an Inbox message, so a missed push loses nothing and the phone never trusts a push for state: it only refreshes the
 * Inbox count and, on a tap, opens the screen the server named. Android hands out the FCM token itself; on iOS the device token
 * is an APNs token that FCM rejects, so the Firebase SDK exchanges it for an FCM token (the APNs key is uploaded to Firebase).
 * Remote push does not work in Expo Go: it needs a development build, and there registering simply does nothing.
 */

type NotificationsModule = typeof import('expo-notifications');
export type PushResponse = import('expo-notifications').NotificationResponse;

let loaded: NotificationsModule | null | undefined;

/**
 * The expo-notifications module, or null where it cannot run: Expo Go has no native push module (importing it there crashes the
 * app), and the web has no push. Everything below does nothing when this is null, so Expo Go keeps working for everything else.
 */
export function notifications(): NotificationsModule | null {
  if (loaded !== undefined) return loaded;
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    loaded = null;
    return loaded;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-notifications') as NotificationsModule;
  } catch {
    loaded = null;
  }
  return loaded;
}

type FirebaseModule = typeof import('@react-native-firebase/messaging');
type FirebaseMessaging = { fb: FirebaseModule; messaging: ReturnType<FirebaseModule['getMessaging']> };
let firebase: FirebaseMessaging | null | undefined;

/** Firebase Messaging, used on iOS only to get the FCM token. Null where its native module is missing (Expo Go) or off iOS. */
function iosMessaging(): FirebaseMessaging | null {
  if (firebase !== undefined) return firebase;
  if (Platform.OS !== 'ios') {
    firebase = null;
    return firebase;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fb = require('@react-native-firebase/messaging') as FirebaseModule;
    firebase = { fb, messaging: fb.getMessaging() };
  } catch {
    firebase = null;
  }
  return firebase;
}

/** This phone's FCM token: Android's own, or on iOS the one Firebase swaps for the APNs token. Empty when unavailable. */
async function fcmToken(n: NotificationsModule): Promise<string> {
  if (Platform.OS === 'ios') {
    const m = iosMessaging();
    if (!m) throw new Error('Firebase Messaging is not in this build');
    await m.fb.registerDeviceForRemoteMessages(m.messaging);
    return m.fb.getToken(m.messaging);
  }
  const token = await n.getDevicePushTokenAsync();
  return typeof token.data === 'string' ? token.data : '';
}

/** The user switched notifications off in the app: nothing is registered until they switch them on again. */
const OFF_KEY = 'push.off'; // SecureStore keys allow only letters, digits, '.', '-' and '_' ('push:off' threw on every read).

export const isPushOff = async () => (await storage.get(OFF_KEY).catch(() => null)) === '1';

/** Shows a push while the app is open (a banner and an entry in the list). Called once at start. */
export function setUpForegroundPush() {
  notifications()?.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function ensureChannel(n: NotificationsModule) {
  if (Platform.OS !== 'android') return;
  await n.setNotificationChannelAsync('default', {
    name: 'My Greynote',
    importance: n.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
  });
}

/** Asks for permission (Android 13+) if it has not been asked; true when notifications are allowed. */
async function allowed(n: NotificationsModule): Promise<boolean> {
  const current = await n.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await n.requestPermissionsAsync()).granted;
}

async function sendToken(token: string) {
  const { deviceId } = await getDeviceInfo();
  try {
    await apiPut('/identity/auth/push-token', { deviceId, token });
  } catch (err) {
    // 404: no live session for this device yet (login has not finished); the next sign-in registers it. Anything else is retried next start.
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }
}

/**
 * After sign-in: permission, then this phone's FCM token to the server. Safe to call again (each sign-in does; Firebase may also
 * hand out a new token later, which `watchPushToken` sends). Returns false when push is off, refused, or not possible here
 * (a simulator, the web, or Expo Go).
 */
export async function registerForPush(): Promise<boolean> {
  const n = notifications();
  if (!n) return fail('notifications module not loaded');
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return fail(`platform is ${Platform.OS}`);
  if (!Device.isDevice) return fail('not a real device');
  if (await isPushOff()) return fail('switched off in the app');
  let step = 'channel';
  try {
    await ensureChannel(n);
    step = 'permission';
    if (!(await allowed(n))) return fail('permission not granted');
    step = 'firebase token';
    const token = await fcmToken(n);
    if (token === '') return fail('empty token');
    step = 'sending token to server';
    await sendToken(token);
    pushStatus = 'registered';
    return true;
  } catch (err) {
    // Expo Go (no Firebase), no Google services, or the network: push stays off; the Inbox still works.
    return fail(`${step}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Why push is not working, or 'registered'; shown on Profile so a build that stays silent can be diagnosed. */
let pushStatus = 'not tried yet';
export const getPushStatus = () => pushStatus;
function fail(reason: string): false {
  pushStatus = reason;
  return false;
}

/** Firebase gave this phone a new token: send it. Returns the stop function. */
export function watchPushToken(): () => void {
  const n = notifications();
  if (!n) return () => undefined;
  const send = (token: unknown) => {
    if (typeof token === 'string' && token !== '') void isPushOff().then((off) => (off ? undefined : sendToken(token).catch(() => undefined)));
  };
  // On iOS the expo listener reports the APNs token, which FCM cannot use, so Firebase's own refresh event is the one to follow.
  const m = iosMessaging();
  if (m) return m.fb.onTokenRefresh(m.messaging, send);
  if (Platform.OS === 'ios') return () => undefined;
  const sub = n.addPushTokenListener((token) => send(token.data));
  return () => sub.remove();
}

/** The user turns notifications off: the server stops pushing to this phone. */
export async function disablePush() {
  await storage.set(OFF_KEY, '1');
  const { deviceId } = await getDeviceInfo();
  await apiDelete('/identity/auth/push-token', undefined, { deviceId }).catch(() => undefined);
}

export async function enablePush(): Promise<boolean> {
  await storage.set(OFF_KEY, '0');
  return registerForPush();
}

/** The screens the server names in `data.route` (docs/mobile/notifications.md); anything else opens the Inbox. */
const ROUTES: Record<string, Href> = {
  '/plan/daily': '/daily-plan',
  '/plan/monthly': '/monthly-plan',
  '/expenses': '/expenses',
  '/stock': '/secondary-sales',
  '/leave': '/leave',
  '/dcr': '/summary',
  '/secondary': '/secondary-sales',
  '/sample-requests': '/sample-requests',
  '/doctors': '/my-requests',
  '/chemists': '/my-requests',
  '/services': '/services',
  '/team/approvals': '/(tabs)/team',
  '/inbox': '/inbox',
};
export const screenFor = (route: unknown): Href => (typeof route === 'string' ? (ROUTES[route] ?? '/inbox') : '/inbox');

/**
 * A push arrived while the app is open: the unread count is read again, and the phone syncs (2026-11-28), so an approval it announces
 * opens the day at once instead of at the next 15-minute pull.
 */
export function watchPushArrived(): () => void {
  const sub = notifications()?.addNotificationReceivedListener(() => {
    nudgeInbox();
    void syncNow();
  });
  return () => sub?.remove();
}

/** Listens for a tap on a push, and handles the one that started the app from a closed state. Returns the stop function. */
export function watchPushTaps(): () => void {
  const n = notifications();
  if (!n) return () => undefined;
  const sub = n.addNotificationResponseReceivedListener((response) => void openFromPush(response));
  void openFromPush(n.getLastNotificationResponse());
  return () => sub.remove();
}

/** The notification ids already acted on, so a tap is never handled twice (the same response can be handed out again). */
const handled = new Set<string>();

/** The person tapped a push: mark its Inbox message read and open the screen it names. */
async function openFromPush(response: PushResponse | null | undefined) {
  const n = notifications();
  if (!n || !response || response.actionIdentifier !== n.DEFAULT_ACTION_IDENTIFIER) return;
  const id = response.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const messageId = typeof data?.messageId === 'string' ? data.messageId : null;
  if (messageId) await markInboxRead(messageId).catch(() => undefined);
  nudgeInbox();
  void syncNow(); // the screen it opens should show what the push announced
  router.push(screenFor(data?.route));
}
