/**
 * Display formatting. Nothing here decides what anything costs.
 *
 * Every rupee figure the customer sees comes from the server, which computes it
 * in Decimal. These helpers only choose how to render a number that has already
 * been decided — the moment this file starts doing arithmetic on money, there
 * are two pricing engines and they will disagree.
 */

const RUPEES = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const RUPEES_EXACT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * "₹62" for whole rupees, "₹62.50" when there are paise.
 *
 * Prices in a grocery catalogue are usually whole rupees, and "₹62.00" on every
 * tile is visual noise. Totals on the bill use `formatMoneyExact` instead,
 * where the trailing zeroes signal "this is the final figure".
 */
export function formatMoney(value: number | string | null | undefined): string {
  const amount = toNumber(value);
  return Number.isInteger(amount) ? RUPEES.format(amount) : RUPEES_EXACT.format(amount);
}

/** Always two decimal places. Use on anything that is a total. */
export function formatMoneyExact(value: number | string | null | undefined): string {
  return RUPEES_EXACT.format(toNumber(value));
}

/**
 * The API sends money as JSON numbers, but a value that has been through a
 * form, a query string or an older response can arrive as a string. Coercing
 * here means one guard instead of a parseFloat at every call site — and the
 * call site that forgets one concatenates "62" and "35" into "6235".
 */
function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** "8 min" / "1 min" / "Any moment now" when the clock has run out. */
export function formatCountdown(minutes: number): string {
  if (minutes <= 0) return 'Any moment now';
  return `${minutes} min`;
}

/** "14:32" — the time of day a timestamp landed, for the tracking timeline. */
export function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** "11 Aug, 14:32" — for order history, where the day matters. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** "+91 98123 45678" — readable, and matches how the number was typed. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}
