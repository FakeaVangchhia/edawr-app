/**
 * Test-only helpers for the storage adapter.
 *
 * The storefront's tests run against jsdom and reach for `window.localStorage`
 * directly — its vitest config explains why, and the reasoning holds: testing a
 * storage-backed store against a hand-rolled stub is testing the stub. There is
 * no `window` here, so these two functions are the equivalent seam, and they go
 * through the same `storage` object the library code uses rather than around
 * it.
 *
 * `resetStorage` is not a `clearAll` on the backend. Clearing the bytes leaves
 * every `createLocalStore` holding its cached, already-parsed snapshot — which
 * is the exact trap `customer-api.test.ts` documents on the web, where clearing
 * localStorage alone left the previous test's session attached to every
 * request. Callers that need a store to forget must also go through that
 * store's own API (`clearSession`, `clearCart`, and so on), and the tests do.
 */
import { secureStorage, storage } from './storage';

/** Every key the app writes. Listed rather than enumerated, because the
 *  adapter deliberately exposes no way to list keys — nothing in the app needs
 *  one, and a test helper is not a reason to add one. */
const KEYS = [
  'edawr-cart-v1',
  'edawr-addresses-v1',
  'edawr-profile-v1',
  'edawr-recent-searches-v1',
  'edawr-recent-orders-v1',
  'edawr-checkout-attempt-v1',
];

const SECURE_KEYS = ['edawr-customer-v1'];

export function resetStorage(): void {
  for (const key of KEYS) storage.removeItem(key);
  for (const key of SECURE_KEYS) secureStorage.removeItem(key);
}

/** Put a raw string under a key, to test how a store parses what it finds. */
export function seedStorage(key: string, value: string): void {
  storage.setItem(key, value);
}

/** Read a key back raw, to assert what a store actually wrote. */
export function readStorage(key: string): string | null {
  return storage.getItem(key);
}

/** The same, for the one store backed by the keystore. */
export function seedSecureStorage(key: string, value: string): void {
  secureStorage.setItem(key, value);
}
