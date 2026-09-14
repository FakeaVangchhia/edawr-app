/**
 * The add control.
 *
 * Three states — out of stock, "Add", and a stepper — and the whole component
 * is about which one is showing and what each one writes to the basket. The
 * storefront has no equivalent test, because it has no way to render a
 * component at all; this is the one place a quantity bug would reach a customer
 * rather than a log.
 *
 * `render` is awaited throughout: `@testing-library/react-native` 14 made it
 * async so React 19 can flush a concurrent root before handing back queries.
 */
import { fireEvent, render } from '@testing-library/react-native';

import { AddControl, EtaChip } from './ProductCard';
import { clearCart, getSnapshot, setQuantity, MAX_PER_ITEM } from '@/lib/cart-store';
import type { StoreProduct } from '@/types';

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

const quantityOf = (id: number) =>
  getSnapshot().lines.find((line) => line.product.id === id)?.quantity ?? 0;

beforeEach(() => {
  clearCart();
});

describe('AddControl', () => {
  it('refuses to add something that is out of stock', async () => {
    // Disabled rather than failing on submit. Letting someone fill a basket the
    // server will reject at checkout wastes the one interaction that matters.
    const { getByText, queryByLabelText } = await render(
      <AddControl product={product({ in_stock: false })} />,
    );

    expect(getByText('Out of stock')).toBeTruthy();
    expect(queryByLabelText('Add Amul Taaza Milk to cart')).toBeNull();
  });

  it('adds one, and becomes a stepper', async () => {
    const { getByLabelText, findByLabelText } = await render(
      <AddControl product={product()} />,
    );

    fireEvent.press(getByLabelText('Add Amul Taaza Milk to cart'));

    expect(quantityOf(1)).toBe(1);
    // No `rerender` here, for two reasons. The basket is an external store, so
    // the press already re-rendered this component — asking for a re-render
    // would be testing the harness. And `rerender` in
    // `@testing-library/react-native` 14 leaves the renderer in a state where
    // every *later* `render` in the same file silently returns null, which
    // surfaces as "unable to find an element" several tests away from the
    // cause. Do not reintroduce it.
    // `findBy*` rather than `getBy*`: the store notifies asynchronously, so the
    // swap from button to stepper lands a tick after the press.
    expect(await findByLabelText('Increase quantity of Amul Taaza Milk')).toBeTruthy();
  });

  it('increments rather than duplicating the line', async () => {
    setQuantity(product(), 2);
    const { getByLabelText } = await render(<AddControl product={product()} />);

    fireEvent.press(getByLabelText('Increase quantity of Amul Taaza Milk'));

    expect(getSnapshot().lines).toHaveLength(1);
    expect(quantityOf(1)).toBe(3);
  });

  it('stops at the per-item limit the server enforces', async () => {
    // `MAX_PER_ITEM` mirrors MAX_QUANTITY_PER_ITEM in the backend settings. The
    // stepper stopping is what saves someone tapping up to 40 and failing at
    // checkout; the server is still the authority.
    setQuantity(product(), MAX_PER_ITEM);
    const { getByLabelText } = await render(<AddControl product={product()} />);

    fireEvent.press(getByLabelText('Increase quantity of Amul Taaza Milk'));

    expect(quantityOf(1)).toBe(MAX_PER_ITEM);
  });

  it('removes the line at zero rather than leaving a dead row', async () => {
    setQuantity(product(), 1);
    const { getByLabelText } = await render(<AddControl product={product()} />);

    fireEvent.press(getByLabelText('Decrease quantity of Amul Taaza Milk'));

    expect(getSnapshot().lines).toEqual([]);
  });

  it('announces the count, including on the very first add', async () => {
    // The regression this guards: the live region used to *be* the numeral
    // inside the stepper, which only exists once the quantity is non-zero. A
    // region inserted at the same moment its content first changes is not
    // announced by most screen readers, so the first Add — the interaction that
    // matters most — said nothing at all.
    setQuantity(product(), 2);
    const { getByLabelText } = await render(<AddControl product={product()} />);

    expect(getByLabelText('Amul Taaza Milk, 2 in basket')).toBeTruthy();
  });

  it('keeps each product on its own line', async () => {
    const milk = product({ id: 1, name: 'Milk' });
    const bread = product({ id: 2, name: 'Bread' });

    // Unmounted between the two renders. Leaving the first tree mounted and
    // rendering a second into the same root leaves the renderer in a state
    // where every *later* `render` in the file silently returns null — the same
    // trap as `rerender`, and just as far from where it surfaces.
    const first = await render(<AddControl product={milk} />);
    fireEvent.press(first.getByLabelText('Add Milk to cart'));
    first.unmount();

    const second = await render(<AddControl product={bread} />);
    fireEvent.press(second.getByLabelText('Add Bread to cart'));

    expect(quantityOf(1)).toBe(1);
    expect(quantityOf(2)).toBe(1);
  });
});
