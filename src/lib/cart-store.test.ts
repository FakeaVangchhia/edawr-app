import { storage } from './storage';
import { resetStorage, seedStorage } from './test-storage';
import type { StoreProduct } from '@/types';

/**
 * The basket.
 *
 * `cart-store` holds module-level state, so every test re-imports it through
 * `jest.resetModules()` — otherwise the first test's basket leaks into the
 * second and the failures depend on file order.
 */
async function freshStore() {
  jest.resetModules();
  resetStorage();
  return require('./cart-store') as typeof import('./cart-store');
}

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: 1,
    name: 'Amul Taaza Milk',
    category: 'Dairy & Bread',
    brand: 'Amul',
    unit: '1 L',
    price: 62,
    mrp: 66,
    description: null,
    image_url: null,
    in_stock: true,
    low_stock: false,
    discount_percent: 6,
    ...overrides,
  };
}

/** `subscribe` is what triggers hydration, exactly as React would call it. */
function activate(store: Awaited<ReturnType<typeof freshStore>>) {
  return store.subscribe(() => {});
}

describe('cart store', () => {
  beforeEach(() => {
    resetStorage();
  });

  it('is empty, and already hydrated, when nothing is stored', async () => {
    const store = await freshStore();
    expect(store.getSnapshot().lines).toEqual([]);
    // True on the very first read, which the web version could not manage:
    // there it stayed false until an effect ran, because a snapshot that
    // disagreed with server-rendered HTML was a hydration mismatch. MMKV is
    // synchronous and there is no server render, so the cart badge never
    // flashes empty here.
    expect(store.getSnapshot().hydrated).toBe(true);
  });

  it('has the stored basket on the first frame, before anything subscribes', async () => {
    seedStorage('edawr-cart-v1', JSON.stringify([{ product: product(), quantity: 2 }]));
    jest.resetModules();
    const store = require('./cart-store') as typeof import('./cart-store');

    // No `activate(store)` — this is what React reads during the first render,
    // before it has called `subscribe` from an effect.
    expect(store.getSnapshot().lines).toHaveLength(1);
    expect(store.getSnapshot().hydrated).toBe(true);
  });

  it('returns a referentially stable snapshot between changes', async () => {
    // useSyncExternalStore compares snapshots by reference; a fresh object on
    // every call would re-render forever.
    const store = await freshStore();
    activate(store);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('adds an item and counts it', async () => {
    const store = await freshStore();
    activate(store);

    store.addOne(product());

    expect(store.getSnapshot().lines).toHaveLength(1);
    expect(store.getSnapshot().lines[0].quantity).toBe(1);
  });

  it('increments an existing line rather than duplicating it', async () => {
    const store = await freshStore();
    activate(store);

    store.addOne(product());
    store.addOne(product());

    expect(store.getSnapshot().lines).toHaveLength(1);
    expect(store.getSnapshot().lines[0].quantity).toBe(2);
  });

  it('caps quantity at the per-item limit', async () => {
    const store = await freshStore();
    activate(store);

    store.setQuantity(product(), 999);

    expect(store.getSnapshot().lines[0].quantity).toBe(store.MAX_PER_ITEM);
  });

  it('removes the line when quantity reaches zero', async () => {
    const store = await freshStore();
    activate(store);

    store.addOne(product());
    store.setQuantity(product(), 0);

    expect(store.getSnapshot().lines).toEqual([]);
  });

  it('refreshes the price snapshot when the catalogue reloads', async () => {
    const store = await freshStore();
    activate(store);

    store.addOne(product({ price: 62 }));
    store.setQuantity(product({ price: 70 }), 2);

    expect(store.getSnapshot().lines[0].product.price).toBe(70);
  });

  it('persists across a reload', async () => {
    const first = await freshStore();
    activate(first);
    first.addOne(product());

    // A new module instance is what a page reload looks like.
    jest.resetModules();
    const second = (require('./cart-store') as typeof import('./cart-store'));
    activate(second);

    expect(second.getSnapshot().lines).toHaveLength(1);
    expect(second.getSnapshot().hydrated).toBe(true);
  });

  it('ignores malformed storage rather than crashing', async () => {
    // This survives deploys, so it may have been written by an older version
    // with a different shape — or by hand.
    for (const junk of ['not json', '{"not":"an array"}', '[{"nope":true}]', '[null]']) {
      seedStorage('edawr-cart-v1', junk);
      jest.resetModules();
      const store = (require('./cart-store') as typeof import('./cart-store'));
      activate(store);
      expect(store.getSnapshot().lines).toEqual([]);
    }
  });

  it('drops lines with a non-positive quantity', async () => {
    seedStorage(
      'edawr-cart-v1',
      JSON.stringify([{ product: product(), quantity: 0 }]),
    );
    jest.resetModules();
    const store = (require('./cart-store') as typeof import('./cart-store'));
    activate(store);

    expect(store.getSnapshot().lines).toEqual([]);
  });

  it('notifies subscribers on change', async () => {
    const store = await freshStore();
    const listener = jest.fn();
    store.subscribe(listener);

    store.addOne(product());

    expect(listener).toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', async () => {
    const store = await freshStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    listener.mockClear();

    store.addOne(product());

    expect(listener).not.toHaveBeenCalled();
  });

  /*
   * Three cross-tab tests lived here on the web: picking up a basket another
   * tab changed, emptying when site data was cleared, and ignoring events for
   * other keys. All three pinned the `storage`-event listener, which this port
   * removed on purpose — a phone runs one process, so there is no second tab to
   * sync with and no event to receive. "Persists across a reload" above is what
   * still matters, and it is the case that actually happens here.
   */

  it('survives a storage write that fails', async () => {
    const store = await freshStore();
    activate(store);
    // The adapter swallows a failed write and reports `false`. Losing the
    // saved basket is survivable; crashing over it is not.
    jest.spyOn(storage, 'setItem').mockReturnValue(false);

    // Losing the saved basket is survivable; crashing the app is not.
    expect(() => store.addOne(product())).not.toThrow();
    expect(store.getSnapshot().lines).toHaveLength(1);
  });

  it('clears the basket', async () => {
    const store = await freshStore();
    activate(store);
    store.addOne(product());

    store.clearCart();

    expect(store.getSnapshot().lines).toEqual([]);
  });

  /**
   * `mergeLines` is what "Order again" commits. It runs against a basket the
   * customer may already have started, so the merge rules are the part worth
   * pinning down.
   */
  describe('mergeLines', () => {
    it('adds several products in a single notification', async () => {
      const store = await freshStore();
      let notifications = 0;
      store.subscribe(() => {
        notifications += 1;
      });
      // Subscribing is what triggers hydration, and hydration itself emits.
      // Only what `mergeLines` causes is being counted here.
      notifications = 0;

      store.mergeLines([
        { product: product({ id: 1 }), quantity: 2 },
        { product: product({ id: 2 }), quantity: 1 },
        { product: product({ id: 3 }), quantity: 4 },
      ]);

      expect(store.getSnapshot().lines).toHaveLength(3);
      // One commit, not one per item — three products must not re-render the
      // grid three times or briefly show a half-filled basket.
      expect(notifications).toBe(1);
    });

    it('adds to the quantity of something already in the basket', async () => {
      const store = await freshStore();
      activate(store);
      store.setQuantity(product({ id: 1 }), 3);

      store.mergeLines([{ product: product({ id: 1 }), quantity: 2 }]);

      expect(store.getSnapshot().lines).toEqual([
        { product: product({ id: 1 }), quantity: 5 },
      ]);
    });

    it('clamps a merged quantity to the per-item maximum', async () => {
      const store = await freshStore();
      activate(store);
      store.setQuantity(product({ id: 1 }), store.MAX_PER_ITEM);

      store.mergeLines([{ product: product({ id: 1 }), quantity: 5 }]);

      // The server rejects anything above its own limit, so the merge must not
      // be able to build a basket that fails at checkout.
      expect(store.getSnapshot().lines[0].quantity).toBe(store.MAX_PER_ITEM);
    });

    it('takes the incoming price for a product already in the basket', async () => {
      const store = await freshStore();
      activate(store);
      store.setQuantity(product({ id: 1, price: 62 }), 1);

      store.mergeLines([{ product: product({ id: 1, price: 70 }), quantity: 1 }]);

      // The incoming snapshot was just fetched; the basket's was not.
      expect(store.getSnapshot().lines[0].product.price).toBe(70);
    });

    it('ignores non-positive quantities rather than writing a dead line', async () => {
      const store = await freshStore();
      activate(store);

      store.mergeLines([
        { product: product({ id: 1 }), quantity: 0 },
        { product: product({ id: 2 }), quantity: -3 },
        { product: product({ id: 3 }), quantity: 1 },
      ]);

      expect(store.getSnapshot().lines).toEqual([
        { product: product({ id: 3 }), quantity: 1 },
      ]);
    });

    it('does nothing at all when handed an empty list', async () => {
      const store = await freshStore();
      let notifications = 0;
      store.subscribe(() => {
        notifications += 1;
      });
      notifications = 0;

      store.mergeLines([]);

      expect(notifications).toBe(0);
      expect(store.getSnapshot().lines).toEqual([]);
    });
  });
});
