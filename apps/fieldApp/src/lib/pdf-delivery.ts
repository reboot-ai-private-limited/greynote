import { Directory, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import { startActivityAsync } from 'expo-intent-launcher';
import { printToFileAsync } from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { chooseCsvAction } from './csv';

const PDF_MIME = 'application/pdf';

/**
 * Turns a page of HTML into a PDF file and hands it over the way the CSVs go: Open (in a PDF viewer on the phone), Share (the share sheet)
 * or Download (into a folder the person picks). `printToFileAsync` only makes the file: it opens no print dialog. Returns a line to show
 * once it is done ("Saved … in Download."), or `null` when nothing needs saying. Throws with a message fit to show.
 */
export async function deliverPdf(fileName: string, html: string, page: { width: number; height: number }, title: string): Promise<string | null> {
  const action = await chooseCsvAction(title);
  if (!action) return null;

  // The PDF is made once, then written under the right name in the app's cache (the maker names its own file at random).
  const made = await printToFileAsync({ html, width: page.width, height: page.height, base64: true });
  const base64 = made.base64;
  if (!base64) throw new Error('Couldn’t make the PDF. Please try again.');
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(base64, { encoding: 'base64' });

  if (action === 'share' || (action === 'open' && Platform.OS !== 'android')) {
    if (!(await Sharing.isAvailableAsync())) throw new Error('This phone can’t share files.');
    await Sharing.shareAsync(file.uri, { mimeType: PDF_MIME, UTI: 'com.adobe.pdf', dialogTitle: title });
    return null;
  }

  if (action === 'open') {
    const data = await getContentUriAsync(file.uri);
    try {
      // 1 = FLAG_GRANT_READ_URI_PERMISSION: the viewer may read this one file.
      await startActivityAsync('android.intent.action.VIEW', { data, type: PDF_MIME, flags: 1 });
    } catch {
      throw new Error('No app on this phone can open a PDF. Use Share or Download instead.');
    }
    return null;
  }

  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return null;
    throw err;
  }
  let target: File;
  try {
    target = folder.createFile(fileName, PDF_MIME);
  } catch {
    target = folder.createFile(fileName.replace(/(\.[a-z0-9]+)$/i, `-${Date.now()}$1`), PDF_MIME);
  }
  target.write(base64, { encoding: 'base64' });
  return `Saved ${fileName} in ${folder.name}.`;
}
