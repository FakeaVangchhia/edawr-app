/**
 * The config cache refreshes on a timer, and the timer must actually cause a
 * refresh.
 *
 * `CONFIG_TTL_MS` is both the freshness window and the polling period, so a
 * tick lands a few milliseconds *inside* the window it is meant to reopen:
 * `isFresh()` is still true and the tick does nothing. Opening hours and the
 * manager's kill switch are then up to two periods stale, not one.
 */
import { render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { useStoreConfig } from './useStoreData';

const mockFetchStoreConfig = jest.fn();
jest.mock('@/lib/store-api', () => ({
  fetchStoreConfig: (...args: unknown[]) => mockFetchStoreConfig(...args),
}));

function Probe() {
  const config = useStoreConfig();
  return <Text>{config ? String(config.is_open) : 'none'}</Text>;
}

describe('useStoreConfig polling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFetchStoreConfig.mockReset();
    // A request that takes 5ms, like any real one does.
    mockFetchStoreConfig.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ is_open: true }), 5)),
    );
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('re-requests the config about once per TTL period', async () => {
    render(<Probe />);
    await waitFor(() => expect(mockFetchStoreConfig).toHaveBeenCalledTimes(1));

    // Ten TTL periods elapse. Opening hours and the kill switch are meant to be
    // no more than one period stale, so this is close to ten further requests.
    // A lower bound rather than an exact count, because each request takes a
    // few milliseconds and that drift accumulates across the run.
    for (let i = 0; i < 10; i += 1) {
      await jest.advanceTimersByTimeAsync(60_000);
    }

    // Grid-anchored scheduling skipped every second tick and managed 6.
    expect(mockFetchStoreConfig.mock.calls.length).toBeGreaterThanOrEqual(10);
  });
});
