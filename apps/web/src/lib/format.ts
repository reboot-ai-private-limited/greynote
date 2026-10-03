import { businessTimeZone } from './siteConfig';

/** `1 Oct 2026` in the business timezone, regardless of the browser's own zone. */
export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: businessTimeZone(),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

/** `1 Oct 2026, 3:05 pm` in Indian time: for a history, where the hour matters. */
export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: businessTimeZone(),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

/** Integer paise → `₹1,234.50`. All money in this app is integer paise. */
export function formatMoney(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
}
