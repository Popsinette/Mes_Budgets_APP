import { Alert, Platform } from 'react-native';

/**
 * Dialogues multiplateformes : Alert natif sur iOS/Android,
 * window.alert / window.confirm sur le web (où Alert.alert est un no-op).
 */

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAction(options: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}): void {
  if (Platform.OS === 'web') {
    if (window.confirm(`${options.title}\n\n${options.message}`)) {
      options.onConfirm();
    }
    return;
  }
  Alert.alert(options.title, options.message, [
    { text: 'Annuler', style: 'cancel' },
    {
      text: options.confirmLabel,
      style: options.destructive ? 'destructive' : 'default',
      onPress: options.onConfirm,
    },
  ]);
}
