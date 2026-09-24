import type { PlaceCandidate, PlaceSearchPort } from '../../domain/placeSearch.port.js';

export class SearchPlacesUseCase {
  constructor(private readonly places: PlaceSearchPort) {}

  execute(query: string): Promise<PlaceCandidate[]> {
    return this.places.search(query);
  }
}
