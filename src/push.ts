/**
 * Getting the phone to buzz when an order moves.
 *
 * Modelled closely on `mobile/src/push.ts` — the rider app solved this first
 * and every defensive branch below is one it earned. What differs is the
 * audience: a rider is *given* work by a notification, whereas a customer is
 * *told* about work already under way.
 *
 * That difference sets the importance. The rider's channel is `MAX`, because an
 * assignment should interrupt whatever is on screen. This one is `DEFAULT`: an
 * order moving from Packing to Ready is worth a quiet banner, and a shop that
 * pops a heads-up alert over someone's evening four times per delivery is a
 * shop whose notifications get switched off. The one exception is arrival, and
 * the server decides that, not this file.
 *
 * **Nothing here is load-bearing.** Every function returns quietly on every
 * failure: no permission, no project id, a simulator, an offline register call.
 * The tracking screen's ten-second poll still works. A notification is a prompt
 * to look at the app, never how the status arrives — so an error path here that
 * could throw would be a crash traded for a convenience. That is the same
 * contract `api/push.py` holds on the server side, for the same reason.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { forgetPushToken, registerPushToken } from './lib/customer-api';

/**
 * Must match `CHANNEL_ID` in `edawr-backend/api/push.py`, and `channelId` on the
 * messages it sends. A mismatch is silent: Android files the notification under
 * a default channel with whatever importance that channel has, which the
 * customer may have turned down months ago for something unrelated.
 */
const CHANNEL_ID = 'orders';

/**
 * How a notification behaves when it arrives while the customer is *in* the app.
 *
 * The banner stays, the sound does not. Someone watching the tracking screen
 * can already see the status change — the step list updates on the next poll —
 * so a sound would be the app telling them something they are looking at. The
 * banner is kept because they may be on a different screen entirely.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * The EAS project this build belongs to.
 *
 * `getExpoPushTokenAsync` needs it — Expo's push service uses it to work out
 * which credentials to send under. It is absent until somebody runs `eas init`,
 * which is why this is read defensively rather than asserted: a build with no
 * project id is a perfectly working store that cannot be notified, and it
 * should say so in a log rather than fail to start.
 */
function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/**
 * Give this channel its own Android importance setting.
 *
 * `DEFAULT` rather than the rider app's `MAX` — see the note at the top. A name
 * the customer can recognise in Settings is what lets them mute *this*
 * deliberately, which is a choice worth giving someone who did not ask to be
 * messaged.
 *
 * A no-op on iOS, where the equivalent is decided by the permission grant.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Order updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
    lightColor: '#F7A438',
    sound: 'default',
  });
}

/**
 * The Expo push token for this handset, or null with a reason logged.
 *
 * Null is a normal outcome, not an error, and there are three ways to get it:
 * a simulator (no APNs or FCM registration to make), no EAS project id, or the
 * customer said no.
 *
 * The permission is requested **only when `undetermined`**. The OS shows the
 * prompt once and answers from the stored decision afterwards, so asking again
 * achieves nothing; and a customer who declined has said so. Unlike the rider
 * app — where a phone is the working tool — this is asked for at all only
 * because a fifteen-minute promise is short enough that a banner is genuinely
 * more useful than opening the app.
 */
async function getExpoToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[push] no token: notifications need a physical device');
    return null;
  }

  const id = projectId();
  if (!id) {
    console.log('[push] no token: this build has no EAS project id (run `eas init`)');
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  // `granted` is false on iOS for a provisional grant, which still delivers —
  // `status` is the field that distinguishes "not yet asked" from "refused".
  const status =
    existing.status === 'undetermined'
      ? (await Notifications.requestPermissionsAsync()).status
      : existing.status;

  if (status !== 'granted') {
    console.log('[push] no token: notification permission is "' + status + '"');
    return null;
  }

  await ensureAndroidChannel();

  const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
  return token.data;
}

/**
 * The token this app last registered, so sign-out knows what to unregister.
 *
 * Module state rather than the keystore: it is not a credential, it is derived
 * from the handset in a fraction of a second, and a value that outlived the
 * process would be a stale token we tell the server to forget — possibly one
 * that now belongs to whoever signed in on this phone next.
 */
let currentToken: string | null = null;

/**
 * Register this handset against the signed-in customer. Call on every launch.
 *
 * Every launch rather than once, because Expo rotates a push token on
 * reinstall, on restore to a new phone, and across some native updates, and it
 * does not tell the server it did. The backend upserts on the token, so the
 * repeat costs one request and guarantees the row is never stale.
 *
 * **Only a signed-in customer can be registered**, which is a real limit worth
 * naming: a guest order has no account to attach a device to, so a guest gets
 * no notifications and falls back to the ten-second poll on the tracking
 * screen. Fixing that would mean keying devices on a tracking token, which
 * would let anyone holding a token subscribe someone else's phone to it.
 *
 * Swallows everything. A customer whose registration failed still has a working
 * app; one who got an unhandled rejection on launch does not.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    const expoToken = await getExpoToken();
    if (!expoToken) return;

    await registerPushToken(expoToken, Platform.OS === 'ios' ? 'ios' : 'android');
    currentToken = expoToken;
  } catch (error) {
    // Offline, permission revoked between the check and the call, an Expo
    // outage, or simply not signed in. All the same to the customer: no buzz,
    // everything else unchanged.
    console.log('[push] could not register this device', error);
  }
}

/**
 * Unregister at sign-out, so the next person on this handset is not notified
 * about somebody else's groceries.
 *
 * Expo delivers to a token, not to a session, so a token left registered keeps
 * buzzing for orders that are no longer this customer's. The server also claims
 * a token for whoever registered last, which covers the case where someone else
 * signs in; this covers the gap in between.
 *
 * **Must run before the session is cleared** — it needs a bearer token to
 * authenticate with. Same ordering constraint the rider app's sign-out has.
 */
export async function unregisterForPushNotifications(): Promise<void> {
  const expoToken = currentToken;
  currentToken = null;
  if (!expoToken) return;

  try {
    await forgetPushToken(expoToken);
  } catch (error) {
    console.log('[push] could not unregister this device', error);
  }
}

/**
 * The tracking token a notification refers to, if it carries one.
 *
 * The server puts it in the message's `data`, and it is what lets a tap open
 * the right order. Read defensively: the payload crosses Expo's servers and a
 * malformed one must not throw inside a notification handler.
 */
function trackingTokenFrom(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const token = (data as { tracking_token?: unknown }).tracking_token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/**
 * Run `onOpen` with a tracking token when a notification is tapped.
 *
 * Only the *response* listener, unlike the rider app which also listens for
 * arrival. The rider app refreshes its dashboard on arrival because the screen
 * behind the banner is a list that would otherwise be stale; here the tracking
 * screen already polls itself every ten seconds, so an arrival listener would
 * duplicate that. A tap is different — it is a request to go somewhere.
 *
 * Returns a teardown. The subscription must be removed on unmount or a re-mount
 * leaves the old one holding a callback closed over a dead router.
 */
export function addOrderNotificationListener(
  onOpen: (trackingToken: string) => void,
): () => void {
  const responded = Notifications.addNotificationResponseReceivedListener((response) => {
    const token = trackingTokenFrom(response.notification.request.content.data);
    if (token) onOpen(token);
  });

  return () => {
    responded.remove();
  };
}
