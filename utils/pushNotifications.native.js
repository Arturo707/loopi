// Native push notifications via expo-notifications.
// Requires EAS rebuild (native module).

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { authFetch } from './authFetch';

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');

// Foreground display behaviour — show banner + sound even while app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  try {
    if (!Device.isDevice) {
      console.log('[push] Skipping — not a real device');
      return null;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[push] Permission denied');
      return null;
    }

    // Android channel is required for high-priority alerts
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('loopi-alerts', {
        name: 'Loopi score alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F26A28',
      });
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResp.data;
    console.log('[push] Expo token:', token?.slice(0, 20) + '…');

    // Register with backend (stored in Firestore push_tokens/{uid})
    try {
      await authFetch(`${API_BASE}/api/register-push-token`, {
        method: 'POST',
        body: JSON.stringify({ token, platform: Platform.OS }),
      });
    } catch (err) {
      console.warn('[push] Failed to register token with server:', err.message);
    }

    return token;
  } catch (err) {
    console.warn('[push] Setup failed:', err.message);
    return null;
  }
}

// Attach listeners — returns cleanup fn. `onOpen({ticker})` fires when user
// taps a notification (cold-start + warm-start).
export function attachNotificationListeners(onOpen) {
  const receivedSub = Notifications.addNotificationReceivedListener((n) => {
    console.log('[push] received:', n.request?.content?.title);
  });
  const responseSub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp?.notification?.request?.content?.data;
    if (data?.ticker && typeof onOpen === 'function') onOpen(data);
  });
  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}
