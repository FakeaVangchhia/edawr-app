import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { fetchRiderPosition } from '@/lib/store-api';
import type { RiderPosition } from '@/types';

/** A few seconds apart: the handset reports every fifteen, and a marker
 *  redrawn between reports is redrawn in the same place. */
const POLL_MS = 5_000;

export interface RiderPositionState {
  /** Where the rider is, or null while there is nothing to draw. */
  position: RiderPosition | null;
  /** False until the first answer has arrived. */
  loaded: boolean;
  /** Bumps the poll from an event handler. */
  refresh: () => void;
}

/**
 * The rider's position, polled while somebody is looking.
 *
 * A port of the storefront's `useRiderPosition`, with `AppState` standing in
 * for `visibilitychange` exactly as the order poll on the tracking screen
 * does. `active` is "the order is Dispatched" — outside that window the API
 * answers `null`, so the poll is not even started.
 *
 * Every `setState` here runs from a promise callback, a timer or an event,
 * never synchronously inside an effect.
 *
 * **This hook is the seam for a push source.** A Firebase listener, if one is
 * ever wired up, replaces the fetch-and-timer pair below and produces the same
 * `RiderPosition | null`; the screen above it does not change.
 */
export function useRiderPosition(token: string, active: boolean): RiderPositionState {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ token: string; position: RiderPosition | null } | null>(
    null,
  );

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();

    fetchRiderPosition(token, controller.signal)
      .then((position) => {
        if (controller.signal.aborted) return;
        setState({ token, position });
      })
      .catch(() => {
        // A failed poll is not news the customer can act on. The previous
        // answer stays on screen and ages visibly.
        if (controller.signal.aborted) return;
        setState((current) => current ?? { token, position: null });
      });

    return () => controller.abort();
  }, [token, active, tick]);

  useEffect(() => {
    if (!active) return;

    const refresh = () => setTick((value) => value + 1);
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      timer ??= setInterval(refresh, POLL_MS);
    };
    const stop = () => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    };

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        refresh();
        start();
      } else {
        stop();
      }
    });

    if (AppState.currentState === 'active') start();

    return () => {
      stop();
      subscription.remove();
    };
  }, [active]);

  const current = active && state?.token === token ? state : null;

  return {
    position: current?.position ?? null,
    loaded: current !== null,
    refresh: () => setTick((value) => value + 1),
  };
}
