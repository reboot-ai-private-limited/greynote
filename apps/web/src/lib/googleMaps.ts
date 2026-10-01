import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

/**
 * Loading the Maps JavaScript API once for the whole portal. `setOptions` configures the loader's
 * singleton and cannot safely run twice, so every map feature goes through here.
 *
 * INLINED AT BUILD TIME AND THEREFORE PUBLIC: every `NEXT_PUBLIC_*` value ships to every browser.
 * The key is protected by CONFIGURATION, not secrecy — an HTTP-referrer restriction to the portal's
 * domain and an API restriction to *Maps JavaScript API* only. It is NOT the API's own Google key
 * (server-side, Places + Routes), which must never reach a browser. Without a key the map features
 * degrade to a message and everything else keeps working.
 */
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

export const hasMapsKey = API_KEY !== '';

/** Siliguri: where a map opens before it has anything to fit to. */
export const DEFAULT_CENTER = { lat: 26.7271, lng: 88.4276 };

if (hasMapsKey) {
  // `weekly` is Google's current stable channel; nothing here should follow a beta.
  setOptions({ key: API_KEY, v: 'weekly', region: 'IN', language: 'en' });
}

/** `importLibrary` is idempotent per library, so any number of callers can ask for what they need. */
export async function loadMapsLibrary(): Promise<google.maps.MapsLibrary> {
  if (!hasMapsKey) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set.');
  return importLibrary('maps');
}
