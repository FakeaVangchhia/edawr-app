/**
 * The single place the backend URL appears.
 *
 * Everything that talks to Django goes through `request()`, so repointing the
 * app at a different backend is a one-variable change. Never hardcode a host in
 * a component.
 *
 * **The public calls stay public.** Customers now have accounts, so there are
 * two variants here: `request()` sends no token and is what the catalogue, the
 * quote and the tracking page use; `authRequest()` attaches one and is only for
 * `/api/customer/*` and `/api/auth/customer/*`.
 *
 * Explicitly *not* a goal: making `request()` attach a token whenever one
 * happens to exist. It would move every browsing customer out of the server's
 * anonymous rate-limit bucket and into their account's for no benefit, let a
 * bug in the session store break the catalogue for signed-in people only, and
 * erase the distinction between the calls that need an identity and the many
 * that do not. Checkout is the single public endpoint that opts in, and it does
 * so at its own call site in `store-api.ts` where the exception is visible.
 *
 * Staff traffic still belongs to `admin/`, which has its own client.
 *
 * Ported from `edawr-frontend/src/lib/api.ts`. Three things differ, all of them
 * forced by the runtime rather than chosen:
 *
 *   - The base URL comes from `config.ts` instead of `NEXT_PUBLIC_API_URL`,
 *     because a phone has to be able to find the dev machine on the LAN.
 *   - The timeout is hand-composed rather than `AbortSignal.timeout()` /
 *     `AbortSignal.any()`, which Hermes does not ship. See `composeSignal`.
 *   - 429 is surfaced, because this client can hit it: checkout is throttled to
 *     12/hour and the storefront simply never had a case for it.
 */
import { API_URL } from '@/config';

import { clearSession, readToken } from './session';

/**
 * Already trailing-slash-stripped by `config.ts`, and `''` when this build has
 * no usable backend — in which case `app/_layout.tsx` renders `ConfigErrorScreen`
 * and nothing here is ever called. Safe as a module constant for that reason;
 * the equivalent in `config.ts` is deliberately *not*, because it throws.
 */
export const API_BASE_URL = API_URL;

const isAbsoluteUrl = (value: string) => /^[a-z][a-z\d+\-.]*:\/\//i.test(value);

export const apiUrl = (path: string) => {
  if (!path) return API_BASE_URL || '';
  if (isAbsoluteUrl(path)) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};


/**
 * Where product images are read from. Unset, they resolve against the API,
 * which is correct while the backend runs UPLOAD_BACKEND=local.
 *
 * Read straight from the environment rather than through `config.ts`, unlike
 * API_URL: that module *throws* on a missing or insecure value, because a
 * build that cannot reach the API is a build that does nothing. This one has a
 * working fallback, so the same treatment would turn a routine omission into a
 * dead app.
 */
const MEDIA_BASE_URL =
  (process.env.EXPO_PUBLIC_MEDIA_URL || '').trim().replace(/\/+$/, '') || API_BASE_URL;

/**
 * Product and category images are stored as relative paths ("/uploads/x.png"),
 * so the hostname is never baked into the database. This puts one back.
 *
 * **Which host is the question this answers.** The API used to serve the files
 * itself off a mounted disk; they now live in a Cloudflare R2 bucket, and the
 * browser fetches them straight from it. The stored path did not change — the
 * R2 object key is that same path without its leading slash — so the whole
 * migration lands here, in which base gets prefixed.
 *
 * Absolute values pass through untouched: seeded placeholders on someone
 * else's CDN still work, and so would a future where the API returns whole
 * URLs.
 */
export const assetUrl = (path: string | null | undefined) => {
  if (!path) return '';
  if (isAbsoluteUrl(path)) return path;
  if (!MEDIA_BASE_URL) return path;
  return `${MEDIA_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

/**
 * A failed API call, carrying enough to render something useful.
 *
 * `payload` matters for checkout: a 409 comes back with an `unavailable` array
 * naming the items that ran out, and the cart uses it to mark exactly those
 * rows rather than showing a generic "something went wrong".
 */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: Record<string, unknown>;
  /**
   * Seconds to wait, from the server's `Retry-After` header. Null when absent
   * or unparseable — never guess a number, since telling someone to try again
   * in 60 seconds when the real answer is an hour is worse than saying nothing.
   */
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    status: number,
    payload: Record<string, unknown> = {},
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /**
   * True when the server does not know who the caller is.
   *
   * **The only condition that ends a session.** The backend is deliberate about
   * this split: 401 means "I do not know who you are", which is what should
   * make a client discard its stored token; 403 means "I know who you are and
   * you may not do this", which must leave the customer signed in. Conflating
   * them — as this getter used to — signs someone out of the whole storefront
   * the first time they touch something they merely lack rights to.
   */
  get isUnauthenticated() {
    return this.status === 401;
  }

  /** True when the caller is known and still not allowed. Never a sign-out. */
  get isForbidden() {
    return this.status === 403;
  }

  /** True when the request was fine but the world changed underneath it. */
  get isConflict() {
    return this.status === 409;
  }

  /**
   * True when the caller has been asked to slow down.
   *
   * A getter on `ApiError` rather than a separate error class, so that every
   * existing `instanceof ApiError` branch keeps working — a parallel type would
   * have to be added to each of them, and the one that got missed would render
   * a rate limit as an unexplained failure.
   *
   * The storefront has no equivalent because it never met one in practice. This
   * app can: `POST /api/store/orders` is throttled to 12/hour, keyed per
   * account for a signed-in customer and per IP otherwise, and a shared mobile
   * NAT in Aizawl makes the second case realistic.
   */
  get isRateLimited() {
    return this.status === 429;
  }

}

/** Thrown when the request never reached the server at all. */
export class NetworkError extends Error {
  constructor() {
    super('Could not reach the store. Check your connection and try again.');
    this.name = 'NetworkError';
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

/**
 * How long to wait before deciding the store is not going to answer.
 *
 * There was no timeout at all, and `fetch` has none of its own — a request to a
 * backend that accepts the connection and then stops responding hangs until the
 * browser gives up, which can be minutes. On the storefront that renders as a
 * spinner nobody can get out of. The rider app has had a 15s ceiling since it
 * was written; this matches it rather than inventing a second number.
 */
const TIMEOUT_MS = 15_000;

/** Attempts, not retries: 1 means "try once and give up". */
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 300;

/** Server-side failures that are worth trying again in a moment. */
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True for a request that can safely be sent twice.
 *
 * Only GET. A retried POST is the bug the backend's `Idempotency-Key` exists to
 * prevent — checkout writes an order and moves stock — and the two mechanisms
 * must not be confused for each other: the key makes a retry the *customer*
 * chooses safe, and this keeps the client from retrying on its own behalf.
 */
const isReplayable = (method: string | undefined) =>
  (method ?? 'GET').toUpperCase() === 'GET';

/**
 * One fetch wrapper for the whole app.
 *
 * Every error the backend can produce is `{"detail": "..."}` (enforced by
 * `api/exceptions.py`), so this reads that one field and throws an `ApiError`.
 * The alternative — checking `response.ok` at forty call sites — is how a
 * failed request ends up rendering as an empty list with no explanation.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const attempts = isReplayable(rest.method) ? MAX_ATTEMPTS : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await attemptRequest<T>(path, requestHeaders, body, rest);
    } catch (error) {
      lastError = error;

      // The caller cancelled — a changed search query, a navigation. Never a
      // reason to try again, and never a reason to wait.
      if (rest.signal?.aborted) throw error;

      const worthRetrying =
        error instanceof NetworkError ||
        (error instanceof ApiError && RETRYABLE_STATUSES.has(error.status));

      if (!worthRetrying || attempt === attempts) throw error;

      // Exponential, so a store that is briefly overloaded is not hammered by
      // every open tab retrying in lockstep.
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

/**
 * A signal that aborts on the caller's behalf *or* after `TIMEOUT_MS`.
 *
 * The storefront writes this as `AbortSignal.any([caller, AbortSignal.timeout(…)])`.
 * Hermes ships neither static, and polyfilling globals to get them back would
 * mean every other module silently depends on a shim loading first. Composing
 * one controller by hand is a dozen lines and has no such ordering hazard.
 *
 * `dispose` is not optional. Without it the timer keeps a reference to the
 * controller for the full fifteen seconds after a request that finished in
 * fifty milliseconds — which, on a search that fires per keystroke, is a
 * hundred live timers for no reason.
 */
function composeSignal(callerSignal: AbortSignal | null | undefined): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();

  const onTimeout = () => controller.abort(new Error('Request timed out.'));
  const timer = setTimeout(onTimeout, TIMEOUT_MS);

  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal) {
    // Already cancelled before we started — a keystroke that landed while the
    // previous request was still being set up.
    if (callerSignal.aborted) onCallerAbort();
    else callerSignal.addEventListener('abort', onCallerAbort);
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

async function attemptRequest<T>(
  path: string,
  requestHeaders: Headers,
  body: unknown,
  rest: Omit<RequestOptions, 'body' | 'headers'>,
): Promise<T> {
  // Composed rather than replacing the caller's signal: the search overlay
  // aborts its own in-flight request on every keystroke and must keep being
  // able to, while the timeout applies to every request whether the caller
  // thought about it or not.
  const { signal, dispose } = composeSignal(rest.signal);

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...rest,
      signal,
      headers: requestHeaders,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
  } catch (error) {
    // An aborted request is not a network failure — it is this app cancelling
    // its own work because the query changed. Laundering it into a NetworkError
    // means any caller that renders `error.message` without first re-checking
    // `signal.aborted` flashes "Could not reach the store" on every keystroke
    // of the debounced search. Re-throw so the abort stays recognisable.
    //
    // Note this checks the *caller's* signal, not the composed one: a timeout
    // also aborts, and a timeout is exactly the network failure this reports.
    if (rest.signal?.aborted) throw error;
    // fetch() rejects only on a network-level failure; an HTTP 500 resolves.
    throw new NetworkError();
  }

  // **The body is read under the same timeout and the same caller abort.**
  //
  // `dispose()` used to run in the `finally` of the fetch above, which fires
  // the moment the status line arrives — so it cleared the timer and detached
  // the caller's abort listener while the body was still in flight. A server
  // that sent headers and then stalled the body (a proxy dropping a cold start
  // mid-response) left the await below hanging forever with nothing left to
  // cancel it: exactly the hang TIMEOUT_MS exists to prevent, and it stranded
  // checkout on "Placing order…" with no way out but killing the app.
  //
  // One `finally` around everything after the fetch, so there is a single
  // disposal site that cannot be missed as this function grows.
  try {
    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await response.json().catch((error: unknown) => {
      // A body that is not JSON is ordinary — some error responses send none —
      // so a parse failure on its own reads as `null`. An *abort* is not
      // ordinary: the timeout fired, or the caller cancelled, while the body
      // was still arriving. Swallowing that into `null` would hand the caller a
      // successful-looking empty response instead of the failure that actually
      // happened. Same split as the fetch catch above.
      if (!signal.aborted) return null;
      if (rest.signal?.aborted) throw error;
      throw new NetworkError();
    });

    if (!response.ok) {
      // **401 only, and never from a bare catch.** A dropped connection, a CORS
      // misconfiguration and a blocked request all arrive as thrown errors too,
      // and deleting a valid token because the wifi went is how a customer gets
      // signed out on a train. This branch fires only when the server itself
      // said it does not recognise the credential.
      if (response.status === 401) {
        clearSession();
        onSessionExpired?.();
      }

      const detail =
        (payload && typeof payload.detail === 'string' && payload.detail) ||
        `Request failed (${response.status}).`;
      throw new ApiError(detail, response.status, payload ?? {}, retryAfter(response));
    }

    return payload as T;
  } finally {
    dispose();
  }
}

/**
 * `Retry-After`, in seconds, when the server sent a usable one.
 *
 * DRF sends an integer count of seconds on a throttled response. The HTTP date
 * form is legal too and is not handled: the backend never sends it, and half-
 * parsing a header is worse than not reading it.
 */
function retryAfter(response: Response): number | null {
  const raw = response.headers.get('Retry-After');
  if (!raw) return null;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/**
 * What to do when the server retires a session mid-use.
 *
 * A module-level hook rather than a callback threaded through every call site:
 * `AppShell` sets it once on mount, and the interceptor above can then react
 * from inside a request nobody was watching.
 */
let onSessionExpired: (() => void) | undefined;

export function setSessionExpiredHandler(handler: (() => void) | undefined): void {
  onSessionExpired = handler;
}

/**
 * `request()`, with the customer's bearer token attached.
 *
 * The token is read from storage on every call rather than captured once, so
 * signing out in another tab takes effect on this tab's next request.
 */
export function authRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = readToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return request<T>(path, { ...options, headers });
}
