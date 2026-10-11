import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import {
  getLocateSnapshot,
  relocateIfAllowed,
  subscribeToLocate,
  type LocateState,
} from '@/lib/current-location';

/** Where locating the customer got to. Shared by the header and Addresses. */
export function useLocateState(): LocateState {
  return useSyncExternalStore(subscribeToLocate, getLocateSnapshot, getLocateSnapshot);
}

/**
 * Locate the customer when they come back from Settings with location on.
 *
 * Mounted once, at the root. `relocateIfAllowed` does nothing unless the last
 * attempt was declined, and never shows a prompt.
 */
export function useRelocateOnReturn(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void relocateIfAllowed();
    });
    return () => subscription.remove();
  }, []);
}
