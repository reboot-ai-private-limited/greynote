/** One search hit, already in the shape a `Place` is stored in once Admin confirms it. */
export interface PlaceCandidate {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId: string;
}

export interface PlaceSearchPort {
  /** Throws a 503 `AppError` when the provider is unconfigured or down. */
  search(query: string): Promise<PlaceCandidate[]>;
}
