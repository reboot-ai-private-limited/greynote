import { Directory, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import { startActivityAsync } from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

import { storage } from './storage';

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

const FOLDER_KEY = 'download-folder';
const UTI: Record<string, string> = { 'text/csv': 'public.comma-separated-values-text', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'org.openxmlformats.spreadsheetml.sheet' };

/** The folder reports are saved into: the one picked the first time, remembered. `null` when none was picked or it is gone. */
async function rememberedFolder(): Promise<Directory | null> {
  const uri = await storage.get(FOLDER_KEY).catch(() => null);
  if (!uri) return null;
  try {
    return new Directory(uri);
  } catch {
    return null;
  }
}

/** Asks which folder to save reports into and remembers it. `null` when they backed out of the picker. */
export async function pickDownloadFolder(): Promise<Directory | null> {
  try {
    const folder = await Directory.pickDirectoryAsync();
    await storage.set(FOLDER_KEY, folder.uri);
    return folder;
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return null;
    throw err;
  }
}

/** The name of the remembered folder ("Downloads"), or `null` before one was picked (and on the web). */
export async function downloadFolderName(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return (await rememberedFolder())?.name ?? null;
}

const writeBytes = (file: File, data: string | ArrayBuffer) => (typeof data === 'string' ? file.write(data) : file.write(new Uint8Array(data)));

function createIn(folder: Directory, fileName: string, mime: string, data: string | ArrayBuffer): void {
  let file: File;
  try {
    file = folder.createFile(fileName, mime);
  } catch {
    file = folder.createFile(fileName.replace(/(\.[a-z0-9]+)$/i, `-${Date.now()}$1`), mime);
  }
  writeBytes(file, data);
}

/** Offers to open or share the file just saved (a copy in the cache, which other apps can read). Resolves when the question is dismissed. */
function offerOpenOrShare(fileName: string, data: string | ArrayBuffer, mime: string, title: string, saved: string): Promise<void> {
  return new Promise((resolve) => {
    const open = async () => {
      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true });
      writeBytes(file, data);
      if (Platform.OS === 'android') {
        try {
          await startActivityAsync('android.intent.action.VIEW', { data: await getContentUriAsync(file.uri), type: mime, flags: 1 });
        } catch {
          Alert.alert('Can’t open it here', 'No app on this phone can open this file. Use Share, or open it from the Files app.');
        }
      } else if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: mime, ...(UTI[mime] ? { UTI: UTI[mime] } : {}), dialogTitle: title });
    };
    const share = async () => {
      if (!(await Sharing.isAvailableAsync())) return Alert.alert('This phone can’t share files.');
      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true });
      writeBytes(file, data);
      await Sharing.shareAsync(file.uri, { mimeType: mime, ...(UTI[mime] ? { UTI: UTI[mime] } : {}), dialogTitle: title });
    };
    Alert.alert('Saved', saved, [
      { text: 'Open', onPress: () => void open().finally(resolve) },
      { text: 'Share', onPress: () => void share().finally(resolve) },
      { text: 'OK', style: 'cancel', onPress: () => resolve() },
    ], { cancelable: true, onDismiss: () => resolve() });
  });
}

/**
 * Saves a report on the phone. In a browser it downloads. On the phone the first download asks which folder (Downloads, Documents…) and
 * remembers it, so every later one saves straight into it; then "Saved … in Downloads." with Open and Share if wanted. Returns the line to
 * show, or `null` when they backed out of the folder picker. Throws with a message fit to show.
 */
export async function deliverFile(fileName: string, data: string | ArrayBuffer, mime: string, title: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return `Downloaded ${fileName}.`;
  }
  let folder = (await rememberedFolder()) ?? (await pickDownloadFolder());
  if (!folder) return null;
  try {
    createIn(folder, fileName, mime, data);
  } catch {
    // The remembered folder is gone or no longer allowed: ask once more.
    folder = await pickDownloadFolder();
    if (!folder) return null;
    createIn(folder, fileName, mime, data);
  }
  const saved = `Saved ${fileName} in ${folder.name}.`;
  await offerOpenOrShare(fileName, data, mime, title, saved);
  return saved;
}

/** A CSV report, saved on the phone (see `deliverFile`). */
export const deliverCsv = (fileName: string, csv: string, title: string): Promise<string | null> => deliverFile(fileName, csv, CSV_MIME, title);

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** An Excel workbook the server made, saved on the phone (see `deliverFile`). */
export const deliverXlsx = (fileName: string, bytes: ArrayBuffer, title: string): Promise<string | null> => deliverFile(fileName, bytes, XLSX_MIME, title);
