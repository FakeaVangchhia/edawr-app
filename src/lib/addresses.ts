/**
 * The customer's address book, on this device only.
 *
 * There are no customer accounts in this system — `api/urls.py` has no customer
 * auth, and checkout takes `customer_address` as free text. So an address book
 * cannot be a server record; it is a convenience that stops someone retyping
 * where they live on every order.
 *
 * The consequence is worth stating plainly: **clearing site data loses these**,
 * and they do not follow the customer to another device. That is the honest
 * cost of a store with no sign-in, and it is why nothing here is presented as
 * an account.
 *
 * What the server receives is still just a string. `toDeliveryAddress` is what
 * flattens a saved entry into it, and it is the only place that formatting
 * decision lives.
 */

import { createLocalStore } from './local-store';

export interface SavedAddress {
  id: string;
  /** "Home", "Work" — what the customer calls it. */
  label: string;
  /** The address itself: house, street, locality. */
  line: string;
  city: string;
  /** Optional, and genuinely useful in Aizawl, where streets are not numbered. */
  landmark: string;
}

export interface AddressBook {
  entries: SavedAddress[];
  /** Which entry checkout should prefill from. */
  selectedId: string | null;
}

const EMPTY: AddressBook = Object.freeze({ entries: [], selectedId: null });

const isEntry = (value: unknown): value is SavedAddress =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as SavedAddress).id === 'string' &&
  typeof (value as SavedAddress).label === 'string' &&
  typeof (value as SavedAddress).line === 'string';

const store = createLocalStore<AddressBook>({
  key: 'edawr-addresses-v1',
  empty: EMPTY,
  parse: (raw) => {
    if (typeof raw !== 'object' || raw === null) return null;
    const candidate = raw as Partial<AddressBook>;
    if (!Array.isArray(candidate.entries)) return null;

    const entries = candidate.entries.filter(isEntry).map((entry) => ({
      id: entry.id,
      label: entry.label,
      line: entry.line,
      city: typeof entry.city === 'string' ? entry.city : '',
      landmark: typeof entry.landmark === 'string' ? entry.landmark : '',
    }));
    if (entries.length === 0) return EMPTY;

    // A selectedId pointing at an entry that no longer exists would leave
    // `selectedAddress` falling back silently while the UI shows a different
    // row highlighted. Repair it on read instead.
    const selectedId =
      typeof candidate.selectedId === 'string' &&
      entries.some((entry) => entry.id === candidate.selectedId)
        ? candidate.selectedId
        : entries[0].id;

    return { entries, selectedId };
  },
});

export const subscribeToAddresses = store.subscribe;
export const getAddressesSnapshot = store.getSnapshot;
export const getAddressesServerSnapshot = store.getServerSnapshot;
export const readAddresses = store.read;

/** The entry checkout prefills from, or null when the book is empty. */
export function selectedAddress(book: AddressBook): SavedAddress | null {
  if (book.entries.length === 0) return null;
  return book.entries.find((entry) => entry.id === book.selectedId) ?? book.entries[0];
}

function newId(): string {
  // Not a security boundary — it only has to be unique within one browser's
  // address book, and `crypto.randomUUID` is unavailable over plain HTTP on
  // some of the devices this store has to serve.
  return `addr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Saves a new address and selects it, which is always what the customer meant. */
export function addAddress(input: Omit<SavedAddress, 'id'>): SavedAddress {
  const book = store.read();
  const entry: SavedAddress = { ...input, id: newId() };
  store.write({ entries: [...book.entries, entry], selectedId: entry.id });
  return entry;
}

export function updateAddress(id: string, patch: Partial<Omit<SavedAddress, 'id'>>): void {
  const book = store.read();
  store.write({
    ...book,
    entries: book.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
  });
}

export function removeAddress(id: string): void {
  const book = store.read();
  const entries = book.entries.filter((entry) => entry.id !== id);
  store.write({
    entries,
    // Deleting the selected entry has to move the selection, or checkout
    // prefills from nothing while addresses are plainly on screen.
    selectedId: book.selectedId === id ? (entries[0]?.id ?? null) : book.selectedId,
  });
}

/**
 * Put a removed address back exactly where it was — what "Undo" needs.
 *
 * Not `addAddress(entry)`: that mints a new id, appends to the end and takes
 * the selection over. Undoing a deletion should leave the book indistinguishable
 * from before the deletion, so this restores the original id, the original
 * position, and the selection that was in force at the time.
 *
 * `index` is where the entry sat, and is clamped rather than trusted — the book
 * can have changed between the removal and the undo, and a splice past the end
 * would silently append.
 *
 * Restoring an id that is already present is a no-op. That makes a double undo
 * harmless, which matters because the toast that calls this outlives the click
 * that raised it.
 */
export function restoreAddress(
  entry: SavedAddress,
  index: number,
  selectedId: string | null,
): void {
  const book = store.read();
  if (book.entries.some((existing) => existing.id === entry.id)) return;

  const entries = [...book.entries];
  entries.splice(Math.max(0, Math.min(index, entries.length)), 0, entry);

  store.write({
    entries,
    // **Take the selection back only if the deletion is what moved it.**
    //
    // `removeAddress` touches `selectedId` in exactly one case: the entry being
    // deleted was the selected one. So that is the only case an undo should
    // touch it either.
    //
    // Restoring it whenever the old id merely still existed was wrong, and
    // wrong in a way that reached checkout. Home is selected, the customer
    // deletes Work, then — while the toast is still up — taps "Deliver here" on
    // Shop, then taps Undo. Work comes back, and the selection silently snapped
    // from Shop to Home, so checkout prefilled an address they had just
    // deliberately moved away from. An undo may put back what the delete took;
    // it must not reach past that and revert a separate choice made since.
    selectedId:
      selectedId === entry.id ? entry.id : (book.selectedId ?? entry.id),
  });
}

export function selectAddress(id: string): void {
  const book = store.read();
  if (!book.entries.some((entry) => entry.id === id)) return;
  store.write({ ...book, selectedId: id });
}

/**
 * Flatten a saved address into the single string the API stores.
 *
 * The landmark is deliberately **not** folded in here: `CheckoutSerializer` has
 * its own `customer_landmark` field and the rider app shows it separately, so
 * concatenating it would bury the one line most likely to get the rider to the
 * right door.
 */
export function toDeliveryAddress(entry: SavedAddress): string {
  return [entry.line, entry.city]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}
