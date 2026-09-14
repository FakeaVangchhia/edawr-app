import { storage } from './storage';
import type { CartLine, StoreProduct } from '@/types';

/**
 * The basket, modelled as an external store rather than component state.
 *
 * Device storage genuinely *is* an external store, and treating it as one
 * avoids the cascading render that setting state inside an effect produces —
 * an error in the storefront (`react-hooks/set-state-in-effect`) and just as
 * much of a bug here.
 *
 * Ported from `edawr-frontend/src/lib/cart-store.ts`. Two of the web version's
 * three stated benefits do not survive the move and their machinery is gone:
 * there is no server render to mismatch, and no second tab to sync with. What
 * replaces them is better than both — MMKV reads synchronously, so the basket
 * is present on the very first frame and the cart badge never flashes empty.
 *
 * **The basket is not the bill.** Line prices here are a snapshot taken when
 * the customer tapped Add, used for display only. Every figure that is actually
 * charged comes from `/api/store/quote` and finally from the order the server
 * creates. A cart that computed its own total would be a second pricing engine.
 */

const STORAGE_KEY = 'edawr-cart-v1';

/**
 * Mirrors MAX_QUANTITY_PER_ITEM in the backend settings. The server is the
 * authority and rejects anything above its own limit; this exists so the
 * stepper stops rather than letting someone tap up to 40 and fail at checkout.
 */
export const MAX_PER_ITEM = 20;

export interface CartSnapshot {
  lines: CartLine[];
  /** False only before the first read. In practice true from the first frame. */
  hydrated: boolean;
}

/**
 * Returned before hydration. A single frozen object: `useSyncExternalStore`
 * compares snapshots by reference and would re-render forever if this
 * allocated a new one each call.
 */
const NO_LINES: CartLine[] = [];
const EMPTY: CartSnapshot = Object.freeze({ lines: NO_LINES, hydrated: false });

let snapshot: CartSnapshot = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function parse(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Anything in storage is untrusted input: it survives app updates, so it
    // may have been written by an older version of this code with a different
    // shape. Validate rather than assume.
    return parsed.filter(
      (line): line is CartLine =>
        typeof line === 'object' &&
        line !== null &&
        typeof (line as CartLine).product?.id === 'number' &&
        typeof (line as CartLine).product?.price === 'number' &&
        typeof (line as CartLine).quantity === 'number' &&
        (line as CartLine).quantity > 0,
    );
  } catch {
    return [];
  }
}

function commit(lines: CartLine[], { persist = true } = {}) {
  snapshot = { lines, hydrated: true };
  if (persist) {
    // The adapter swallows its own failures. Losing the saved basket is
    // survivable; crashing over it is not.
    storage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }
  emit();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  commit(parse(storage.getItem(STORAGE_KEY)), { persist: false });
}

export function subscribe(listener: () => void): () => void {
  // Hydrates on the first subscriber, as the web version did. `getSnapshot`
  // also hydrates, so this is usually a no-op — but "usually" is not a
  // guarantee, and every mutation below depends on `snapshot` being the real
  // basket rather than the frozen empty one.
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Hydrates on first call rather than waiting for a subscriber.
 *
 * The web version could not do this — it had to return the empty snapshot until
 * an effect ran, or server HTML and the first client render would disagree.
 * Reading here instead is what makes the basket correct on frame one.
 */
export function getSnapshot(): CartSnapshot {
  hydrate();
  return snapshot;
}

/** Kept because `useSyncExternalStore` still takes it. Same value as above. */
export function getServerSnapshot(): CartSnapshot {
  return getSnapshot();
}

// --- mutations ---------------------------------------------------------
export function setQuantity(product: StoreProduct, quantity: number): void {
  // **Hydrate before reading.** Without this a mutation that lands before the
  // first render — "Order again" from a notification, say — starts from the
  // frozen empty snapshot, and the commit that follows persists that empty
  // basket over whatever was actually stored. The web could not hit this
  // because `subscribe` was the only way to reach a mutation; here `getSnapshot`
  // hydrates instead, and nothing guarantees it ran first.
  hydrate();
  const clamped = Math.max(0, Math.min(Math.trunc(quantity), MAX_PER_ITEM));
  const current = snapshot.lines;

  if (clamped === 0) {
    commit(current.filter((line) => line.product.id !== product.id));
    return;
  }

  const exists = current.some((line) => line.product.id === product.id);
  commit(
    exists
      ? current.map((line) =>
          // Refresh the product snapshot too: if the catalogue reloaded with a
          // new price, show the newer one rather than the price from whenever
          // this item was first added.
          line.product.id === product.id ? { product, quantity: clamped } : line,
        )
      : [...current, { product, quantity: clamped }],
  );
}

export function addOne(product: StoreProduct): void {
  // Hydrate here too, not just inside `setQuantity`. This reads the snapshot to
  // work out what "one more" means, and that read happens *before* the call
  // below hydrates — so on the first cart mutation of a launch, before any
  // cart-reading component has rendered, `existing` came back undefined against
  // the frozen empty snapshot. A line stored with quantity 5 was then committed
  // back as 1, and the stored value was gone.
  hydrate();
  const existing = snapshot.lines.find((line) => line.product.id === product.id);
  setQuantity(product, (existing?.quantity ?? 0) + 1);
}

export function removeLine(productId: number): void {
  // Same reason as `setQuantity`: filtering the empty snapshot and committing
  // it would persist an empty basket over a stored one.
  hydrate();
  commit(snapshot.lines.filter((line) => line.product.id !== productId));
}

/**
 * Add several products at once — what "Order again" needs.
 *
 * One commit rather than a loop of `addOne`, which would write storage and
 * notify every subscriber once per item: a twelve-item repeat order would
 * re-render the whole grid twelve times and briefly show a basket that is
 * partly filled.
 *
 * Quantities *add* to what is already there, matching what a customer expects
 * when they repeat an order on top of a basket they had already started, and
 * each one is clamped to MAX_PER_ITEM so the merge can never produce a line the
 * server would reject.
 */
export function mergeLines(incoming: CartLine[]): void {
  if (incoming.length === 0) return;

  // See `setQuantity`: merging into an unhydrated snapshot would silently drop
  // the stored basket, which on this path means a repeat order replacing a
  // basket the customer had already filled.
  hydrate();
  const merged = [...snapshot.lines];

  for (const line of incoming) {
    const quantity = Math.trunc(line.quantity);
    if (quantity <= 0) continue;

    const index = merged.findIndex((existing) => existing.product.id === line.product.id);
    if (index === -1) {
      merged.push({ product: line.product, quantity: Math.min(quantity, MAX_PER_ITEM) });
    } else {
      merged[index] = {
        // The incoming product snapshot wins: it was just fetched, so its price
        // is fresher than whatever was in the basket from an earlier visit.
        product: line.product,
        quantity: Math.min(merged[index].quantity + quantity, MAX_PER_ITEM),
      };
    }
  }

  commit(merged);
}

export function clearCart(): void {
  commit([]);
}
