import { describeRider, formatAge, formatDistance, riderDistanceKm } from './live-rider';
import type { RiderPosition } from '@/types';

const NOW = new Date('2026-09-17T12:00:00Z');

const rider = (overrides: Partial<RiderPosition> = {}): RiderPosition => ({
  latitude: 23.7372,
  longitude: 92.7178,
  heading: null,
  received_at: '2026-09-17T11:59:55Z',
  distance_km: 1.8,
  ...overrides,
});

const ME = { latitude: 23.7272, longitude: 92.7178 };

describe('formatDistance', () => {
  it('speaks in metres under a kilometre, rounded to fifty', () => {
    expect(formatDistance(0.42)).toBe('400 m away');
    expect(formatDistance(0.63)).toBe('650 m away');
  });

  it('speaks in kilometres with one decimal above it', () => {
    expect(formatDistance(1.84)).toBe('1.8 km away');
  });

  it('never says "0.0 km" for a rider at the door', () => {
    expect(formatDistance(0.02)).toBe('Right here');
  });
});

describe('formatAge', () => {
  it('rounds to the unit a person would use', () => {
    expect(formatAge(3)).toBe('Updated just now');
    expect(formatAge(42)).toBe('Updated 42 s ago');
    expect(formatAge(150)).toBe('Updated 3 min ago');
  });
});

describe('riderDistanceKm', () => {
  it('prefers the customer’s own fix over the address figure', () => {
    // ME is ~1.1 km due south of the rider; the address says 1.8.
    expect(riderDistanceKm(rider(), ME)).toBeCloseTo(1.11, 1);
  });

  it('falls back to the server’s figure, and keeps its null', () => {
    expect(riderDistanceKm(rider(), null)).toBe(1.8);
    expect(riderDistanceKm(rider({ distance_km: null }), null)).toBeNull();
  });
});

describe('describeRider', () => {
  it('describes a fresh fix with the address distance when nothing was shared', () => {
    const d = describeRider(rider(), null, NOW);
    expect(d.distance).toBe('1.8 km away');
    expect(d.direction).toBe('');
    expect(d.freshness).toBe('Updated just now');
    expect(d.stale).toBe(false);
  });

  it('uses the handset heading when there is one and no customer fix', () => {
    expect(describeRider(rider({ heading: 92 }), null, NOW).direction).toBe('Heading east');
  });

  it('describes where the rider is coming from once the customer has shared', () => {
    const d = describeRider(rider({ heading: 92 }), ME, NOW);
    expect(d.direction).toBe('Coming from the north');
    expect(d.distance).toBe('1.1 km away');
  });

  it('never shows an ETA-shaped string for an order without coordinates', () => {
    expect(describeRider(rider({ distance_km: null }), null, NOW).distance).toBe('On the move');
  });

  it('flags a fix older than the API’s own staleness gate', () => {
    const d = describeRider(rider({ received_at: '2026-09-17T11:58:00Z' }), null, NOW);
    expect(d.ageSeconds).toBe(120);
    expect(d.stale).toBe(true);
    expect(d.freshness).toBe('Updated 2 min ago');
  });

  it('treats a clock that is ahead of the server as "just now", not negative', () => {
    const d = describeRider(rider({ received_at: '2026-09-17T12:00:30Z' }), null, NOW);
    expect(d.ageSeconds).toBe(0);
  });
});
