import { stubGlobal, unstubAllGlobals } from './test-globals';
import { reportClientError, setReportedRoute } from './report-error';

/**
 * The customer app's crash reporter, and the one property it must never lose.
 *
 * It runs from `componentDidCatch` in the root layout's error boundary. A
 * reporter that raises there turns one broken screen into a boundary that
 * cannot render, which in a release build is a crash to the home screen — the
 * exact outcome the boundary exists to prevent. Every branch below is a real
 * failure mode: a malformed API URL makes `fetch` throw synchronously before it
 * returns a promise, and an unreachable store makes it reject, which on Aizawl
 * mobile data is an ordinary condition rather than an exceptional one.
 *
 * Mirrors `edawr-frontend/src/lib/report-error.test.ts`.
 */

const fetchMock = jest.fn();

beforeEach(() => {
  stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  unstubAllGlobals();
  fetchMock.mockReset();
  setReportedRoute('');
});

const report = { client: 'customer' as const, message: 'boom', stack: 'at HomeScreen' };

describe('reportClientError', () => {
  it('does not throw when fetch throws synchronously', () => {
    fetchMock.mockImplementation(() => {
      throw new TypeError('Failed to parse URL');
    });

    expect(() => reportClientError(report)).not.toThrow();
  });

  it('does not throw, or reject, when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    expect(() => reportClientError(report)).not.toThrow();
    // Settle the rejection here, so an unhandled one fails this test rather
    // than becoming a warning nobody reads.
    await Promise.resolve();
  });

  it('returns nothing and awaits nothing', () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    expect(reportClientError(report)).toBeUndefined();
  });

  it('caps the fields before they go on the wire', () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    reportClientError({
      client: 'customer',
      message: 'm'.repeat(5_000),
      stack: 's'.repeat(20_000),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // The server truncates to exactly these. Everything past them is bandwidth
    // spent, from a phone already in trouble, to be discarded on arrival.
    expect(body.message).toHaveLength(2_000);
    expect(body.stack).toHaveLength(8_000);
  });

  it('sends the route pattern the probe last recorded', () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    // What `RouteProbe` writes: the expo-router *pattern*, so the tracking
    // token in `/order/<token>` — which is the whole credential for that page —
    // can never reach the log.
    setReportedRoute('/order/[token]');

    reportClientError(report);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.route).toBe('/order/[token]');
  });
});
