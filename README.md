# eDawr — the customer app

The storefront, as a native app for iOS and Android. Expo SDK 54, React Native
0.81, expo-router, NativeWind.

It is a port of `../edawr-frontend`, not a second product: the same fifteen
screens, the same copy, the same design tokens, against the same Django API.
Where the two differ, the difference is forced by the platform and is written
down at the point it happens.

```bash
npm install
npx expo run:android      # or: npx expo run:ios
```

**Expo Go will not run this.** MMKV, push notifications and the new
architecture all need a dev client, so the first run has to be `expo run:*`.
After that, `npm start` attaches to it.

| Command | What it does |
|---|---|
| `npm start` | Dev server, for an installed dev client |
| `npm run android` / `npm run ios` | Build and install the dev client |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest — 263 tests, mostly ported from the storefront's vitest suites |

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
| **Toasts** | `sonner` has no React Native build, and `sonner-native` needs a newer `react-native-worklets` than SDK 54 pins. `components/ui/toast.tsx` is the same API in about a hundred lines. |
| **Push** | New. The web has no equivalent — see below. |

## Notifications

`src/push.ts`, modelled on `../mobile/src/push.ts`. The rider app solved this
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
