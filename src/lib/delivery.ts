import type { BasketQuote, CartLine, DeliveryTier, DeliveryType, StoreConfig } from '@/types';

/**
 * Delivery tiers, as the UI needs to reason about them.
 *
 * Nothing here decides what anything costs. The fee on a tier is the number the
 * server sent, and the bill is always `/api/store/quote`. These are lookups,
 * fallbacks and label strings — the parts that would otherwise be inlined into
 * three components and drift apart.
 */

/**
 * What the picker starts on, and what everything falls back to.
 *
 * Matches the server's `DEFAULT_DELIVERY_TYPE`. If the two ever diverge the
 * server still wins at checkout — this only decides what the customer sees
 * selected before they touch anything.
 */
export const DEFAULT_DELIVERY_TYPE: DeliveryType = 'instant';

/**
 * Tiers to render before `/api/store/config` lands, or if it never does.
 *
 * `Storefront` swallows a failed config fetch, so without this the picker would
 * simply not appear and the customer would silently get the default tier with
 * no idea a choice existed. These figures are the shipped defaults; the moment
 * real config arrives it replaces them, and the bill was never computed from
 * them in the first place.
 */
export const FALLBACK_TIERS: DeliveryTier[] = [
  { key: 'instant', label: 'Instant', fee: 15, promise_minutes: 15 },
  // The key is the tier's identity and stays `slow`; the label is what a
  // customer reads, and "Saver" says what they get for choosing it.
  { key: 'slow', label: 'Saver', fee: 5, promise_minutes: 45 },
];

/** The store's tiers, fastest first, or the shipped defaults. */
export function tiersFrom(config: StoreConfig | null | undefined): DeliveryTier[] {
  const tiers = config?.delivery_tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) return FALLBACK_TIERS;
  return tiers;
}

/**
 * Find a tier by key.
 *
 * An unrecognised key resolves to the FIRST tier, which is the fastest — never
 * to the cheapest. Same reasoning as the server's `resolve_tier`: quietly
 * giving someone a slower delivery than they think they bought is the mistake
 * you hear about from a complaint rather than from a log.
 */
export function tierFor(
  config: StoreConfig | null | undefined,
  key: DeliveryType,
): DeliveryTier {
  const tiers = tiersFrom(config);
  return tiers.find((tier) => tier.key === key) ?? tiers[0];
}

/**
 * The cache key for a quote.
 *
 * The tier is part of it, because switching speed changes the bill without
 * changing a single line of the basket. Leave it out and the cart shows the
 * instant price under a slow selection until something else happens to
 * invalidate it — which is the whole failure this string exists to prevent.
 */
export function quoteSignature(lines: CartLine[], deliveryType: DeliveryType): string {
  const basket = lines.map((line) => `${line.product.id}:${line.quantity}`).join(',');
  return `${deliveryType}|${basket}`;
}

/**
 * What a fee reads as in the picker.
 *
 * `undefined` is '—', never 'Free'. A fee that has not been calculated yet is
 * unknown, and telling a customer their delivery is free before the server has
 * said so is a promise the bill will then break. Same contract as `BillRow`.
 */
export function deliveryFeeLabel(
  fee: number | undefined,
  formatMoney: (value: number) => string,
): string {
  if (fee === undefined) return '—';
  if (fee === 0) return 'Free';
  return formatMoney(fee);
}

/**
 * The fee to show against one tier.
 *
 * The quote only ever prices the SELECTED tier, so the unselected one falls
 * back to the tier's own list price — except above the free-delivery threshold,
 * where the quote's zero applies to every tier and showing a price beside the
 * alternative would be wrong.
 */
export function feeForTier(
  tier: DeliveryTier,
  selected: DeliveryType,
  quote: BasketQuote | null,
): number | undefined {
  if (quote === null) return tier.fee;
  if (quote.delivery_type === tier.key) return quote.delivery_fee;
  // Free delivery is earned by basket size, not by speed, so a zero on one tier
  // is a zero on all of them.
  if (quote.delivery_fee === 0) return 0;
  return tier.fee;
}
