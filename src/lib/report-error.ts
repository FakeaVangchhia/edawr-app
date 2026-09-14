/**
 * Tell the backend that this app just broke.
 *
 * Until `POST /api/client-errors` existed there was nowhere to send this, and
 * the first anyone knew about a broken release was a phone call from the shop.
 * That matters more for an app than it did for the storefront: a bad web deploy
 * is reverted in a minute, whereas a bad build sits on customers' phones until
 * the stores approve the next one.
 *
 * Three properties matter more than completeness here, because this runs at the
 * exact moment the app is already failing:
 *
 * **It cannot throw.** A reporter that raises inside an error boundary turns
 * one broken page into a boundary that cannot render, and React's fallback for
 * that is a blank screen. Every failure path here is swallowed.
 *
 * **It cannot block.** Fire and forget. Nothing waits on it and nothing reads
 * its result.
 *
 * **It sends nothing it was not asked to.** The fields below are the allowlist
 * the server also enforces; in particular no cart contents, no address, no
 * phone number. An error report is not a place to discover you have shipped
 * customer data to a log.
 */

import { API_URL, configError } from '@/config';

export interface ClientErrorReport {
  /**
   * Which app. The server keeps the four apart in its log; `'customer'` is this
   * one, and matches what the rider app sends as `'rider'`.
   */
  client: 'customer';
  /** The expo-router route the crash happened on, e.g. `/order/[token]`. */
  route?: string;
  message?: string;
  stack?: string;
}

/**
 * Ported from `edawr-frontend/src/lib/report-error.ts`.
 *
 * Two web-isms are gone. `keepalive` existed because a browser cancels
 * in-flight requests on navigation; there is no equivalent here and RN's fetch
 * does not implement it anyway. `digest` was a Next.js server-rendering concept
 * and would always have been undefined.
 *
 * It reads `API_URL` from `config.ts` rather than going through `lib/api.ts`,
 * for the reason the rider app's version gives: `api.ts` retries, throws typed
 * errors and has a timeout, all of which are the wrong behaviour for a
 * best-effort report sent from inside a failure — and `config.apiUrl()` throws
 * when the build is the misconfigured one this might be reporting.
 */
export function reportClientError(report: ClientErrorReport): void {
  // Nowhere to send it. A build with no API URL is exactly the case that cannot
  // report itself, which is why `ConfigErrorScreen` states the problem on the
  // phone instead.
  if (configError !== null || !API_URL) return;

  try {
    void fetch(`${API_URL}/api/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    }).catch(() => {
      // The store is unreachable. That is very often *why* we are here, and on
      // Aizawl mobile data it is an ordinary condition besides.
    });
  } catch {
    // `fetch` itself can throw synchronously on a malformed URL — which is one
    // of the failure modes this exists to report, so it must not become one.
  }
}
