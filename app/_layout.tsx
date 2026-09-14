/**
 * The root layout — the app's equivalent of `edawr-frontend/src/app/layout.tsx`.
 *
 * It does four things that file also does: loads Inter, mounts the chrome
 * (`AppShell`), mounts the toaster, and refreshes the stored session once on
 * launch. It additionally gates on `configError`, which the web has no
 * equivalent of because a misconfigured web deploy fails visibly at the first
 * request rather than shipping to a phone.
 *
 * The header and bottom nav live here rather than inside a tab navigator, so
 * they are present on all fifteen routes exactly as the web's `sticky` header
 * and `fixed` nav are. See the note at the top of `AppShell.tsx`.
 */
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader, MobileNav, OfflineBanner } from '@/components/AppShell';
import { SearchOverlay } from '@/components/SearchOverlay';
import { Toaster, toast } from '@/components/ui/toast';
import { ConfigErrorScreen, ErrorBoundary } from '@/ErrorBoundary';
import { configError } from '@/config';
import { setSessionExpiredHandler } from '@/lib/api';
import { refreshSession } from '@/lib/customer-api';
import { reportClientError } from '@/lib/report-error';
import { addOrderNotificationListener, registerForPushNotifications } from '@/push';
import { readSession, saveSession } from '@/lib/session';
import '../global.css';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  /**
   * Ready to paint — fonts loaded, *or* fonts failed.
   *
   * The error used to be discarded. `preventAutoHideAsync()` holds the splash
   * until `hideAsync()` is called, and that call was gated on `fontsLoaded`
   * alone; if `useFonts` rejected, the flag stayed false forever, the render
   * below returned `null` forever, and the customer sat on the splash screen
   * with no error boundary in reach and nothing reported. A dead app is a far
   * worse outcome than one rendered in the system font, which is all a font
   * failure actually costs.
   */
  const ready = fontsLoaded || fontError !== null;

  /**
   * Revalidate the stored session, and store the token it hands back.
   *
   * `GET /api/auth/customer/me` mints a *fresh* token on every call and copies
   * the session-start claim forward, so not saving the response is how a
   * signed-in customer silently expires after twelve hours. A failure is
   * swallowed on purpose: `api.ts` has already cleared the session if the
   * server said 401, and anything else — no signal on the walk to the shop —
   * must not sign someone out.
   */
  useEffect(() => {
    if (!readSession()) return;
    void refreshSession()
      .then((session) => {
        saveSession(session);
        // Only after the session is known good. Registering with a token the
        // server has already retired would 401, and `push.ts` would swallow it
        // — leaving a customer who looks signed in and is never notified.
        return registerForPushNotifications();
      })
      .catch(() => {});
  }, []);

  /**
   * Tapping a notification opens the order it is about.
   *
   * `push` rather than `replace`: the customer was somewhere, and back should
   * take them there. The token comes from the message payload, which crosses
   * Expo's servers — `push.ts` validates its shape before this ever sees it.
   */
  useEffect(
    () =>
      addOrderNotificationListener((trackingToken) => {
        router.push({ pathname: '/order/[token]', params: { token: trackingToken } });
      }),
    [router],
  );

  useEffect(() => {
    setSessionExpiredHandler(() => toast.error('You have been signed out.'));
    return () => setSessionExpiredHandler(undefined);
  }, []);

  const onReady = useCallback(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  if (configError !== null) {
    return <ConfigErrorScreen message={configError} />;
  }

  // Holding the splash rather than flashing a system-font frame first. Inter is
  // bundled, so this is a few frames, not a wait — and `ready` rather than
  // `fontsLoaded`, so a font that fails to load falls through to the app in the
  // system face instead of holding the splash forever.
  if (!ready) return null;

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaView edges={['top']} className="bg-background flex-1">
        <StatusBar style="dark" />
        <ErrorBoundary
          onError={(error, componentStack) =>
            reportClientError({
              client: 'customer',
              message: error.message,
              stack: componentStack || error.stack || '',
            })
          }
        >
          <View className="bg-background flex-1">
            <OfflineBanner />
            <AppHeader
              onOpenSearch={() => setSearchOpen(true)}
              onOpenAddresses={() => router.navigate('/addresses')}
            />

            <View className="flex-1">
              <Stack
                screenOptions={{
                  headerShown: false,
                  // The chrome above is already the app's frame; a second
                  // navigator header would sit under it.
                  contentStyle: { backgroundColor: '#FFFFFF' },
                }}
              />
            </View>

            <MobileNav />
          </View>

          <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
          <Toaster />
        </ErrorBoundary>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
