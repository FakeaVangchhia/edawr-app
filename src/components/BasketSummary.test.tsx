/**
 * The bill, rendered.
 *
 * The storefront has no test like this — it has no `@testing-library/react` at
 * all, so `BasketSummary` was only ever covered indirectly through
 * `delivery.test.ts`. It is worth having here because this component is where a
 * money bug would actually reach a customer: every rule it enforces is about
 * *not* showing a number, and a component that shows the wrong one still
 * renders perfectly.
 *
 * Nothing here asserts arithmetic, because nothing here does arithmetic. Every
 * figure is read off the `BasketQuote` the server produced.
 */
import { render } from '@testing-library/react-native';

import { BillLines, FreeDeliveryNudge, MinimumOrderNotice } from './BasketSummary';
import type { BasketQuote, StoreConfig } from '@/types';

function quote(overrides: Partial<BasketQuote> = {}): BasketQuote {
  return {
    items_total: 124,
    delivery_fee: 15,
    handling_fee: 5,
    grand_total: 144,
    free_delivery_shortfall: 75,
    meets_minimum: true,
    unavailable: [],
    lines: [],
    delivery_type: 'instant',
    promised_minutes: 15,
    ...overrides,
  };
}

const CONFIG = { min_order_value: 49 } as StoreConfig;

describe('BillLines', () => {
  it('renders the four figures the server sent', async () => {
    const { getByText } = await render(<BillLines quote={quote()} />);

    expect(getByText('Item total')).toBeTruthy();
    expect(getByText('₹124.00')).toBeTruthy();
    expect(getByText('₹15.00')).toBeTruthy();
    expect(getByText('₹5.00')).toBeTruthy();
    // The total, and it is the server's `grand_total` — not 124 + 15 + 5
    // computed here, which is the whole point of the component.
    expect(getByText('₹144.00')).toBeTruthy();
  });

  it('shows an em dash, never "Free", before the quote arrives', async () => {
    // The distinction the web version's docblock calls out: an uncalculated fee
    // is *unknown*. Telling someone their delivery is free before the store has
    // said so is a promise the bill then breaks.
    const { getAllByText, queryByText } = await render(<BillLines quote={null} />);

    expect(getAllByText('—')).toHaveLength(4);
    expect(queryByText('Free')).toBeNull();
  });

  it('shows "Free" for a zero fee the server actually quoted', async () => {
    const { getByText } = await render(<BillLines quote={quote({ delivery_fee: 0 })} />);

    expect(getByText('Free')).toBeTruthy();
  });

  it('renders a zero total as money rather than as "Free"', async () => {
    // `emphasis` suppresses the Free wording. "To pay: Free" on a real order
    // reads as a gift; "₹0.00" reads as a figure worth querying, which it is.
    const { getByText } = await render(<BillLines quote={quote({ grand_total: 0 })} />);

    expect(getByText('₹0.00')).toBeTruthy();
  });

  it('always renders totals to two decimals', async () => {
    // A bill that says ₹62 next to a rider collecting ₹62.50 is an argument at
    // the door. `formatMoneyExact` exists for this.
    const { getByText } = await render(
      <BillLines quote={quote({ grand_total: 62.5, items_total: 62 })} />,
    );

    expect(getByText('₹62.50')).toBeTruthy();
    expect(getByText('₹62.00')).toBeTruthy();
  });
});

describe('FreeDeliveryNudge', () => {
  it('shows the shortfall the server calculated', async () => {
    const { getByText } = await render(<FreeDeliveryNudge quote={quote()} />);

    expect(getByText('₹75')).toBeTruthy();
  });

  it('says nothing once delivery is already free', async () => {
    // Otherwise it advertises an offer the customer has already earned.
    const { toJSON } = await render(
      <FreeDeliveryNudge quote={quote({ delivery_fee: 0, free_delivery_shortfall: 0 })} />,
    );

    expect(toJSON()).toBeNull();
  });

  it('says nothing when the fee is zero but a shortfall lingers', async () => {
    // The two fields can disagree mid-quote. Delivery being free is the fact
    // that decides, because that is what the customer would be reading.
    const { toJSON } = await render(
      <FreeDeliveryNudge quote={quote({ delivery_fee: 0, free_delivery_shortfall: 75 })} />,
    );

    expect(toJSON()).toBeNull();
  });

  it('says nothing before a quote exists', async () => {
    const { toJSON } = await render(<FreeDeliveryNudge quote={null} />);

    expect(toJSON()).toBeNull();
  });
});

describe('MinimumOrderNotice', () => {
  it('names the store minimum when the basket is short', async () => {
    const { getByText } = await render(
      <MinimumOrderNotice quote={quote({ meets_minimum: false })} config={CONFIG} />,
    );

    expect(getByText('₹49')).toBeTruthy();
  });

  it('stays quiet on an empty basket', async () => {
    // `items_total` of zero is a basket nobody has filled yet, not one that
    // falls short. Telling someone their empty basket is below the minimum is
    // scolding them for not having started.
    const { toJSON } = await render(
      <MinimumOrderNotice
        quote={quote({ meets_minimum: false, items_total: 0 })}
        config={CONFIG}
      />,
    );

    expect(toJSON()).toBeNull();
  });

  it('stays quiet once the minimum is met', async () => {
    const { toJSON } = await render(<MinimumOrderNotice quote={quote()} config={CONFIG} />);

    expect(toJSON()).toBeNull();
  });

  it('degrades to a phrase rather than a wrong number without config', async () => {
    const { getByText } = await render(
      <MinimumOrderNotice quote={quote({ meets_minimum: false })} config={null} />,
    );

    expect(getByText('the store minimum')).toBeTruthy();
  });
});
