import { Asset } from 'expo-asset';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';

/** The logo (assets/images/logo.png) as a `data:` address, to put inside a file. `null` when it cannot be read: the file then shows the name only. */
export async function logoDataUri(): Promise<string | null> {
  try {
    const asset = Asset.fromModule(require('@/assets/images/logo.png'));
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    return `data:image/png;base64,${await readAsStringAsync(uri, { encoding: EncodingType.Base64 })}`;
  } catch {
    return null;
  }
}
