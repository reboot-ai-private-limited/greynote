/** Rupees typed into a form → integer paise. Returns null for anything that is not a money amount. */
export function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole = '0', fraction = ''] = trimmed.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}
