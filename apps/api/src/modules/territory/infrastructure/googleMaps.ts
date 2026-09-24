import { env } from '@/config/env.js';

/** Bounds every Google call, so a save never hangs on the provider (decision-log 2026-09-24). */
export const GOOGLE_TIMEOUT_MS = 5000;

/**
 * POSTs to a Google Maps Platform (New) endpoint. These take the key and a field mask as headers;
 * the mask limits the response — and the billing SKU — to the fields actually read.
 */
export async function googlePost(url: string, fieldMask: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.GOOGLE_MAPS_API_KEY ?? '',
      'x-goog-fieldmask': fieldMask,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
}

export function isGoogleConfigured(): boolean {
  return env.GOOGLE_MAPS_API_KEY !== undefined;
}
