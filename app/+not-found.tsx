/**
 * The unmatched-route screen.
 *
 * Ported from `edawr-frontend/src/app/not-found.tsx`. It is reachable here in a
 * way it barely was on the web: a stale deep link, a notification for an order
 * whose token has since been reseeded, or a shared `edawr://` URL from an older
 * build. So it keeps the web's two exits rather than a single "go back".
 */
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { GUTTER } from '@/theme';

export default function NotFoundScreen() {
  return (
    <View
      className="bg-background flex-1 items-center justify-center py-16"
      style={{ paddingHorizontal: GUTTER }}
    >
      <View className="max-w-md items-center">
        <Text className="text-foreground num text-7xl font-semibold">404</Text>
        <Text className="text-foreground mt-4 text-2xl font-semibold">
          This screen doesn&apos;t exist
        </Text>
        <Text className="text-muted-foreground mt-2 text-center text-sm">
          What you are looking for has moved, or was never here. Everything you need is still a few
          minutes away.
        </Text>

        <View className="mt-8 flex-row flex-wrap justify-center gap-3">
          <Link href="/" asChild>
            <Pressable
              accessibilityRole="link"
              className="bg-primary h-12 items-center justify-center rounded-full px-7"
            >
              <Text className="text-primary-foreground text-sm font-semibold">Go home</Text>
            </Pressable>
          </Link>
          <Link href="/products" asChild>
            <Pressable
              accessibilityRole="link"
              className="border-border h-12 items-center justify-center rounded-full border px-7"
            >
              <Text className="text-foreground text-sm font-medium">Shop everything</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}
