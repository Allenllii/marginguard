export const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

// Seller-facing drafts hold dollars ("49.99") and percentages ("2.9"). They become
// integer cents and basis points only in `toInput`; the engine never sees a float.
const pad2 = (value: number) => String(value).padStart(2, '0');
export const dollarsText = (cents: number) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${pad2(Math.abs(cents) % 100)}`;
export const percentText = (basisPoints: number) => `${Math.floor(basisPoints / 100)}${basisPoints % 100 ? `.${pad2(basisPoints % 100).replace(/0$/, '')}` : ''}`;

export type Unit = 'dollars' | 'percent';
/**
 * "49.99" dollars -> 4999 cents; "2.9" percent -> 290 basis points. String arithmetic,
 * never floating point. A third decimal or more rounds half away from zero, once.
 */
export function hundredths(value: string, unit: Unit, signed = false): { value: number; rounded: boolean } | null {
  const match = value.trim().match(unit === 'dollars' ? /^(-?)\$?(\d{1,10})(?:\.(\d{1,6}))?$/ : /^(-?)(\d{1,10})(?:\.(\d{1,6}))?%?$/);
  if (!match || (match[1] && !signed)) return null;
  const fraction = (match[3] ?? '').padEnd(3, '0');
  const magnitude = Number(match[2]) * 100 + Number(fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(magnitude)) return null;
  return { value: match[1] && magnitude ? -magnitude : magnitude, rounded: /[1-9]/.test(fraction.slice(2)) };
}
export function amount(value: string, label: string, unit: Unit, signed = false) {
  const parsed = hundredths(value, unit, signed);
  if (!parsed) throw new Error(unit === 'dollars' ? `${label}: enter a dollar amount such as 50 or 49.99${signed ? ' (may be negative)' : ''}.` : `${label}: enter a percentage such as 20 or 2.9.`);
  return parsed.value;
}
/** The exact integer the engine will use, shown under each field. */
export function applied(value: string, unit: Unit, signed: boolean) {
  const parsed = hundredths(value, unit, signed);
  if (!parsed) return '';
  const exact = unit === 'dollars' ? `${parsed.value} cents` : `${parsed.value} bp`;
  return parsed.rounded ? `Rounded to ${unit === 'dollars' ? usd(parsed.value) : `${percentText(parsed.value)}%`} = ${exact}` : `Uses ${exact}`;
}

