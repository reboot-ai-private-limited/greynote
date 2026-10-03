import { AppError } from '@/shared/errors/AppError.js';
import type { PlaceCandidate, PlaceSearchPort } from '../domain/placeSearch.port.js';
import { googlePost, isGoogleConfigured } from './googleMaps.js';

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
}

const UNAVAILABLE_MESSAGE = 'Place search is unavailable right now. Please try again shortly.';

/**
 * Google Places API (New) Text Search. One call returns coordinates too, so no separate
 * Place Details lookup is needed before a candidate can become a `Place`.
 */
export class GooglePlaceSearchAdapter implements PlaceSearchPort {
  async search(query: string): Promise<PlaceCandidate[]> {
    if (!isGoogleConfigured()) throw AppError.unavailable(UNAVAILABLE_MESSAGE, { reason: 'GOOGLE_MAPS_API_KEY not set' });

    let res: Response;
    try {
      res = await googlePost(SEARCH_TEXT_URL, 'places.id,places.displayName,places.formattedAddress,places.location', {
        textQuery: query,
        regionCode: 'IN',
        languageCode: 'en',
        pageSize: 10,
      });
    } catch (err) {
      throw AppError.unavailable(UNAVAILABLE_MESSAGE, { reason: 'PLACES_REQUEST_FAILED' }, err);
    }
    if (!res.ok) {
      throw AppError.unavailable(UNAVAILABLE_MESSAGE, {
        reason: 'PLACES_HTTP_ERROR',
        status: res.status,
        body: (await res.text()).slice(0, 300),
      });
    }

    const body = (await res.json()) as { places?: GooglePlace[] };
    return (body.places ?? []).flatMap((place) =>
      place.location
        ? [
            {
              label: place.displayName?.text ?? place.formattedAddress ?? query,
              address: place.formattedAddress ?? '',
              latitude: place.location.latitude,
              longitude: place.location.longitude,
              placeId: place.id,
            },
          ]
        : [],
    );
  }
}
