// Cross-platform dialog helpers.
//
// React Native's Alert.alert is a no-op on react-native-web, which breaks any
// flow that gates navigation inside an Alert callback. Use these helpers instead:
//
//   notify(title, message)       — informational, fire-and-forget
//   confirmAsync(title, message) — returns Promise<boolean>
//
// On web  : delegates to window.alert / window.confirm (always available).
// On native: delegates to Alert.alert with the same semantics.

import { Alert, Platform } from 'react-native';

function joinMessage(title: string, message?: string): string {
  return [title, message].filter(Boolean).join('\n\n');
}

/**
 * Show an informational message to the user.
 * Equivalent to Alert.alert(title, message) but works on web.
 */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(joinMessage(title, message));
  } else {
    Alert.alert(title, message);
  }
}

/**
 * Ask the user to confirm an action.
 * Resolves to `true` if the user confirmed, `false` if they cancelled.
 */
export function confirmAsync(title: string, message?: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(joinMessage(title, message)));
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ]);
  });
}
