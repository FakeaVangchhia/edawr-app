/**
 * Synchronous key-value storage — the React Native stand-in for `localStorage`.
 *
 * **Why synchronous matters.** Every store in `lib/` is read through
 * `useSyncExternalStore`, whose `getSnapshot` must return a value, not a
 * promise. `AsyncStorage` cannot satisfy that: backing these stores with it
 * would mean every one of them starts empty and fills in a tick later, which is
 * exactly the hydration race `hooks/useDraft.ts` was written to survive — and
 * it would put that race on the cart badge, the session and the address book
 * too. Every backend below reads synchronously, so none of them does.
 *
 * **Three backends, tried in order.** They are ranked by speed, and each is
 * probed with a real round-trip before it is accepted:
 *
 *   1. **MMKV** — a memory-mapped file, the fastest of the three, and what a
 *      dev client or a release build uses. Its native module is *not* part of
 *      Expo Go, so it is unavailable there.
 *   2. **`expo-sqlite/kv-store`** — SQLite behind a synchronous key-value API,
 *      bundled in Expo Go. Slower than MMKV and entirely fine at this size:
 *      the largest thing stored here is a basket. This is what makes Expo Go a
 *      usable test environment rather than one where every reload empties the
 *      cart and forgets every address.
 *   3. **Memory** — a `Map`, for Jest and for anywhere the first two fail.
 *      Nothing survives a reload, which is the correct degradation and never a
 *      crash.
 *
 * **The requires are lazy on purpose.** `react-native-mmkv` pulls in
 * `react-native-nitro-modules`, which throws at *module scope* when its native
 * half is missing. A static `import` of it would therefore take the whole app
 * down on launch in Expo Go, before any `try` around a call site could run —
 * the failure has to be caught around the require itself.
 *
 * **Two kinds of data, on purpose.** The session token is a credential and
 * lives in `expo-secure-store` (Keychain / Android Keystore); everything else
 * is a convenience and lives in whichever backend won above.
 * `SecureStore.getItem` and `setItem` are synchronous as of expo-secure-store
 * 15, which is what lets a credential sit behind the same interface as a list
 * of recent searches.
 *
 * The web storefront cannot do this — `session.ts` there argues at length for
 * localStorage because the storefront and API are on different registrable
 * domains so an httpOnly cookie is unavailable, and the defence is the CSP
 * nonce. None of that applies on a phone, and the OS keystore is strictly
 * better than what the browser can offer.
 *
 * **Every operation swallows.** A write can fail (a full disk, a locked
 * keystore) and a read can fail, and the storefront's contract is that neither
 * is worth an exception: a basket that cannot be persisted is still a usable
 * basket for this session. `recent-orders.ts` is the one caller that needs to
 * know a write failed, and it asks by checking the return value.
 */
import * as SecureStore from 'expo-secure-store';

export interface SyncStorage {
  getItem(key: string): string | null;
  /** `false` when the value did not reach the disk. Callers may ignore it. */
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
}

/**
 * Confirm a backend actually works before handing it the app's state.
 *
 * Presence of a module is not proof of a working native half: a require can
 * succeed against a JS shim whose first real call throws. So each candidate
 * writes a value, reads it back and deletes it. A backend that fails is
 * discarded in favour of the next, which is how Expo Go falls past MMKV
 * without anyone having to detect Expo Go by name — the environment is
 * identified by what it can do rather than by what it claims to be.
 */
function probe(candidate: SyncStorage): SyncStorage | null {
  const key = '__edawr_probe__';
  try {
    candidate.setItem(key, 'ok');
    const read = candidate.getItem(key);
    candidate.removeItem(key);
    return read === 'ok' ? candidate : null;
  } catch {
    return null;
  }
}

/** The fast path: a dev client or a release build. Absent in Expo Go. */
function createMmkvStorage(): SyncStorage | null {
  try {
    // Lazy, and inside the try, because the module throws on import when its
    // native half is missing. See the note at the top of this file.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    const store = createMMKV({ id: 'edawr-customer' });

    return probe({
      getItem: (key) => {
        try {
          return store.getString(key) ?? null;
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          store.set(key, value);
          return true;
        } catch {
          return false;
        }
      },
      removeItem: (key) => {
        try {
          store.remove(key);
        } catch {
          // Nothing to do. The value is either gone or unreachable, and both
          // read the same to every caller.
        }
      },
    });
  } catch {
    return null;
  }
}

/**
 * The Expo Go path: SQLite behind a synchronous key-value API.
 *
 * `expo-sqlite/kv-store` is the sync-capable sibling of AsyncStorage's
 * interface — `getItemSync` and friends are what make it usable here at all,
 * since an async read cannot satisfy `getSnapshot`. The module opens its
 * database file lazily on first access, so there is nothing to await and
 * nothing to initialise.
 */
function createKvStoreStorage(): SyncStorage | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = (require('expo-sqlite/kv-store') as { default: KvStore }).default;

    return probe({
      getItem: (key) => {
        try {
          return store.getItemSync(key) ?? null;
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          store.setItemSync(key, value);
          return true;
        } catch {
          return false;
        }
      },
      removeItem: (key) => {
        try {
          store.removeItemSync(key);
        } catch {
          // Same reasoning as MMKV's remove: unreachable and absent read the
          // same to every caller.
        }
      },
    });
  } catch {
    return null;
  }
}

interface KvStore {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): void;
}

/**
 * The last resort: Jest, web, or a device where both of the above failed.
 *
 * The app degrades to "nothing is remembered between launches", which is a
 * real store's job to fix and never a reason to fail on import.
 */
function createMemoryStorage(): SyncStorage {
  const memory = new Map<string, string>();
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
      return true;
    },
    removeItem: (key) => void memory.delete(key),
  };
}

/** Ordinary device-local state: the basket, addresses, profile, searches. */
export const storage: SyncStorage =
  createMmkvStorage() ?? createKvStoreStorage() ?? createMemoryStorage();

/**
 * The keystore, for the bearer token alone.
 *
 * SecureStore rejects keys containing anything but alphanumerics, `.`, `-` and
 * `_`, so the storefront's `edawr-customer-v1` passes as-is.
 */
export const secureStorage: SyncStorage = {
  getItem: (key) => {
    try {
      return SecureStore.getItem(key);
    } catch {
      // A locked or unavailable keystore reads as "not signed in", which is the
      // safe answer and the one the storefront's `parse` already handles.
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      SecureStore.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  removeItem: (key) => {
    try {
      // There is no synchronous delete, and there does not need to be: nothing
      // reads the token again in the same tick as a sign-out.
      void SecureStore.deleteItemAsync(key).catch(() => {});
    } catch {
      // Same reasoning as the setter — a sign-out must not be able to throw.
    }
  },
};
