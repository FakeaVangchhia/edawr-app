# eDawr — the customer app

The storefront, as a native app for iOS and Android. Expo SDK 57, React Native
0.86, expo-router, NativeWind.

It is a port of `../edawr-frontend`, not a second product: the same fifteen
screens, the same copy, the same design tokens, against the same Django API.
Where the two differ, the difference is forced by the platform and is written
down at the point it happens.

```bash
npm install
npm start                 # then scan the QR with the Expo Go app
```

**Expo Go runs this.** It did not used to: MMKV's native module is not part of
Expo Go, and a static import of it crashed the app on launch before any
`try` could catch it. `src/lib/storage.ts` now requires its backends lazily and
picks the fastest one that survives a real write-read-delete probe — MMKV in a
dev client or a release build, `expo-sqlite/kv-store` in Expo Go, memory under
Jest. All three read synchronously, which is the one property the stores in
`lib/` cannot do without; see the note at the top of that file.

Expo Go is the only way to run this on a **physical iPhone from Windows** —
`expo run:ios` needs Xcode on macOS, and putting a custom build on an iPhone any
other way needs a paid Apple Developer account to sign it. What Expo Go costs
you is **remote push notifications**, which Expo removed from it in SDK 53.
`src/push.ts` already declines quietly in that case and the order tracker's
ten-second poll carries on, so nothing else is affected.

**Expo Go ships only the current SDK's runtime**, which puts a deadline on this
arrangement that the dev-client route does not have: when Expo releases SDK 58,
the App Store copy of Expo Go stops opening an SDK 57 project, and there is no
older build to fall back to on iOS — Apple serves one version. This app was
moved 54 → 57 for that reason. Anyone relying on Expo Go should expect to
track the SDK roughly annually, or move to a dev client and stop caring.

Use a dev client when you need push, or MMKV's speed under a profiler:

```bash
npx expo run:android      # or: npx expo run:ios (macOS only)
npm run start:dev-client
```

| Command | What it does |
|---|---|
| `npm start` | Dev server for Expo Go — the default |
| `npm run start:dev-client` | Dev server for an installed dev client |
| `npm run android` / `npm run ios` | Build and install the dev client |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest — 278 tests, mostly ported from the storefront's vitest suites |

## Pointing it at a backend

There is nothing to configure in development. `src/config.ts` follows the Expo
dev server back to your machine's LAN IP, which is what makes `npm start` work
on a real phone with no setup. Start the API on `0.0.0.0` so the phone can
reach it:

```bash
cd ../edawr-backend && uv run manage.py runserver 0.0.0.0:8000
```

For anything else, set `EXPO_PUBLIC_API_URL` — see `.env.example`, and the two
rules it documents rather than merely mentions: a loopback address is treated as
unset (a phone cannot reach your computer's localhost), and a **release build
refuses an `http://` URL outright**, because the customer's password and bearer
token would otherwise cross the network in plaintext.

Product images are a second, softer variable. `EXPO_PUBLIC_MEDIA_URL` is where
they are read from — the API stores relative paths (`/uploads/x.png`) and the
files themselves live in a Cloudflare R2 bucket. **Unset it falls back to the
API URL**, which is correct whenever the backend runs `UPLOAD_BACKEND=local`, so
development needs nothing here either. It is deliberately not held to the two
rules above: it carries no credentials, only pictures of groceries. The
storefront has the same variable under the `NEXT_PUBLIC_` prefix, and the
backend calls it `R2_PUBLIC_BASE_URL`; all three must agree.

A release build with no URL configured at all fails at startup with a screen
that says so. That is deliberate — see the long comment at the bottom of
`src/config.ts` for why it is a screen and not a throw.

## What is where

```
app/                    expo-router routes, one file per storefront page
src/lib/                the storefront's logic layer, ported
src/components/         the storefront's components, ported
src/theme.ts            design tokens as values, for what a className cannot reach
tailwind.config.js      the same tokens for NativeWind
src/config.ts           where the backend is
src/push.ts             notification registration
```

`app/` mirrors `edawr-frontend/src/app/` route for route, so a change on one
side has an obvious counterpart on the other.

## The rules this app inherits

**Money is never computed here.** The cart holds a display snapshot of prices;
every total comes from `/api/store/quote` and finally from the order the server
creates. The checkout request carries product ids, quantities and the customer's
details — no price, no fee, no total. Adding up line totals in TypeScript would
be a second pricing engine, and it would disagree with the server the first time
a fee changed.

**Only a 401 ends a session.** 403 means "we know who you are and this is not
yours", and clearing the token there would sign someone out of a screen they
merely lack rights to.

**Never set state synchronously inside an effect.** The storefront makes this a
lint error; the fix is structural rather than a suppression. Fetched data is
tagged with the query that produced it and the loading flag is *derived*. Every
async screen here follows it.

**Client validation may be looser than the server's, never stricter.** A rule
that rejects a customer the store would have served is worse than no rule, and
there is no way for them to argue with it.

## What differs from the storefront, and why

Each of these is commented where it happens; this is the index.

| | |
|---|---|
| **Storage** | `react-native-mmkv` behind `src/lib/storage.ts`, because `useSyncExternalStore` needs a *synchronous* `getSnapshot` and AsyncStorage cannot give one. The session token goes to `expo-secure-store` instead — the OS keystore, which is strictly better than the localStorage the web is stuck with. |
| **First frame** | The web's stores return empty until an effect runs, to match server-rendered HTML. There is no server render here and MMKV is synchronous, so the basket, session and address book are correct on frame one. The cart badge never flashes empty. |
| **Cross-tab sync** | Gone. One process, no second tab, no `storage` event. |
| **Location** | `navigator.geolocation` does not exist in React Native; `requestPosition` is rewritten onto `expo-location`. The contract is unchanged — **it resolves, never rejects** — and the maths around it is untouched. |
| **Connectivity** | `navigator.onLine` → NetInfo, which is better information. The asymmetry survives: false is a reliable "no connection", true only means "worth trying", and it drives a banner rather than gating a request. |
| **Store config** | The 60-second TTL gains an `AppState` listener, because a backgrounded app's `setInterval` is throttled and then stopped — which would reintroduce the exact stale-`is_open` failure the TTL exists to prevent. |
| **429** | `ApiError.isRateLimited` and `retryAfterSeconds` are new. Checkout is throttled to 12/hour and a shared mobile NAT in Aizawl makes that reachable; the storefront never had a case for it. |
| **Timeouts** | Hermes ships neither `AbortSignal.timeout` nor `AbortSignal.any`, so `composeSignal` in `lib/api.ts` builds the same thing by hand. |
| **Toasts** | `sonner` has no React Native build. `components/ui/toast.tsx` is the same API in about a hundred lines, plus a single `action` — the basket's "Clear all" is destructive and one tap, and both apps offer it back rather than leaving it final. **The second half of this reason has expired:** it used to read that `sonner-native` needed a newer `react-native-worklets` than SDK 54 pinned, and it did — 0.5.1 against a `>=0.6.1` peer. SDK 57 pins 0.10.1, so `sonner-native` would now install. The hundred lines stay because they are written, tested and doing the job, which is a different and weaker argument than the one it replaces. |
| **Sticky CTAs** | The web's tab bar is `position: fixed` and overlays the page, so cart and checkout lift their action bars by its height (`--tabbar-height`). Nothing overlays anything here: the root layout is a column — header, screen, `MobileNav` — so a screen's bottom edge already *is* the top of the tab bar and the CTAs sit at `bottom-0`. Copying the web's offset left the primary button floating in 68px of dead space. The `Toaster` is the exception that proves it: it is absolute against the whole window, outside that column, so it does have to clear the bar. |
| **Push** | New. The web has no equivalent — see below. |
| **Banner rail** | The web's carousel is a CSS scroll-snap rail whose active dot comes from an `IntersectionObserver`; there is neither here, so it is a `ScrollView` with `snapToInterval` and dot arithmetic in `onMomentumScrollEnd`. The desktop arrows are gone — every viewport here has a thumb — and the dots are decorative rather than buttons, because a 6px tap target is one nobody can hit. The banners are fetched by the screen instead of server-rendered, so a promos failure is caught per-call inside the `Promise.all` rather than taking the shop down with it. |
| **Banner scrim** | No CSS gradient in React Native. The navy fade the banner copy sits on is drawn with `react-native-svg`, the same answer `ImageFallback` already gives to the same problem. |
| **External banner links** | `Linking.openURL` instead of an `<a target="_blank">`. `promo-link.ts` is otherwise byte-identical, `newTab` included: there are no tabs, but the flag still separates a website (leaves the app) from `tel:`/WhatsApp (hands off and hands back), which is what words the button. |
| **Poll ribbon** | The web's rotated corner ribbon is trimmed by the card's `overflow: hidden`. React Native clips a transformed child unreliably across platforms, so the sticker keeps the "Tell us" eyebrow and drops the ribbon rather than shipping something flush on iOS and ragged on Android. |
| **Poll throttle copy** | Better here than on the web: `ApiError` carries `retryAfterSeconds` from the `Retry-After` header, so a 429 says "try again in about 3 minutes" rather than "in a little while". |
| **Crash route** | The storefront reads `location.pathname` and has to strip `/order/<token>` out of it by hand before reporting, because that token is the whole credential for the tracking page. `useSegments()` hands back the route *pattern* (`['order', '[token]']`), so nothing secret can reach the report here. It is read from a `RouteProbe` component rather than a hook in the root layout, because `useSegments()` subscribes to navigation and calling it up there would re-render the header, the nav and the Stack on every screen change. |

**The home screen is ported.** The carousel, the poll sticker, the wordmark and
the address street line all landed on 2026-09-16 and are indexed above. The one
item on the old pending list that is *not* here is the "Coming soon" row, and
that is because it is no longer on the storefront either — `ComingSoon.tsx` and
`lib/coming-soon.ts` were deleted in `e55cba9`. Porting it would have
reintroduced something removed on purpose.

(The "Slow" → "Saver" tier label is in both, because the label is server-sent
and only the fallback in `lib/delivery.ts` needed the word changed.)

## Notifications

`src/push.ts`, modelled on `../edawr-delivery/src/push.ts`. The rider app solved this
first and every defensive branch here is one it earned.

The difference is the audience, and it sets the importance: a rider is *given
work* by a notification, a customer is *told about work already under way*. So
the channel is `DEFAULT` rather than `MAX`, no sound plays in the foreground,
and only three transitions send at all — Packing, Dispatched, Delivered, plus a
failed delivery. `Ready` is an internal milestone, and `Cancelled` would either
tell someone what they just did or break bad news in a banner.

**A guest gets none of this.** Devices hang off `Customer`, so an order placed
without an account has nothing to attach a handset to and falls back to the
tracking screen's ten-second poll. Keying devices on a tracking token instead
would let anyone holding one subscribe somebody else's phone.

Two things have to be true before any of it works:

1. `eas init`, which writes `extra.eas.projectId` into `app.json`. Until then
   `push.ts` declines to register and logs why — a build with no project id is a
   working store that cannot be buzzed, which is a gap and not a failure.
2. `PUSH_ENABLED=true` on the backend, with FCM/APNs credentials uploaded.

The Android channel id is `orders`, and it **must** match `CHANNEL_ID` in
`edawr-backend/api/push.py`. A mismatch is silent: Android files the
notification under a default channel whose importance the customer may have
turned down months ago for something unrelated.

## Testing

`npm test`. The suites under `src/lib/` are the storefront's, ported — which is
the point: they encode the same invariants, so a regression in the port fails
the same test that would have caught it on the web.

Three things needed rewriting rather than porting, and each says so in place:
the cross-tab tests (no second tab to sync with), the server-snapshot tests (the
first-frame behaviour deliberately changed), and `requestPosition` (a different
API underneath).

`src/components/` adds what the storefront cannot test at all, having no
Testing Library: the add control and the bill. Those are the two places a
quantity or money bug reaches a customer rather than a log.

## Before shipping

```bash
npm run typecheck && npm test && npx expo-doctor
```

Then the four things a simulator will not tell you: **airplane mode** (offline
banner, no crash), **a 429** from the checkout throttle, **backgrounding for an
hour** (does the store still know it is closed?), and a **release build** —
`eas build --profile preview` — because the config guard is designed to fail
loudly there and only there.

## Maps

`react-native-maps`, because it is bundled in Expo Go: Apple Maps on iOS,
Google Maps on Android, no build step. Expo Go brings its own Google key. A
**release Android build** needs one of yours, or the map is a blank grey box:
set `GOOGLE_MAPS_ANDROID_API_KEY` as an EAS environment variable (Maps SDK for
Android, restricted to this package name and the signing SHA-1).
`app.config.js` passes it to the plugin so it never lands in `app.json`.
