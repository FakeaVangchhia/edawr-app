/**
 * Remembering the customer's own orders, without an account.
 *
 * Ported from `edawr-frontend/src/lib/recent-orders.ts`. One thing genuinely
 * changes in the move: on the web this is the fragile half of the trust model,
 * because clearing site data silently destroys every receipt. App storage is
 * not cleared by a browser setting or a privacy sweep, so the same design is
 * materially more reliable here — it now survives everything short of
 * uninstalling the app.
 *
 * Order tracking is authorised by possession of an unguessable token, and that
 * token is handed over exactly once — in the checkout response. If the customer
 * closes the tab, the order is gone as far as they are concerned: there is no
 * login to find it behind, and no way for them to prove it was theirs.
 *
 * So the token is kept on the device. It is the same trust model as a paper
 * receipt: whoever holds it can see the order, and losing it means losing
 * access. Uninstalling is therefore destructive, which is worth knowing before
 * treating this as a database — and is the honest argument for signing in.
 *
 * Exposed as an external store, for the same reasons as the cart (see
 * `cart-store.ts`): reading storage from an effect would mean setting state
 * synchronously inside one, which is an error in this codebase.
 */

import { storage } from './storage';

const STORAGE_KEY = 'edawr-recent-orders-v1';
const MAX_REMEMBERED = 10;

export interface RememberedOrder {
  token: string;
  orderId: number;
  placedAt: string;
  total: number;
  itemCount: number;
}

const NONE: RememberedOrder[] = [];

/**
 * `useSyncExternalStore` compares snapshots by reference, so this must be a
 * stable array rather than a fresh parse on every call — otherwise every render
 * sees a "changed" store and loops forever.
 */
let snapshot: RememberedOrder[] = NONE;
let hydrated = false;
const listeners = new Set<() => void>();

/**
 * True when this entry is safe to render.
 *
 * **Every field, not just two.** The previous version checked `token` and
 * `orderId` and let the rest through, so an entry written by an older build
 * reached the list with `undefined` where the total and the item count should
 * be — and the orders page rendered "₹undefined" and "undefined items" rather
 * than dropping a row it could not display. Storage survives app updates; a
 * partial check is a promise that the shape never changed again.
 */
function isRemembered(entry: unknown): entry is RememberedOrder {
  if (typeof entry !== 'object' || entry === null) return false;
  const candidate = entry as Record<string, unknown>;
  return (
    typeof candidate.token === 'string' &&
    candidate.token.length > 0 &&
    typeof candidate.orderId === 'number' &&
    typeof candidate.placedAt === 'string' &&
    typeof candidate.total === 'number' &&
    Number.isFinite(candidate.total) &&
    typeof candidate.itemCount === 'number'
  );
}

function parse(raw: string | null): RememberedOrder[] {
  if (!raw) return NONE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return NONE;

    const valid = parsed.filter(isRemembered);
    return valid.length > 0 ? valid : NONE;
  } catch {
    return NONE;
  }
}

/**
 * Whether the last write reached disk.
 *
 * The write is allowed to fail — private browsing and a full quota both throw,
 * and crashing the page over a lost receipt would be a worse outcome than
 * losing it. What was wrong was failing *silently*: the in-memory snapshot was
 * updated regardless, so the order appeared in the list, looked remembered, and
 * vanished on the next reload with no explanation. The checkout page reads this
 * to tell the customer to keep the link.
 */
let lastWriteFailed = false;

export function recentOrdersArePersisted(): boolean {
  return !lastWriteFailed;
}

function write(next: RememberedOrder[]): void {
  snapshot = next.length > 0 ? next : NONE;
  // The adapter reports failure rather than throwing. The order still exists
  // server-side and the customer is being redirected to its tracking page — but
  // this device will not remember it, and saying so beats a list that empties
  // itself overnight.
  lastWriteFailed = !storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  for (const listener of listeners) listener();
}

export function readRecentOrders(): RememberedOrder[] {
  if (!hydrated) {
    hydrated = true;
    snapshot = parse(storage.getItem(STORAGE_KEY));
  }
  return snapshot;
}

export function rememberOrder(order: RememberedOrder): void {
  const existing = readRecentOrders().filter((entry) => entry.token !== order.token);
  write([order, ...existing].slice(0, MAX_REMEMBERED));
}

export function forgetOrder(token: string): void {
  write(readRecentOrders().filter((entry) => entry.token !== token));
}

// --- external store plumbing -------------------------------------------
export function subscribeToRecentOrders(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Hydrates on first call — see the note on `cart-store.ts`'s `getSnapshot`. */
export function getRecentOrdersSnapshot(): RememberedOrder[] {
  return readRecentOrders();
}

/** Kept because `useSyncExternalStore` still takes it. Same value as above. */
export function getRecentOrdersServerSnapshot(): RememberedOrder[] {
  return readRecentOrders();
}
