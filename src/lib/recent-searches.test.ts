
import { storage } from './storage';
import { resetStorage, seedStorage } from './test-storage';
import {
  clearRecentSearches,
  getRecentSearchesServerSnapshot,
  readRecentSearches,
  rememberSearch,
  subscribeToRecentSearches,
} from '@/lib/recent-searches';

/**
 * The search overlay's shortcut list.
 *
 * Nothing depends on this data, so the tests are about the two things that can
 * still go wrong in front of a customer: a list that grows without bound, and a
 * stored value from an older build that reaches `.map()` during render.
 */

const STORAGE_KEY = 'edawr-recent-searches-v1';

beforeEach(() => {
  resetStorage();
  // The module caches its snapshot across the tests in one file, so reset
  // through the public API rather than assuming a fresh module.
  clearRecentSearches();
});

afterEach(() => {
  resetStorage();
  jest.restoreAllMocks();
});

describe('recent searches', () => {
  it('remembers a term', () => {
    rememberSearch('atta');

    expect(readRecentSearches()).toEqual(['atta']);
  });

  it('puts the newest first', () => {
    rememberSearch('atta');
    rememberSearch('milk');

    expect(readRecentSearches()).toEqual(['milk', 'atta']);
  });

  it('trims surrounding whitespace', () => {
    rememberSearch('  milk \n');

    expect(readRecentSearches()).toEqual(['milk']);
  });

  it('ignores a blank term', () => {
    rememberSearch('   ');

    expect(readRecentSearches()).toEqual([]);
  });

  it('moves a repeated term back to the front without duplicating it', () => {
    rememberSearch('atta');
    rememberSearch('milk');
    rememberSearch('atta');

    expect(readRecentSearches()).toEqual(['atta', 'milk']);
  });

  it('treats a differently cased term as the same one, keeping the new casing', () => {
    // Searching is case-insensitive, so two spellings of one term would show as
    // two entries that do exactly the same thing.
    rememberSearch('Atta');
    rememberSearch('ATTA');

    expect(readRecentSearches()).toEqual(['ATTA']);
  });

  it('keeps only the six most recent', () => {
    for (let i = 0; i < 8; i += 1) rememberSearch(`term-${i}`);

    expect(readRecentSearches()).toEqual([
      'term-7',
      'term-6',
      'term-5',
      'term-4',
      'term-3',
      'term-2',
    ]);
  });

  it('clears', () => {
    rememberSearch('atta');

    clearRecentSearches();

    expect(readRecentSearches()).toEqual([]);
  });

  it('has the stored searches on the first snapshot', () => {
    // The web asserted the empty value here, because a server snapshot that
    // disagreed with server-rendered HTML was a hydration mismatch. There is no
    // server render on a phone, so both accessors read through — which is what
    // stops the search screen showing an empty "Recent" list for a frame.
    rememberSearch('atta');

    expect(getRecentSearchesServerSnapshot()).toEqual(['atta']);
  });

  it('does not throw when the write fails', () => {
    // Private browsing and a full quota both throw. Losing a shortcut list
    // costs the customer nothing; crashing the overlay costs them the search.
    // The adapter swallows a failed write and reports it as `false` rather
    // than throwing — a full disk or a locked keystore must not be able to
    // crash the search overlay.
    jest.spyOn(storage, 'setItem').mockReturnValue(false);

    expect(() => rememberSearch('atta')).not.toThrow();
    expect(readRecentSearches()).toEqual(['atta']);
  });

  describe('validation', () => {
    /**
     * Write straight to storage, as an older build would have left it, then
     * read it back through a *fresh* module.
     *
     * The web dispatched a cross-tab `storage` event to invalidate the cached
     * snapshot. There is no such event on a phone, and re-importing is the
     * closer analogue anyway: it is exactly what relaunching the app does, and
     * `parse` only ever runs on that first un-hydrated read.
     *
     * It returns the value rather than mutating shared state, because the copy
     * of the module this file imported at the top would still answer from its
     * own cache.
     */
    const seed = (value: unknown): string[] => {
      seedStorage(STORAGE_KEY, JSON.stringify(value));
      jest.resetModules();
      const fresh = require('./recent-searches') as typeof import('./recent-searches');
      return fresh.readRecentSearches();
    };

    it('the seed helper actually replaces the snapshot', () => {
      // Guards the trap above: if `seed` silently does nothing, every drop
      // assertion here is vacuous. This one fails loudly instead.
      expect(seed(['seeded'])).toEqual(['seeded']);
    });

    it('drops the entries that are not non-empty strings', () => {
      expect(seed(['atta', 42, null, '', { term: 'milk' }, 'dal'])).toEqual(['atta', 'dal']);
    });

    it('caps a stored list that is too long', () => {
      expect(seed(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])).toEqual([
        'a', 'b', 'c', 'd', 'e', 'f',
      ]);
    });

    it('survives a non-array', () => {
      expect(seed({ not: 'an array' })).toEqual([]);
    });

    it('survives unparseable storage', () => {
      seedStorage(STORAGE_KEY, 'not json');
      jest.resetModules();
      const fresh = require('./recent-searches') as typeof import('./recent-searches');

      expect(fresh.readRecentSearches()).toEqual([]);
    });
  });
});
