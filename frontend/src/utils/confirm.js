import { Alert, Platform } from 'react-native';

/**
 * Asks before a destructive change. Resolves true only if the student confirms.
 * Native shows a system alert; web uses the browser's confirm dialog.
 */
export function confirmAction({ title, message, confirmLabel = 'Delete', destructive = true }) {
  if (Platform.OS === 'web') {
    return Promise.resolve(Boolean(globalThis.confirm?.(`${title}\n\n${message}`)));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
