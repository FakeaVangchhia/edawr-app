/**
 * The last few things this customer searched for.
 *
 * Purely a shortcut in the search overlay. Nothing depends on it, and it is the
 * one store here where losing the data costs the customer nothing at all.
 */

import { createLocalStore } from './local-store';

const MAX_REMEMBERED = 6;
const NONE: string[] = Object.freeze<string[]>([]) as string[];

const store = createLocalStore<string[]>({
  key: 'edawr-recent-searches-v1',
  empty: NONE,
  parse: (raw) => {
    if (!Array.isArray(raw)) return null;
    const terms = raw.filter(
      (term): term is string => typeof term === 'string' && term.length > 0,
    );
    return terms.length > 0 ? terms.slice(0, MAX_REMEMBERED) : NONE;
  },
});

export const subscribeToRecentSearches = store.subscribe;
export const getRecentSearchesSnapshot = store.getSnapshot;
export const getRecentSearchesServerSnapshot = store.getServerSnapshot;
export const readRecentSearches = store.read;

/** Most recent first, no duplicates, capped. */
export function rememberSearch(term: string): void {
  const trimmed = term.trim();
  if (!trimmed) return;
  const existing = store
    .read()
    .filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase());
  store.write([trimmed, ...existing].slice(0, MAX_REMEMBERED));
}

export function clearRecentSearches(): void {
  store.write(NONE);
}
