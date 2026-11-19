import { Alert as NativeAlert, Platform } from 'react-native';

type AlertButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };

/**
 * `Alert.alert` that also works in the browser, where React Native's own does nothing (so a "Remove?" confirmation never appeared and a "Plan submitted → OK → back"
 * never went back). On the phone it is the native alert, unchanged. In the browser a message alone is `window.alert`; with buttons it is `window.confirm`: OK runs the last
 * non-cancel button (the action: Remove, Log out, Choose from gallery), Cancel runs the cancel button if there is one.
 */
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    if (Platform.OS !== 'web') {
      NativeAlert.alert(title, message, buttons);
      return;
    }
    const text = message ? `${title}\n\n${message}` : title;
    const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    const cancel = list.find((b) => b.style === 'cancel');
    const actions = list.filter((b) => b !== cancel);
    if (actions.length === 0 || (actions.length === 1 && !cancel)) {
      globalThis.alert?.(text);
      actions[0]?.onPress?.();
      return;
    }
    const ok = globalThis.confirm ? globalThis.confirm(text) : true;
    if (ok) actions[actions.length - 1]?.onPress?.();
    else cancel?.onPress?.();
  },
};
