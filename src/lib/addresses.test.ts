import { readStorage, resetStorage, seedStorage } from './test-storage';
import {
  addAddress,
  readAddresses,
  removeAddress,
  restoreAddress,
  selectAddress,
  selectedAddress,
  toDeliveryAddress,
  updateAddress,
} from './addresses';

/**
 * The address book, against real localStorage (jsdom provides it).
 *
 * The cases that matter are the ones where the selection and the list disagree:
 * deleting the selected entry, and reading back a stored selection that points
 * at an entry no longer in the book. Either one leaves checkout prefilling from
 * nothing while addresses are plainly on screen.
 *
 * Note these tests share one module-level store, so each starts by clearing
 * localStorage *and* writing through the module's own API to resync it.
 */

const KEY = 'edawr-addresses-v1';

const seed = () =>
  addAddress({ label: 'Home', line: 'Chaltlang Block C', city: 'Aizawl', landmark: '' });

beforeEach(() => {
  resetStorage();
  // The store caches its snapshot, so clearing storage alone would leave the
  // previous test's entries in memory. Removing them through the API resyncs.
  for (const entry of readAddresses().entries) removeAddress(entry.id);
});

describe('addAddress', () => {
  it('saves the entry and selects it', () => {
    const entry = seed();
    const book = readAddresses();

    expect(book.entries).toHaveLength(1);
    expect(book.selectedId).toBe(entry.id);
    expect(selectedAddress(book)).toEqual(entry);
  });

  it('selects each newly added address, which is what the customer meant', () => {
    seed();
    const work = addAddress({ label: 'Work', line: 'Zarkawt', city: 'Aizawl', landmark: '' });

    expect(readAddresses().selectedId).toBe(work.id);
  });

  it('gives every entry a distinct id', () => {
    const ids = [1, 2, 3].map(
      () => addAddress({ label: 'A', line: 'Somewhere', city: 'Aizawl', landmark: '' }).id,
    );
    expect(new Set(ids).size).toBe(3);
  });

  it('persists so the next launch sees it', () => {
    // The web called this "so another tab sees it" and asserted through a
    // cross-tab `storage` event. There is no second tab here; what the write
    // actually buys is surviving a relaunch, which is what this asserts.
    addAddress({ label: 'Home', line: 'Zarkawt, Aizawl', city: 'Aizawl', landmark: '' });

    jest.resetModules();
    const fresh = require('./addresses') as typeof import('./addresses');

    expect(fresh.readAddresses().entries).toHaveLength(1);
    expect(fresh.readAddresses().entries[0].label).toBe('Home');
  });
});

describe('removeAddress', () => {
  it('moves the selection when the selected entry is deleted', () => {
    const home = seed();
    const work = addAddress({ label: 'Work', line: 'Zarkawt', city: 'Aizawl', landmark: '' });
    selectAddress(work.id);

    removeAddress(work.id);

    const book = readAddresses();
    expect(book.entries.map((entry) => entry.id)).toEqual([home.id]);
    // The critical part: not left pointing at a deleted entry.
    expect(book.selectedId).toBe(home.id);
    expect(selectedAddress(book)).not.toBeNull();
  });

  it('leaves an unrelated selection alone', () => {
    const home = seed();
    const work = addAddress({ label: 'Work', line: 'Zarkawt', city: 'Aizawl', landmark: '' });
    selectAddress(home.id);

    removeAddress(work.id);

    expect(readAddresses().selectedId).toBe(home.id);
  });

  it('empties the selection along with the last entry', () => {
    const home = seed();
    removeAddress(home.id);

    const book = readAddresses();
    expect(book.entries).toEqual([]);
    expect(book.selectedId).toBeNull();
    expect(selectedAddress(book)).toBeNull();
  });
});

describe('restoreAddress', () => {
  it('puts the entry back at its original position with its original id', () => {
    const home = seed();
    const work = addAddress({ label: 'Work', line: 'Zarkawt', city: 'Aizawl', landmark: '' });
    const shop = addAddress({ label: 'Shop', line: 'Bara Bazar', city: 'Aizawl', landmark: '' });

    removeAddress(work.id);
    restoreAddress(work, 1, shop.id);

    const book = readAddresses();
    // Back in the middle, not appended to the end, and the same id — which is
    // what makes an undo indistinguishable from never having deleted it.
    expect(book.entries.map((entry) => entry.id)).toEqual([home.id, work.id, shop.id]);
  });

  it('restores the selection that was in force before the deletion', () => {
    const home = seed();
    const work = addAddress({ label: 'Work', line: 'Zarkawt', city: 'Aizawl', landmark: '' });
    selectAddress(work.id);

    // Deleting the selected entry moves the selection to Home…
    removeAddress(work.id);
    expect(readAddresses().selectedId).toBe(home.id);

    // …and undoing puts it back on Work.
    restoreAddress(work, 1, work.id);
    expect(readAddresses().selectedId).toBe(work.id);
  });

  it('is a no-op when the id is already present, so a double undo is harmless', () => {
    const home = seed();
    removeAddress(home.id);

    restoreAddress(home, 0, home.id);
    restoreAddress(home, 0, home.id);

    expect(readAddresses().entries.map((entry) => entry.id)).toEqual([home.id]);
  });

  it('clamps an index that no longer fits the book', () => {
    const home = seed();
    const work = addAddress({ label: 'Work', line: 'Zarkawt', city: 'Aizawl', landmark: '' });
    removeAddress(work.id);

    // The book shrank since the deletion, so index 9 is past the end.
    restoreAddress(work, 9, work.id);

    expect(readAddresses().entries.map((entry) => entry.id)).toEqual([home.id, work.id]);
  });

  it('leaves a selection the customer changed while the toast was up', () => {
    const home = seed();
    const work = addAddress({ label: 'Work', line: 'Zarkawt', city: 'Aizawl', landmark: '' });
    const shop = addAddress({ label: 'Shop', line: 'Bara Bazar', city: 'Aizawl', landmark: '' });
    selectAddress(home.id);

    // Deleting an entry that was *not* selected leaves the selection alone…
    removeAddress(work.id);
    expect(readAddresses().selectedId).toBe(home.id);

    // …the customer then deliberately switches to Shop…
    selectAddress(shop.id);

    // …and undoes the deletion. Work comes back; the switch to Shop stands.
    // Reverting it here would prefill checkout with an address they had just
    // moved away from.
    restoreAddress(work, 1, home.id);

    const book = readAddresses();
    expect(book.entries.map((entry) => entry.id)).toEqual([home.id, work.id, shop.id]);
    expect(book.selectedId).toBe(shop.id);
  });

  it('falls back to a live selection when the remembered one is gone', () => {
    const home = seed();
    const work = addAddress({ label: 'Work', line: 'Zarkawt', city: 'Aizawl', landmark: '' });
    removeAddress(work.id);

    // Nothing in the book has this id any more.
    restoreAddress(work, 1, 'addr-vanished');

    const book = readAddresses();
    expect(book.selectedId).toBe(home.id);
    expect(selectedAddress(book)).not.toBeNull();
  });
});

describe('selectAddress', () => {
  it('ignores an id that is not in the book', () => {
    const home = seed();
    selectAddress('addr-does-not-exist');
    expect(readAddresses().selectedId).toBe(home.id);
  });
});

describe('updateAddress', () => {
  it('patches one entry and leaves the rest untouched', () => {
    const home = seed();
    const work = addAddress({ label: 'Work', line: 'Zarkawt', city: 'Aizawl', landmark: '' });

    updateAddress(home.id, { label: 'Parents' });

    const book = readAddresses();
    expect(book.entries.find((entry) => entry.id === home.id)?.label).toBe('Parents');
    expect(book.entries.find((entry) => entry.id === work.id)?.label).toBe('Work');
  });
});

describe('selectedAddress', () => {
  it('falls back to the first entry when the selection is stale', () => {
    // Exactly what a hand-edited or older-format localStorage value looks like.
    const book = {
      entries: [
        { id: 'a', label: 'Home', line: 'Somewhere', city: 'Aizawl', landmark: '' },
        { id: 'b', label: 'Work', line: 'Elsewhere', city: 'Aizawl', landmark: '' },
      ],
      selectedId: 'gone',
    };

    expect(selectedAddress(book)?.id).toBe('a');
  });

  it('is null for an empty book rather than throwing', () => {
    expect(selectedAddress({ entries: [], selectedId: null })).toBeNull();
  });
});

describe('toDeliveryAddress', () => {
  const base = { id: 'a', label: 'Home', line: 'Chaltlang Block C', city: 'Aizawl' };

  it('joins the line and the city', () => {
    expect(toDeliveryAddress({ ...base, landmark: '' })).toBe('Chaltlang Block C, Aizawl');
  });

  it('leaves the landmark out — the API has its own field for it', () => {
    const flattened = toDeliveryAddress({ ...base, landmark: 'Near the church' });
    expect(flattened).not.toContain('church');
  });

  it('does not leave a dangling comma when the city is blank', () => {
    expect(toDeliveryAddress({ ...base, city: '  ', landmark: '' })).toBe('Chaltlang Block C');
  });

  it('always clears the length the server requires of a real address', () => {
    // CheckoutSerializer.validate_customer_address wants eight characters.
    expect(toDeliveryAddress({ ...base, landmark: '' }).length).toBeGreaterThanOrEqual(8);
  });
});
