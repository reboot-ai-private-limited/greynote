import { Redirect } from 'expo-router';

/** The board is the Team home now (decision 2026-11-18); this old address just goes there so no link breaks. */
export default function TeamBoardRedirect() {
  return <Redirect href="/team" />;
}
