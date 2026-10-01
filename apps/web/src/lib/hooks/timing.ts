/** Every debounce interval in the app, in one place. */
export const timing = {
  /** Search boxes: wait for the user to stop typing before querying. */
  searchDebounceMs: 300,
  /** Place search is a billed Google call per request, so wait longer for the user to finish typing. */
  placeSearchDebounceMs: 500,
} as const;
