import { resolveReorder } from './reorder';
import type { OrderItem, StoreProduct } from '@/types';

/**
 * Rebuilding a past order into a basket.
 *
 * The interesting cases are all about the gap between when the order was placed
 * and now: a product delisted, a product out of stock, a product renamed, a
 * price changed. `resolveReorder` is pure so each of those is a plain assertion
 * rather than a mocked fetch.
 */

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

function orderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 1,
    order_id: 1,
    product_id: 1,
    quantity: 2,
    name: 'Amul Taaza Milk',
    price: 62,
    mrp: 66,
    unit: '1 L',
    ...overrides,
  } as OrderItem;
}

describe('resolveReorder', () => {
  it('resolves every item when the catalogue still carries them', () => {
    const milk = product({ id: 1 });
    const bread = product({ id: 2, name: 'Britannia Bread' });

    const { lines, skipped } = resolveReorder(
      [orderItem({ product_id: 1, quantity: 2 }), orderItem({ product_id: 2, quantity: 1 })],
      [milk, bread],
    );

    expect(skipped).toEqual([]);
    expect(lines).toEqual([
      { product: milk, quantity: 2 },
      { product: bread, quantity: 1 },
    ]);
  });

  it('carries the live price, not the price the order was charged at', () => {
    // The whole reason this resolves against the catalogue instead of trusting
    // the order: a basket showing last week's price would disagree with the
    // quote the server is about to return.
    const dearer = product({ id: 1, price: 70 });

    const { lines } = resolveReorder([orderItem({ product_id: 1, price: 62 })], [dearer]);

    expect(lines[0].product.price).toBe(70);
  });

  it('skips a product that has been delisted since the order', () => {
    const { lines, skipped } = resolveReorder(
      [orderItem({ product_id: 99, name: 'Discontinued Biscuits' })],
      [product({ id: 1 })],
    );

    expect(lines).toEqual([]);
    expect(skipped).toEqual([{ name: 'Discontinued Biscuits', reason: 'delisted' }]);
  });

  it('skips a product that is out of stock, and says so separately', () => {
    const { lines, skipped } = resolveReorder(
      [orderItem({ product_id: 1 })],
      [product({ id: 1, in_stock: false })],
    );

    expect(lines).toEqual([]);
    expect(skipped).toEqual([{ name: 'Amul Taaza Milk', reason: 'unavailable' }]);
  });

  it('reports an out-of-stock item under its current name, not the recorded one', () => {
    const { skipped } = resolveReorder(
      [orderItem({ product_id: 1, name: 'Amul Milk (old packaging)' })],
      [product({ id: 1, name: 'Amul Taaza Milk', in_stock: false })],
    );

    expect(skipped[0].name).toBe('Amul Taaza Milk');
  });

  it('adds what it can and reports what it cannot, from one order', () => {
    const milk = product({ id: 1 });

    const { lines, skipped } = resolveReorder(
      [
        orderItem({ product_id: 1 }),
        orderItem({ product_id: 2, name: 'Sold Out Eggs' }),
        orderItem({ product_id: 99, name: 'Gone Forever' }),
      ],
      [milk, product({ id: 2, name: 'Sold Out Eggs', in_stock: false })],
    );

    expect(lines).toEqual([{ product: milk, quantity: 2 }]);
    expect(skipped).toEqual([
      { name: 'Sold Out Eggs', reason: 'unavailable' },
      { name: 'Gone Forever', reason: 'delisted' },
    ]);
  });

  it('returns nothing for an empty order rather than throwing', () => {
    expect(resolveReorder([], [product()])).toEqual({ lines: [], skipped: [] });
  });
});
