/**
 * Client-side validation for the checkout form.
 *
 * Everything here is a **courtesy**. The server validates the same fields and is
 * the only thing that decides whether an order is accepted. The reason to
 * duplicate a rule at all is latency: telling someone their phone number is
 * short before they wait for a round trip is kinder than telling them after.
 *
 * The rule that follows from that: a client check may be *looser* than the
 * server's, never *stricter*. A stricter one rejects a customer the store would
 * happily have served, and there is nobody for them to argue with.
 */

/**
 * Mirrors `normalise_phone` in `backend/api/validators.py`, **including its
 * length conditions**.
 *
 * The country code is only stripped when there are 12 digits, and a trunk zero
 * only when there are 11. Stripping a leading "91" unconditionally would reject
 * `9123456789` — a perfectly valid ten-digit Indian mobile that happens to start
 * with 91 — leaving that customer unable to check out at all, with a message
 * insisting their own number is invalid.
 */
export function isValidIndianMobile(input: string): boolean {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits);
}

/** Matches `CheckoutSerializer.validate_customer_name`. */
export function isValidName(input: string): boolean {
  return input.trim().length >= 2;
}

/**
 * Matches `CheckoutSerializer.validate_customer_address`, which wants "a full
 * address a rider could actually find" and enforces that as eight characters.
 */
export function isValidAddress(input: string): boolean {
  return input.trim().length >= 8;
}
