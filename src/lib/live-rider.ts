/**
 * Turning a rider's position into sentences and a picture.
 *
 * Ported from `edawr-frontend/src/lib/live-rider.ts`, minus the radar the web
 * page draws � the sentences carry the same facts. Pure, so it is tested
 * without a device and the component that shows it stays a component. Everything here is *description*: nothing decides
 * anything, nothing is an ETA. Straight-line distance across Aizawl's ridges
 * says which side of town somebody is on, not how long they will be — the API
 * makes the same promise about `distance_km`, and this keeps it.
 */

import { bearingDegrees, compassPoint, haversineKm, type Coordinates } from '@/lib/geolocation';
import type { RiderPosition } from '@/types';

/** Past this, the page stops calling a fix "live". Matches the API's own gate. */
export const STALE_AFTER_SECONDS = 90;

export interface RiderDescription {
  /** "1.2 km away", "400 m away", or "On the move" when nobody knows. */
  distance: string;
  /**
   * "Coming from the north-east" when the customer has shared where they
   * stand; "Heading north" when only the handset's heading is known; empty
   * when neither is.
   */
  direction: string;
  /** "Updated just now" / "Updated 40 s ago". */
  freshness: string;
  /** Seconds since the server took the fix, floored at zero. */
  ageSeconds: number;
  stale: boolean;
}

/**
 * Distance for a person: metres under a kilometre, one decimal above it, and
 * nothing at all — rather than "0.0 km" — when the fix is on top of them.
 */
export function formatDistance(km: number): string {
  if (km < 0.05) return 'Right here';
  if (km < 1) return `${Math.round(km / 0.05) * 50} m away`;
  return `${km.toFixed(1)} km away`;
}

export function formatAge(ageSeconds: number): string {
  if (ageSeconds < 10) return 'Updated just now';
  if (ageSeconds < 60) return `Updated ${Math.round(ageSeconds)} s ago`;
  return `Updated ${Math.round(ageSeconds / 60)} min ago`;
}

/**
 * The distance to show: measured from where the customer is standing when they
 * have said, otherwise the server's figure from the delivery address. The
 * customer's own fix wins because it is the one they can check against the
 * window.
 */
export function riderDistanceKm(rider: RiderPosition, me: Coordinates | null): number | null {
  if (me) return haversineKm(me, rider);
  return rider.distance_km;
}

export function describeRider(
  rider: RiderPosition,
  me: Coordinates | null,
  now: Date = new Date(),
): RiderDescription {
  const received = Date.parse(rider.received_at);
  const ageSeconds = Number.isFinite(received)
    ? Math.max(0, (now.getTime() - received) / 1000)
    : 0;

  const km = riderDistanceKm(rider, me);

  let direction = '';
  if (me) {
    direction = `Coming from the ${compassPoint(bearingDegrees(me, rider))}`;
  } else if (rider.heading !== null) {
    direction = `Heading ${compassPoint(rider.heading)}`;
  }

  return {
    distance: km === null ? 'On the move' : formatDistance(km),
    direction,
    freshness: formatAge(ageSeconds),
    ageSeconds,
    stale: ageSeconds > STALE_AFTER_SECONDS,
  };
}
