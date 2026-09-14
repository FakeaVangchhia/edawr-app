/**
 * The customer's signed-in session, on this device.
 *
 * A bearer token in the OS keystore, replayed as `Authorization: Bearer <token>`
 * by `authRequest` in `api.ts`. Same shape as the storefront's `session.ts`, the
 * console's and the rider app's, and deliberately so — four clients storing a
 * credential four different ways is four places to get it wrong.
 *
 * **This is the one place the app is meaningfully safer than the website.** The
 * storefront keeps this token in localStorage and defends it with the CSP in
 * `proxy.ts` (`script-src 'strict-dynamic'` plus a per-request nonce), because
 * the storefront and the API are different registrable domains so an httpOnly
 * cookie would have to be a third-party one. None of that reasoning survives
 * the move to a phone: there is no document to inject script into and no CSP to
 * rely on, and `expo-secure-store` puts the token in the iOS Keychain or the
 * Android Keystore instead. So `backend: secureStorage` below is the whole
 * difference, and everything downstream of it is unchanged.
 *
 * What the token grants is worth stating, because it is what decides how hard
 * to protect it: read access to a customer's order history, which includes
 * their delivery address.
 *
 * The key matches the storefront's (`edawr-customer-v1`) but lives in this
 * app's own sandbox, so nothing collides — including with the rider app's
 * `edawr-rider-token` on a phone that has both installed.
 */

import { createLocalStore } from './local-store';
import { secureStorage } from './storage';

export interface CustomerSession {
  accessToken: string;
  id: number;
  phone: string;
  name: string;
  /** Whether the number has been proved, which gates older order history. */
  phoneVerified: boolean;
}

const store = createLocalStore<CustomerSession | null>({
  key: 'edawr-customer-v1',
  empty: null,
  backend: secureStorage,
  parse: (raw) => {
    if (typeof raw !== 'object' || raw === null) return null;
    const candidate = raw as Partial<CustomerSession>;
    // Strict on the two fields everything else depends on. A session with no
    // token cannot authenticate anything, and one with no id cannot be matched
    // to a row — either way, treating it as signed-out is the honest outcome,
    // and better than sending `Bearer undefined` on every request.
    if (typeof candidate.accessToken !== 'string' || !candidate.accessToken) return null;
    if (typeof candidate.id !== 'number' || !Number.isFinite(candidate.id)) return null;
    return {
      accessToken: candidate.accessToken,
      id: candidate.id,
      phone: typeof candidate.phone === 'string' ? candidate.phone : '',
      name: typeof candidate.name === 'string' ? candidate.name : '',
      phoneVerified: candidate.phoneVerified === true,
    };
  },
});

export const subscribeToSession = store.subscribe;
export const getSessionSnapshot = store.getSnapshot;
export const getSessionServerSnapshot = store.getServerSnapshot;
export const readSession = store.read;

export function saveSession(session: CustomerSession): void {
  store.write(session);
}

export function clearSession(): void {
  store.write(null);
}

/**
 * The token to send, or `''` when signed out.
 *
 * Read fresh on every request rather than captured once, so signing out in
 * another tab takes effect on this tab's next call instead of whenever it
 * happens to re-render.
 *
 * Note this leaves a malformed stored value on disk rather than deleting it —
 * `parse` returning null is enough to treat the customer as signed out, and the
 * next write overwrites it. The console's version removes the key instead; the
 * difference is deliberate and not worth reconciling.
 */
export function readToken(): string {
  return store.read()?.accessToken ?? '';
}
