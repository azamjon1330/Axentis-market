import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { savePushToken } from '../api';

let lastRegisteredPhone: string | null = null;

/**
 * Registers the device's Expo push token against the given user phone so the
 * backend can deliver admin/company push notifications. Safe to call repeatedly —
 * it skips work if the same phone was already registered this session, and never
 * throws (push is best-effort).
 */
export async function registerPushToken(phone: string): Promise<void> {
  if (!phone || lastRegisteredPhone === phone) return;
  try {
    // Android needs an explicit channel named "default" (the backend FCM payload
    // targets channelId "default").
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Уведомления',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const settings = await Notifications.getPermissionsAsync();
    let granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse.data;
    if (!token) return;

    await savePushToken(phone, token);
    lastRegisteredPhone = phone;
  } catch {
    // Best-effort: ignore (e.g. simulator, no Google Play services, offline).
  }
}

export function resetPushRegistration(): void {
  lastRegisteredPhone = null;
}
