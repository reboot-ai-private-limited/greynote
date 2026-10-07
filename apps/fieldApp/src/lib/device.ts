import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { storage } from './storage';

export type DeviceInfo = {
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
};

/** Identifies this phone to the server's device-approval registry — never user input. */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  const platform = Platform.OS === 'android' ? 'ANDROID' : Platform.OS === 'ios' ? 'IOS' : 'WEB';

  let deviceId: string | null = null;
  if (Platform.OS === 'android') deviceId = Application.getAndroidId();
  else if (Platform.OS === 'ios') deviceId = await Application.getIosIdForVendorAsync();
  if (!deviceId) {
    // Web (or an id the OS withheld): generate one once and keep it.
    deviceId = await storage.get('deviceId');
    if (!deviceId) {
      deviceId = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      await storage.set('deviceId', deviceId);
    }
  }

  const model = [Device.brand, Device.modelName].filter(Boolean).join(' ');
  return {
    deviceId,
    deviceName: Device.deviceName ?? 'Unknown device',
    deviceModel: model || Platform.OS,
    platform,
  };
}
