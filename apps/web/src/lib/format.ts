const TIME_ZONE = 'Asia/Kolkata';

/** `1 Oct 2026` in Indian time, regardless of the browser's own zone. */
export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

/** Integer paise → `₹1,234.50`. All money in this app is integer paise. */
export function formatMoney(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
}
