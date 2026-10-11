import { checkoutBlocked, flaggedItems, parseUnavailable } from './unavailable';
import type { BasketQuote, UnavailableItem } from '@/types';

/**
 * Unavailable rows, and the gate on "Place order".
 *
 * The cases that matter are the ones where the button used to stay live while
 * the server was certain to refuse: a quote that already listed a sold-out
 * item, and a quote that never arrived at all.
 */

function quote(overrides: Partial<BasketQuote> = {}): BasketQuote {
  return {
    items_total: 150,
    delivery_fee: 15,
    handling_fee: 5,
    grand_total: 170,
    free_delivery_shortfall: 49,
    meets_minimum: true,
    unavailable: [],
    lines: [],
    delivery_type: 'instant',
    promised_minutes: 15,
    ...overrides,
  };
}

const milk: UnavailableItem = {
  product_id: 7,
  name: 'Amul Taaza Milk',
  reason: 'Out of stock.',
  available: 0,
};

const open = { storeClosed: false, outsideArea: false };

describe('parseUnavailable', () => {
  it('keeps well-formed rows untouched', () => {
    expect(parseUnavailable([milk])).toEqual([milk]);
  });

  it('drops rows without a numeric id or a name', () => {
    expect(
      parseUnavailable([{ product_id: '7', name: 'Milk' }, { product_id: 7 }, null, 'x', milk]),
    ).toEqual([milk]);
  });

  it('fills a missing reason and count rather than rendering undefined', () => {
    expect(parseUnavailable([{ product_id: 7, name: 'Milk' }])).toEqual([
      { product_id: 7, name: 'Milk', reason: 'Not available right now.', available: 0 },
    ]);
  });

  it('treats anything but an array as no rows', () => {
    expect(parseUnavailable(undefined)).toEqual([]);
    expect(parseUnavailable({ product_id: 7 })).toEqual([]);
  });
});

describe('flaggedItems', () => {
  it('uses the quote before checkout has been tried', () => {
    expect(flaggedItems([], quote({ unavailable: [milk] }))).toEqual([milk]);
  });

  it('prefers the refused checkout, which read stock under the lock', () => {
    const bread = { ...milk, product_id: 9, name: 'Bread' };
    expect(flaggedItems([bread], quote({ unavailable: [milk] }))).toEqual([bread]);
  });

  it('is empty with no quote and no refusal', () => {
    expect(flaggedItems([], null)).toEqual([]);
  });
});

describe('checkoutBlocked', () => {
  it('allows a priced, fillable basket at an open store', () => {
    expect(checkoutBlocked({ quote: quote(), flagged: [], ...open })).toBe(false);
  });

  it('blocks when the quote already lists an unavailable item', () => {
    const q = quote({ unavailable: [milk] });
    expect(checkoutBlocked({ quote: q, flagged: flaggedItems([], q), ...open })).toBe(true);
  });

  it('blocks without a quote, so no one confirms a bill they were not shown', () => {
    expect(checkoutBlocked({ quote: null, flagged: [], ...open })).toBe(true);
  });

  it('blocks below the minimum, when closed, and outside the area', () => {
    expect(checkoutBlocked({ quote: quote({ meets_minimum: false }), flagged: [], ...open })).toBe(
      true,
    );
    expect(checkoutBlocked({ quote: quote(), flagged: [], storeClosed: true, outsideArea: false }))
      .toBe(true);
    expect(checkoutBlocked({ quote: quote(), flagged: [], storeClosed: false, outsideArea: true }))
      .toBe(true);
  });
});
