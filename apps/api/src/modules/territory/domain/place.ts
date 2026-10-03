/**
 * A point Admin confirmed on the map — never a bare typed label (HLD 02 §1). An HQ's base place
 * and a Route's destination are both one of these.
 */
export interface Place {
  label: string;
  latitude: number;
  longitude: number;
  placeId: string;
}
