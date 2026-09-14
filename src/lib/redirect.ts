/**
 * Where a `next` parameter is allowed to send someone.
 *
 * The sign-in and sign-up screens take `next=<where they were>` so that
 * finishing returns the customer to the screen they asked for.
 *
 * Ported unchanged from `edawr-frontend/src/lib/redirect.ts`, but the reason it
 * matters shifts. On the web the parameter arrives in a URL, so it is
 * attacker-supplied by definition: a link to `/signin?next=https://not-edawr.example/`
 * would, the moment someone finished typing a real password, hand them a
 * convincing copy of this shop on somebody else's domain.
 *
 * A native app has no address bar to spoof, but it does have a deep link
 * scheme — `edawr://` — and anything that can open one can supply this
 * parameter. So the guard stays, and stays exactly as strict: expo-router
 * accepts a full URL where it accepts a path, which means an unchecked value
 * here could still push a WebView-shaped destination the customer did not ask
 * for.
 *
 * A leading `//` is the case worth naming, because it looks like a path and is
 * not: `//evil.example/x` is a protocol-relative URL.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}
