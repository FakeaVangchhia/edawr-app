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

import Constants from 'expo-constants';

import { API_URL, configError } from '@/config';

/**
 * Which build this crash came from.
 *
 * This matters more here than on the web, and the reason is the same one the
 * docblock above gives: a bad web deploy is reverted in a minute, so every
 * browser is running the same bundle within the hour. A bad *build* sits on
 * customers' phones until the stores approve the next one, so several versions
 * are live at once and "which build?" is the first question about any crash.
 * The server has allowlisted `release` since the endpoint existed; nothing was
 * ever sending it.
 *
 * `version` + the native build number, because `1.0.0` alone stops
 * distinguishing anything the moment two builds ship under one marketing
 * version — which is the normal case when the fix is a JS change. Read from
 * `expoConfig` rather than `expo-application` so this adds no dependency and
 * still works in Expo Go, which is what the app runs in.
 */
const RELEASE = (() => {
  const config = Constants.expoConfig;
  const build = config?.ios?.buildNumber ?? config?.android?.versionCode;
  return [config?.version, build].filter(Boolean).join('+').slice(0, 64);
})();

/**
 * The screen the crash happened on, in route-pattern form.
 *
 * Kept in a module-level variable rather than read at report time because there
 * is no way to ask expo-router for the current route outside a hook, and a hook
 * in the root layout would re-render the whole app — header, nav and Stack — on
 * every navigation, to serve a field that is read only when something has
 * already gone wrong. `RouteProbe` in `app/_layout.tsx` writes it from an
 * effect; it renders nothing and is the only thing that re-renders.
 *
 * `useSegments()` yields the *pattern* — `['order', '[token]']`, not the token —
 * so unlike the storefront, which had to strip its own path, nothing secret can
 * reach this variable in the first place. That is worth preserving: the token in
 * `/order/<token>` is the whole credential for the tracking page and for
 * `POST /api/customer/orders/claim`.
 */
let currentRoute = '';

export function setReportedRoute(route: string): void {
  currentRoute = route;
}

/**
 * Caps every string before it goes on the wire.
 *
 * The server truncates anyway — `MAX_FIELD` and `MAX_STACK` in
 * `api/views/reports.py` — so everything past those caps is bandwidth spent to
 * be discarded on arrival. On Aizawl mobile data, from a phone that is already
 * in trouble, that is worth not spending.
 *
 * The web copies have a second, sharper reason: `keepalive` draws on a 64 KB
 * per-origin quota and drops the whole request when it is exceeded. There is no
 * `keepalive` here, so this half is purely the bandwidth.
 */
const MAX_FIELD = 2000;
const MAX_STACK = 8000;

function cap(value: string | undefined, limit: number): string | undefined {
  return value === undefined ? undefined : value.slice(0, limit);
}

export interface ClientErrorReport {
  /**
   * Which app. The server keeps the four apart in its log; `'customer'` is this
   * one, and matches what the rider app sends as `'rider'`.
   */
  client: 'customer';
  /**
   * The expo-router route the crash happened on, e.g. `/order/[token]`.
   * Filled in below from `setReportedRoute`; a caller may override it.
   */
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
      body: JSON.stringify({
        route: currentRoute,
        ...(RELEASE ? { release: RELEASE } : {}),
        ...report,
        // Capped after the spread, so a caller cannot get past it by passing a
        // longer one. `undefined` is dropped by JSON.stringify, so an absent
        // field stays absent rather than becoming null.
        message: cap(report.message, MAX_FIELD),
        stack: cap(report.stack, MAX_STACK),
      }),
    }).catch(() => {
      // The store is unreachable. That is very often *why* we are here, and on
      // Aizawl mobile data it is an ordinary condition besides.
    });
  } catch {
    // `fetch` itself can throw synchronously on a malformed URL — which is one
    // of the failure modes this exists to report, so it must not become one.
  }
}
