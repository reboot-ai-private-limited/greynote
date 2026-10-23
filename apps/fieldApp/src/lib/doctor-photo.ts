import * as ImagePicker from 'expo-image-picker';

import { apiDelete, apiUpload, type UploadFile } from './api';

/**
 * A doctor's optional photo (docs/mobile/doctors.md rule 10): JPG, PNG or WebP up to 5 MB, set by the MR who added the doctor
 * while it waits or was sent back. It is never part of the add itself (that stays offline-first JSON): it is uploaded on its
 * own once the doctor exists on the server, and changing it does not resubmit the request.
 */

/** The server's limit. */
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class PhotoPickError extends Error {}

/**
 * Takes a photo or picks one from the gallery, square-cropped and compressed. `null` when the person cancels. Throws a
 * `PhotoPickError` (with a message to show) when permission is refused or the file is not one the server takes.
 */
export async function pickDoctorPhoto(source: 'camera' | 'library'): Promise<UploadFile | null> {
  const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PhotoPickError(source === 'camera' ? 'Allow the camera for this app to take a photo.' : 'Allow photos for this app to choose one.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const mimeType = asset.mimeType ?? 'image/jpeg';
  if (!TYPES.includes(mimeType)) throw new PhotoPickError('Choose a JPG, PNG or WebP photo.');
  if (asset.fileSize !== undefined && asset.fileSize > MAX_BYTES) throw new PhotoPickError('That photo is over 5 MB. Choose a smaller one.');
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return { uri: asset.uri, name: asset.fileName ?? `doctor.${ext}`, mimeType };
}

/** Sets or replaces the photo of a doctor I added (online). `409` once it is approved: only Admin changes it then. */
export const setAddedDoctorPhoto = (doctorId: string, file: UploadFile) =>
  apiUpload<{ photoUrl: string | null }>(`/field-master-data/doctors/added/${doctorId}/photo`, file, 'PUT');

export const removeAddedDoctorPhoto = (doctorId: string) =>
  apiDelete<{ photoUrl: string | null }>(`/field-master-data/doctors/added/${doctorId}/photo`);
