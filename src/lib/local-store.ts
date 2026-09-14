/**
 * The storage-backed external store, factored out.
 *
 * Ported from `edawr-frontend/src/lib/local-store.ts`. The pattern is not
 * negotiable in this codebase, for the reasons documented at length in
 * `cart-store.ts`:
 *
 *   1. **No state set synchronously inside an effect**, which is an error in
 *      the storefront (`react-hooks/set-state-in-effect`) rather than a style
 *      preference, and just as much of a bug here.
 *   2. One store, many subscribers, no provider and no prop drilling.
 *
 * The subtlety that makes or breaks it: `useSyncExternalStore` compares
 * snapshots **by reference**. A `getSnapshot` that parses JSON on every call
 * returns a new object each time, React sees a changed store on every render,
 * and the app loops forever. So the parsed value is cached in `snapshot` and
 * only replaced when something actually writes.
 *
 * ## What changed from the web version, and why
 *
 * **`getSnapshot` now hydrates.** On the web this returned `empty` until the
 * first `subscribe` ran in a post-mount effect, because localStorage is
 * unavailable during server rendering and a snapshot that disagreed with the
 * server's HTML is a hydration mismatch. There is no server here and MMKV reads
 * synchronously, so the first render can have the real value — which removes an
 * entire class of first-frame flicker: the cart badge no longer starts at zero,
 * and the tab bar no longer renders signed-out for a tick.
 *
 * `getServerSnapshot` is kept only because `useSyncExternalStore` still accepts
 * it and deleting it would mean touching every call site in `useStoreData.ts`
 * for no gain.
 *
 * **The `storage` event is gone.** It synchronised two browser tabs. A phone
 * has one process and no analogue, so there is nothing to listen for.
 */
import { storage, type SyncStorage } from './storage';

export interface LocalStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  read: () => T;
  write: (next: T) => void;
}

export interface LocalStoreOptions<T> {
  key: string;
  /** Returned before hydration and when parsing fails. */
  empty: T;
  /**
   * Anything in storage is untrusted input: it survives app updates, so it may
   * have been written by an older version of this code with a different shape.
   * Return `null` to fall back to `empty` rather than handing a broken value to
   * a component that will throw inside `.map()` during render.
   */
  parse: (raw: unknown) => T | null;
  /**
   * Which backend to persist in. Defaults to MMKV; `session.ts` passes the
   * keystore instead, because a bearer token is a credential and the rest of
   * this is convenience data.
   */
  backend?: SyncStorage;
}

export function createLocalStore<T>({
  key,
  empty,
  parse,
  backend = storage,
}: LocalStoreOptions<T>): LocalStore<T> {
  let snapshot: T = empty;
  let hydrated = false;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const decode = (raw: string | null): T => {
    if (!raw) return empty;
    try {
      return parse(JSON.parse(raw)) ?? empty;
    } catch {
      return empty;
    }
  };

  const read = (): T => {
    if (!hydrated) {
      hydrated = true;
      snapshot = decode(backend.getItem(key));
    }
    return snapshot;
  };

  const write = (next: T): void => {
    hydrated = true;
    snapshot = next;
    // The adapter swallows its own failures — a basket that cannot be persisted
    // is still a usable basket for this session.
    backend.setItem(key, JSON.stringify(next));
    emit();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: read,
    getServerSnapshot: read,
    read,
    write,
  };
}
