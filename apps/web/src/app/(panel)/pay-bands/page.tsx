import { redirect } from 'next/navigation';

/** The screen was called Pay Bands; old links and bookmarks land on its new address. */
export default function PayBandsRedirect(): never {
  redirect('/pay-grades');
}
