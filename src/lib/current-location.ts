/**
 * "Where am I?" turned into a delivery address.
 *
 * On first launch the app asks for location once, and if the customer allows
 * it, saves the street they are standing on as the "Current location" entry in
 * the address book. Every other path keeps working without it: a customer who
 * declines types an address, exactly as before.
 *
 * Three things here, kept together because they share one status:
 *
 * - `locateCurrentAddress` — permission, fix, reverse geocode, save.
 * - a small in-memory store of where that got to, so the header ("Finding your
 *   location…") and the Addresses screen ("Open settings") show the same
 *   state without a provider.
 * - `runFirstLaunchLocate` — the once-per-install prompt.
 *
 * **Reverse geocoding is the phone's own**, `expo-location`'s
 * `reverseGeocodeAsync`: Android's built-in geocoder and Apple's on iOS. No
 * API key and no bill, and it works in Expo Go. What it returns in Aizawl is
 * usually a locality and a road, rarely a house number, so the located entry
 * is a starting point the customer finishes at checkout (house, landmark),
 * not a finished address.
 */
import * as Location from 'expo-location';
import { Linking } from 'react-native';

import { readAddresses, saveCurrentLocation, type SavedAddress } from './addresses';
import { requestPosition, type Coordinates } from './geolocation';
import { storage } from './storage';
import { isValidAddress } from './validation';

export type LocateStatus =
  /** Nothing has happened yet, or the customer has not asked. */
  | 'idle'
  | 'locating'
  | 'located'
  /** Declined, but the OS will show the prompt again if asked. */
  | 'denied'
  /** Declined for good: only the Settings app can turn it back on. */
  | 'blocked'
  /** Location services off, no fix in time, or no street for the fix. */
  | 'failed';

export interface LocateState {
  status: LocateStatus;
  /**
   * A fix whose street could not be read. The Addresses form attaches it to
   * the address the customer types, so the position is not thrown away just
   * because the geocoder had nothing to say.
   */
  pending: Coordinates | null;
}

const IDLE: LocateState = Object.freeze({ status: 'idle', pending: null });

let state: LocateState = IDLE;
const listeners = new Set<() => void>();

function set(next: Partial<LocateState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export const subscribeToLocate = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getLocateSnapshot = () => state;

/** Test seam: the store is module-level, so each test starts from idle. */
export function resetLocateState() {
  state = IDLE;
}

/**
 * The street line and city from a geocoder result, or null when it has no
 * street worth sending a rider to.
 *
 * Most specific first and without repeats: Android often returns the same
 * locality as `name`, `district` and `subregion`.
 */
export function formatPlacemark(
  place: Pick<
    Location.LocationGeocodedAddress,
    'name' | 'streetNumber' | 'street' | 'district' | 'subregion' | 'city'
  >,
): { line: string; city: string } | null {
  const city = place.city?.trim() || place.subregion?.trim() || '';
  const street = [place.streetNumber, place.street]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  const parts: string[] = [];
  for (const part of [place.name, street, place.district]) {
    const clean = part?.trim();
    if (!clean || clean === city) continue;
    // "12 Main Road" and a `name` of "Main Road" are the same thing.
    if (parts.some((seen) => seen.includes(clean) || clean.includes(seen))) continue;
    // A bare plus code or number is not something a rider can read.
    if (/^[0-9A-Z]{4,}\+[0-9A-Z]{2,}$/.test(clean) || /^\d+$/.test(clean)) continue;
    parts.push(clean);
  }

  const line = parts.join(', ');
  return isValidAddress(line) ? { line, city } : null;
}

/**
 * Ask (when `ask` and the OS still allows it), read a fix, and save it.
 *
 * Resolves on every path, like `requestPosition`: none of these is an error the
 * customer has to deal with, because typing an address always works.
 */
export async function locateCurrentAddress({
  ask,
}: {
  ask: boolean;
}): Promise<SavedAddress | null> {
  if (state.status === 'locating') return null;
  set({ status: 'locating' });

  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && ask && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) {
      set({ status: permission.canAskAgain ? 'denied' : 'blocked' });
      return null;
    }

    // Permission is settled, so this does not prompt; it brings the timeout.
    const { coords } = await requestPosition();
    if (!coords) {
      set({ status: 'failed' });
      return null;
    }

    let found: { line: string; city: string } | null = null;
    try {
      const [place] = await Location.reverseGeocodeAsync(coords);
      found = place ? formatPlacemark(place) : null;
    } catch {
      // No network, or a phone without a geocoder. The fix is still good.
    }

    if (!found) {
      set({ status: 'failed', pending: coords });
      return null;
    }

    const saved = saveCurrentLocation({ ...found, ...coords });
    set({ status: 'located', pending: null });
    return saved;
  } catch {
    set({ status: 'failed' });
    return null;
  }
}

/** Hand over the pending fix once, to the address it is being saved with. */
export function takePendingFix(): Coordinates | null {
  const pending = state.pending;
  if (pending) set({ pending: null });
  return pending;
}

/**
 * Send the customer to this app's page in Settings.
 *
 * For `blocked`, where asking again shows nothing. `useRelocateOnReturn`
 * notices when they come back with it switched on.
 */
export function openLocationSettings() {
  void Linking.openSettings().catch(() => {});
}

/**
 * Re-check silently after a trip to Settings. Never prompts.
 *
 * Called when the app returns to the foreground while `denied` or `blocked`.
 * If the customer switched location on, this locates them; otherwise the
 * status stays as it was.
 */
export async function relocateIfAllowed(): Promise<void> {
  if (state.status !== 'denied' && state.status !== 'blocked') return;
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.granted) await locateCurrentAddress({ ask: false });
  } catch {
    // Same as declining: the address form is right there.
  }
}

/** Set once the first-launch prompt has run, so it never runs again. */
export const FIRST_LAUNCH_KEY = 'edawr-location-onboarded-v1';

/**
 * The first-launch prompt. Runs at most once per install.
 *
 * Skipped, and marked done, for a customer who already has addresses: they
 * set up delivery before this existed, and a permission prompt they did not
 * ask for is not a welcome-back.
 */
export async function runFirstLaunchLocate(): Promise<SavedAddress | null> {
  if (storage.getItem(FIRST_LAUNCH_KEY)) return null;
  storage.setItem(FIRST_LAUNCH_KEY, new Date().toISOString());
  if (readAddresses().entries.length > 0) return null;
  return locateCurrentAddress({ ask: true });
}
