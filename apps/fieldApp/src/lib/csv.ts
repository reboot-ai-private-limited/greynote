import { Directory, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import { startActivityAsync } from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

/**
 * CSV downloads, built on the phone from what the screen already has (the server has no CSV endpoint; the web portal builds its own
 * the same way). The file is written to the app's cache, then the person chooses: Open it in another app, Share it (Drive, WhatsApp,
 * email), or Download it into a folder they pick.
 */

type Cell = string | number | null | undefined;

/** One cell, quoted when it holds a comma, a quote or a line break. */
function cell(value: Cell): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header and rows as CSV text. Lines end in CRLF and the text starts with a BOM, so Excel reads ₹ and Hindi names correctly. */
export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return `﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** Paise as a plain rupee figure ("1234.50"), so a spreadsheet can add the column up. */
export const rupeesCell = (paise: number) => (paise / 100).toFixed(2);

const CSV_MIME = 'text/csv';

/** Writes the CSV into the app's cache and returns the file. */
function writeCache(fileName: string, csv: string): File {
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(csv);
  return file;
}

/** Writes the CSV and opens the share sheet. Throws with a message fit to show when the phone can't share files. */
export async function shareCsv(fileName: string, csv: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone can’t share files.');
  const file = writeCache(fileName, csv);
  await Sharing.shareAsync(file.uri, { mimeType: CSV_MIME, UTI: 'public.comma-separated-values-text', dialogTitle: title });
}

/**
 * Opens the CSV in another app on the phone (Excel, Sheets, a file viewer). Android: an "open this file" request on a content address
 * the other app may read; with no app that can open a CSV it throws with a message that points to Share or Download. iOS has no such
 * request for a file we wrote, so it shows the share sheet, whose "Open in…" does the same job.
 */
export async function openCsv(fileName: string, csv: string, title: string): Promise<void> {
  if (Platform.OS !== 'android') return shareCsv(fileName, csv, title);
  const file = writeCache(fileName, csv);
  const data = await getContentUriAsync(file.uri);
  try {
    // 1 = FLAG_GRANT_READ_URI_PERMISSION: the other app may read this one file.
    await startActivityAsync('android.intent.action.VIEW', { data, type: CSV_MIME, flags: 1 });
  } catch {
    throw new Error('No app on this phone can open a CSV file. Use Share or Download instead.');
  }
}

/**
 * Saves the CSV into a folder the person picks (Downloads, Documents, a memory card). Returns the folder's name, or `null` when they
 * backed out of the folder picker. A name already in that folder is not overwritten: the new file gets a number.
 */
export const saveCsv = (fileName: string, csv: string) => saveTextFile(fileName, csv, CSV_MIME);

/** The same for any text file (the payslip is an `.html` file). Returns the folder's name, or `null` when they backed out of the picker. */
export async function saveTextFile(fileName: string, text: string, mimeType: string): Promise<string | null> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return null;
    throw err;
  }
  let file: File;
  try {
    file = folder.createFile(fileName, mimeType);
  } catch {
    file = folder.createFile(fileName.replace(/(\.[a-z0-9]+)$/i, `-${Date.now()}$1`), mimeType);
  }
  file.write(text);
  return folder.name;
}

export type CsvAction = 'open' | 'share' | 'download';

/** Asks what to do with the file. `null` when they dismissed the question. */
export const chooseCsvAction = (title: string): Promise<CsvAction | null> =>
  new Promise((resolve) => {
    Alert.alert(
      title,
      'What do you want to do with the file?',
      [
        { text: 'Open', onPress: () => resolve('open') },
        { text: 'Share', onPress: () => resolve('share') },
        { text: 'Download', onPress: () => resolve('download') },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });

/**
 * Asks Open, Share or Download and does it. Returns a line to show once it is done ("Saved to Downloads."), or `null` when nothing needs
 * saying (the file went to another app, or they backed out). Throws with a message fit to show.
 */
export async function deliverCsv(fileName: string, csv: string, title: string): Promise<string | null> {
  const action = await chooseCsvAction(title);
  if (action === 'open') await openCsv(fileName, csv, title);
  else if (action === 'share') await shareCsv(fileName, csv, title);
  else if (action === 'download') {
    const folder = await saveCsv(fileName, csv);
    return folder ? `Saved ${fileName} in ${folder}.` : null;
  }
  return null;
}
