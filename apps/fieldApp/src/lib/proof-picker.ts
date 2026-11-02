import * as DocumentPicker from 'expo-document-picker';

import type { UploadFile } from './api';
import { MAX_PROOF_BYTES, MAX_PROOF_FILES, PROOF_TYPES } from './leave';

export type PickedProof = UploadFile & { sizeBytes: number | null };

/**
 * Lets the MR choose one proof file and checks it against the server's rules first (PDF, JPG or PNG, up to
 * 5 MB, at most 3 per leave) so a doomed upload isn't sent. Returns the file, a message to show, or nothing
 * when they backed out of the picker.
 */
export async function pickProofFile(alreadyChosen: number): Promise<{ file?: PickedProof; error?: string } | null> {
  if (alreadyChosen >= MAX_PROOF_FILES) return { error: `You can attach at most ${MAX_PROOF_FILES} files. Remove one first.` };
  const result = await DocumentPicker.getDocumentAsync({ type: PROOF_TYPES, copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  if (a.mimeType && !PROOF_TYPES.includes(a.mimeType)) return { error: 'Choose a PDF, JPG or PNG.' };
  if (a.size !== undefined && a.size > MAX_PROOF_BYTES) return { error: 'That file is over 5 MB.' };
  return { file: { uri: a.uri, name: a.name, mimeType: a.mimeType, sizeBytes: a.size ?? null } };
}

/**
 * Lets the employee choose several files at once (the month's secondary takes any number, docs/mobile/secondary-and-targets.md
 * section 1b). Each is checked against the server's rules (PDF, JPG or PNG, up to 5 MB); the ones that fail come back as
 * messages naming the file, so the rest can still go. `null` when they backed out of the picker.
 */
export async function pickProofFiles(): Promise<{ files: PickedProof[]; errors: string[] } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: PROOF_TYPES, copyToCacheDirectory: true, multiple: true });
  if (result.canceled || result.assets.length === 0) return null;
  const files: PickedProof[] = [];
  const errors: string[] = [];
  for (const a of result.assets) {
    if (a.mimeType && !PROOF_TYPES.includes(a.mimeType)) errors.push(`${a.name}: choose a PDF, JPG or PNG.`);
    else if (a.size !== undefined && a.size > MAX_PROOF_BYTES) errors.push(`${a.name}: over 5 MB.`);
    else files.push({ uri: a.uri, name: a.name, mimeType: a.mimeType, sizeBytes: a.size ?? null });
  }
  return { files, errors };
}

export const formatSize = (bytes: number | null) =>
  bytes === null ? '' : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
