import { ApiError, NetworkError, type UploadFile } from '@/lib/api';
import { setAddedDoctorPhoto } from '@/lib/doctor-photo';

import { isOnline } from './connectivity';
import { store } from './store';

/**
 * Photos chosen for a doctor added on the phone (docs/mobile/doctors.md rule 10). The add is queued as JSON and the photo waits
 * here, keyed by the add's `clientId`, until the add has synced and the server has given the doctor its id; then it is
 * uploaded. A photo never holds the doctor back: a network failure leaves it for the next sync, a refusal (wrong file, the
 * doctor already approved or gone) or repeated failures drop it, with the reason kept for the screen.
 */

const KEY = 'doctorPhotos';
/** After this many failed uploads (not counting being offline) the photo is given up. */
const MAX_ATTEMPTS = 5;

export type PendingPhoto = UploadFile & { attempts: number; error?: string | null };
type Pending = Record<string, PendingPhoto>;

async function read(): Promise<Pending> {
  const raw = await store.getMeta(KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Pending;
  } catch {
    return {};
  }
}
const write = (pending: Pending) => store.setMeta(KEY, JSON.stringify(pending));

/** The photo waiting for a queued add, or `null`. */
export async function getPendingPhoto(clientId: string): Promise<PendingPhoto | null> {
  return (await read())[clientId] ?? null;
}

/** Keeps (or with `null`, forgets) the photo for a queued add. */
export async function setPendingPhoto(clientId: string, file: UploadFile | null): Promise<void> {
  const pending = await read();
  if (file) pending[clientId] = { ...file, attempts: 0, error: null };
  else delete pending[clientId];
  await write(pending);
}

/** The photos still waiting, by `clientId`, for the screen to say so. */
export const listPendingPhotos = read;

/**
 * Uploads every waiting photo whose add has synced. Run after each push; safe to run any time (an upload just replaces).
 * Returns how many went up.
 */
export async function uploadPendingPhotos(): Promise<number> {
  const pending = await read();
  let uploaded = 0;
  let changed = false;
  for (const [clientId, photo] of Object.entries(pending)) {
    const record = await store.getRecord(clientId);
    if (!record || record.deleted) {
      delete pending[clientId]; // the add is gone (removed, or pruned after syncing): so is its photo, given up or not
      changed = true;
      continue;
    }
    if (photo.error) continue; // given up; kept only so the screen can say why
    if (record.status !== 'SYNCED' || !record.serverId) continue;
    try {
      await setAddedDoctorPhoto(record.serverId, photo);
      delete pending[clientId];
      uploaded += 1;
    } catch (err) {
      // Offline: everything waits for the next sync. While online, a "network" failure is this file's own (the picker's copy can
      // be cleared from the cache), so it counts as a failed try instead of blocking every photo behind it.
      if (err instanceof NetworkError && !isOnline()) break;
      const refused = err instanceof ApiError && [400, 403, 404, 409].includes(err.status);
      const attempts = photo.attempts + 1;
      pending[clientId] = {
        ...photo,
        attempts,
        error: refused || attempts >= MAX_ATTEMPTS ? (err instanceof Error ? err.message : 'The photo could not be uploaded.') : null,
      };
    }
    changed = true;
  }
  if (changed) await write(pending);
  return uploaded;
}
