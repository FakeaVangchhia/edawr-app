/**
 * Test environment setup.
 *
 * Two native modules have to be stubbed, and the reason is the same for both:
 * they are the synchronous storage this app is built on, and there is no native
 * runtime under Jest to provide them.
 *
 * `src/lib/storage.ts` already degrades to an in-memory Map when MMKV cannot be
 * constructed — that fallback exists for Expo Go and for exactly this. But it
 * only catches a constructor that *throws*, and requiring a Nitro module under
 * Jest fails at import time instead, so the module is mocked outright.
 *
 * The stubs are deliberately real implementations rather than `jest.fn()`
 * shells: the storage suites ported from the storefront assert round-tripping,
 * key isolation and the snapshot caching that `useSyncExternalStore` depends
 * on. Testing those against a mock that returns undefined would be testing the
 * mock — the mistake the storefront's own vitest config calls out when it
 * explains why it chose jsdom over a hand-rolled localStorage stub.
 *
 * **The backing maps hang off `globalThis`, and that is load-bearing.**
 * `jest.resetModules()` re-runs a mock factory, so a Map scoped to the closure
 * would be a *new* Map each time — and the tests use `resetModules` to simulate
 * relaunching the app. A relaunch that also wiped the disk would make
 * "persists across a reload" impossible to write truthfully. Device storage
 * outlives a relaunch; this is what makes the stub agree.
 *
 * The `mock` prefix on the names is not styling: Jest rejects a factory that
 * closes over any out-of-scope variable *except* one named that way, because
 * the usual version of this mistake is a factory reading a `const` that has not
 * been initialised yet.
 */

interface Backed {
  __mockMmkv__?: Map<string, string>;
  __mockKeychain__?: Map<string, string>;
}

function mockMmkvStore(): Map<string, string> {
  const host = globalThis as Backed;
  host.__mockMmkv__ ??= new Map<string, string>();
  return host.__mockMmkv__;
}

function mockKeychainStore(): Map<string, string> {
  const host = globalThis as Backed;
  host.__mockKeychain__ ??= new Map<string, string>();
  return host.__mockKeychain__;
}

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => mockMmkvStore().get(key),
    set: (key: string, value: string) => void mockMmkvStore().set(key, value),
    remove: (key: string) => mockMmkvStore().delete(key),
    clearAll: () => mockMmkvStore().clear(),
  }),
}));

jest.mock('expo-secure-store', () => ({
  getItem: (key: string) => mockKeychainStore().get(key) ?? null,
  setItem: (key: string, value: string) => void mockKeychainStore().set(key, value),
  deleteItemAsync: async (key: string) => void mockKeychainStore().delete(key),
}));

jest.mock('expo-crypto', () => ({
  // Collision-unlikely is the whole requirement — the idempotency key is not a
  // credential. See the note in `lib/checkout-attempt.ts`.
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 10),
}));

/**
 * Unmount between tests, explicitly.
 *
 * `@testing-library/react-native` registers this itself when it can, and this
 * line is belt-and-braces rather than a fix for anything observed — leaving
 * trees mounted across tests is the kind of thing that produces failures a long
 * way from their cause, and the cost of being sure is one import.
 *
 * It is **not** what makes the split between `ProductCard.test.tsx` and
 * `EtaChip.test.tsx` necessary; see the note at the top of the latter.
 */
import { cleanup } from '@testing-library/react-native';

afterEach(cleanup);
