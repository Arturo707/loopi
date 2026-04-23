import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export default function useBiometricAuth() {
  const authenticate = async () => {
    if (Platform.OS === 'web') {
      return { success: true };
    }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      return { success: true };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Verify your identity to link your bank account',
      fallbackLabel: 'Use Passcode',
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
    });

    if (result.success) {
      return { success: true };
    }

    const cancelled = result.error === 'user_cancel' || result.error === 'system_cancel';
    return {
      success: false,
      error: cancelled
        ? 'Authentication cancelled.'
        : 'Could not verify your identity. Please try again.',
    };
  };

  return { authenticate };
}
