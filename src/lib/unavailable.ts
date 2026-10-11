import type { BasketQuote, UnavailableItem } from '@/types';

/**
 * Which basket rows cannot be supplied, and whether that stops checkout.
 *
 * Shared by the storefront's checkout page and this app's checkout
 * screen, which used to disagree: the page validated a 409's rows and the app
 * cast them, and neither looked at the quote's own `unavailable` list — so a
 * basket the server had already said it could not fill was offered a live
 * "Place order" button, and the customer learned otherwise one round trip later.
 */

/**
 * The `unavailable` rows a 409 carries, checked field by field.
 *
 * The payload is whatever the server sent, and a cast would let a malformed
 * row reach the "unavailable" markers as `undefined`s. Anything that is not the
 * documented shape is dropped rather than rendered.
 */
export function parseUnavailable(rows: unknown): UnavailableItem[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): UnavailableItem[] => {
    if (typeof row !== 'object' || row === null) return [];
    const item = row as Record<string, unknown>;
    if (typeof item.product_id !== 'number' || typeof item.name !== 'string') return [];
    return [
      {
        product_id: item.product_id,
        name: item.name,
        reason: typeof item.reason === 'string' ? item.reason : 'Not available right now.',
        available: typeof item.available === 'number' ? item.available : 0,
      },
    ];
  });
}

/**
 * The rows to mark on the order summary.
 *
 * A refused checkout's list wins: it was read under the stock lock, so it is
 * the newer and the more authoritative of the two. Otherwise the quote's,
 * which knew before the customer pressed anything.
 */
export function flaggedItems(
  refused: UnavailableItem[],
  quote: BasketQuote | null,
): UnavailableItem[] {
  return refused.length > 0 ? refused : (quote?.unavailable ?? []);
}

/**
 * Whether "Place order" is withheld.
 *
 * **No quote means no order.** A quote that failed to load leaves the button
 * showing no total, and a customer must not be asked to confirm a bill they
 * have not been shown. Loading is the same case, and is covered by it.
 *
 * Every one of these the server enforces as well; this is what stops the
 * customer from finding out after the round trip.
 */
export function checkoutBlocked({
  quote,
  flagged,
  storeClosed,
  outsideArea,
}: {
  quote: BasketQuote | null;
  flagged: UnavailableItem[];
  storeClosed: boolean;
  outsideArea: boolean;
}): boolean {
  return (
    quote === null || !quote.meets_minimum || flagged.length > 0 || storeClosed || outsideArea
  );
}
