/**
 * Who the customer is, on this device only.
 *
 * Not an account — there is no customer auth in this API and nothing here is
 * verified. It is the name and phone number the last order was placed with, so
 * the next order does not ask again. The rider needs a name to ask for and a
 * number to call; remembering them locally is the whole of it.
 *
 * Kept apart from `addresses.ts` because the two change on different occasions:
 * a phone number is set once, an address book is edited. One key per concern
 * also means a corrupt address book cannot take the customer's name with it.
 */

import { createLocalStore } from './local-store';

export interface Profile {
  name: string;
  phone: string;
}

const EMPTY: Profile = Object.freeze({ name: '', phone: '' });

const store = createLocalStore<Profile>({
  key: 'edawr-profile-v1',
  empty: EMPTY,
  parse: (raw) => {
    if (typeof raw !== 'object' || raw === null) return null;
    const candidate = raw as Partial<Profile>;
    return {
      name: typeof candidate.name === 'string' ? candidate.name : '',
      phone: typeof candidate.phone === 'string' ? candidate.phone : '',
    };
  },
});

export const subscribeToProfile = store.subscribe;
export const getProfileSnapshot = store.getSnapshot;
export const getProfileServerSnapshot = store.getServerSnapshot;
export const readProfile = store.read;

export function saveProfile(profile: Profile): void {
  store.write({ name: profile.name.trim(), phone: profile.phone.trim() });
}

export function clearProfile(): void {
  store.write(EMPTY);
}

/** True once there is enough here to prefill checkout with. */
export function hasProfile(profile: Profile): boolean {
  return profile.name.trim().length > 0 || profile.phone.trim().length > 0;
}
