
import { storage } from './storage';
import { resetStorage, seedStorage } from './test-storage';
import {
  forgetOrder,
  readRecentOrders,
  recentOrdersArePersisted,
  rememberOrder,
  subscribeToRecentOrders,
  type RememberedOrder,
} from '@/lib/recent-orders';

/**
 * The customer's only record that an order was theirs.
 *
 * There is no account: possession of the tracking token is the whole
 * authorisation, and it is handed over exactly once. So the validation here is
 * not defensiveness for its own sake — an entry that survives a deploy with the
 * wrong shape used to reach the orders list and render "₹undefined".
 */

const STORAGE_KEY = 'edawr-recent-orders-v1';

const order = (overrides: Partial<RememberedOrder> = {}): RememberedOrder => ({
  token: 'tok-1',
  orderId: 1,
  placedAt: '2026-08-23T10:00:00Z',
  total: 240,
  itemCount: 3,
  ...overrides,
});

beforeEach(() => {
  resetStorage();
  // The module caches its snapshot and its hydration flag across tests in one
  // file, so each test writes through the public API rather than assuming a
  // fresh module.
  for (const entry of readRecentOrders()) forgetOrder(entry.token);
});

afterEach(() => {
  resetStorage();
  jest.restoreAllMocks();
});

describe('recent orders', () => {
  it('remembers an order', () => {
    rememberOrder(order());

    expect(readRecentOrders()).toHaveLength(1);
    expect(readRecentOrders()[0].token).toBe('tok-1');
  });

  it('puts the newest first', () => {
    rememberOrder(order({ token: 'a', orderId: 1 }));
    rememberOrder(order({ token: 'b', orderId: 2 }));

    expect(readRecentOrders().map((e) => e.token)).toEqual(['b', 'a']);
  });

  it('does not duplicate a token', () => {
    rememberOrder(order({ token: 'a' }));
    rememberOrder(order({ token: 'a', total: 999 }));

    expect(readRecentOrders()).toHaveLength(1);
    expect(readRecentOrders()[0].total).toBe(999);
  });

  it('keeps only the ten most recent', () => {
    for (let i = 0; i < 12; i += 1) {
      rememberOrder(order({ token: `t${i}`, orderId: i }));
    }

    expect(readRecentOrders()).toHaveLength(10);
    expect(readRecentOrders()[0].token).toBe('t11');
  });

  it('forgets one', () => {
    rememberOrder(order({ token: 'a' }));
    rememberOrder(order({ token: 'b' }));

    forgetOrder('a');

    expect(readRecentOrders().map((e) => e.token)).toEqual(['b']);
  });

  describe('validation', () => {
    /**
     * Write straight to storage, as an older build would have left it.
     *
     * The re-read has to go through the cross-tab `storage` path, because that
     * is the only public way to invalidate the module's cached snapshot — and
     * the listener for it is attached lazily, only while something is
     * subscribed. Dispatching without subscribing does nothing at all, which
     * makes every "expect it to be dropped" assertion here pass whether the
     * validation works or not.
     */
    /**
     * Write straight to storage, then read it back through a *fresh* module.
     *
     * The web dispatched a cross-tab `storage` event to invalidate the cached
     * snapshot; a phone has one process and no such event. Re-importing is the
     * closer analogue anyway — it is what relaunching the app does, and `parse`
     * only ever runs on that first un-hydrated read.
     */
    const seed = (value: unknown) => {
      seedStorage(STORAGE_KEY, JSON.stringify(value));
      jest.resetModules();
      const fresh = require('./recent-orders') as typeof import('./recent-orders');
      return fresh.readRecentOrders();
    };

    it('the seed helper actually replaces the snapshot', () => {
      // Guards the trap above: if `seed` silently does nothing, every drop
      // assertion below is vacuous. This one fails loudly instead.
      expect(seed([order({ token: 'seeded' })]).map((e) => e.token)).toEqual(['seeded']);
    });

    it('drops an entry missing the money fields', () => {
      // The regression: `token` and `orderId` were checked and the rest was
      // not, so a half-shaped entry rendered "₹undefined" and "undefined items"
      // rather than being dropped.
      expect(seed([{ token: 'a', orderId: 1 }])).toEqual([]);
    });

    it('drops an entry with a non-finite total', () => {
      // JSON.stringify turns NaN into null, which is not a number — but a
      // hand-edited or migrated value could be anything.
      expect(seed([{ ...order(), total: 'lots' }])).toEqual([]);
    });

    it('drops an entry with an empty token', () => {
      // An empty token would build the URL `/order/`, which is not the tracking
      // route at all.
      expect(seed([{ ...order(), token: '' }])).toEqual([]);
    });

    it('keeps the valid entries beside an invalid one', () => {
      expect(seed([order({ token: 'good' }), { token: 'bad', orderId: 2 }]).map((e) => e.token)).toEqual(['good']);
    });

    it('survives a non-array', () => {
      expect(seed({ not: 'an array' })).toEqual([]);
    });

    it('survives unparseable storage', () => {
      seedStorage(STORAGE_KEY, 'not json');
      jest.resetModules();
      const fresh = require('./recent-orders') as typeof import('./recent-orders');

      expect(fresh.readRecentOrders()).toEqual([]);
    });
  });

  describe('persistence failure', () => {
    it('reports a failed write instead of pretending', () => {
      // Private browsing and a full quota both throw. The in-memory snapshot is
      // still updated — losing the receipt should not crash the page mid-order
      // — but the list would then look remembered and empty itself on reload.
      // Saying so is the difference between a caveat and a mystery.
      // The adapter reports a failed write as `false` rather than throwing.
      // That return value is the whole mechanism behind
      // `recentOrdersArePersisted()`, which checkout reads to decide whether to
      // tell the customer to keep the order open.
      jest.spyOn(storage, 'setItem').mockReturnValue(false);

      rememberOrder(order({ token: 'a' }));

      expect(recentOrdersArePersisted()).toBe(false);
      expect(readRecentOrders()).toHaveLength(1);
    });

    it('reports success on an ordinary write', () => {
      rememberOrder(order({ token: 'a' }));

      expect(recentOrdersArePersisted()).toBe(true);
    });
  });
});
