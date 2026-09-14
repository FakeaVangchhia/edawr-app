/**
 * The chrome that surrounds every screen: offline banner, header, bottom nav.
 *
 * Ported from `edawr-frontend/src/components/AppShell.tsx`, following its
 * sub-`lg` branch throughout — the desktop footer, the horizontal nav and the
 * ⌘K hint are all gone, because a phone never rendered them.
 *
 * **Why this is a wrapper rather than expo-router's `Tabs`.** On the web the
 * header is `sticky top-0` and the nav is `fixed bottom-0`, so both are present
 * on all fifteen routes — including product, checkout and tracking, which are
 * not tabs. Modelling that with a tab navigator would mean declaring every
 * non-tab screen as a hidden tab. A Stack wrapped in this component reproduces
 * the web's structure exactly: fixed chrome, scrolling content between it.
 */
import { Link, usePathname, useRouter } from 'expo-router';
import {
  ChevronDown,
  Grid2X2,
  Home,
  MapPin,
  Package,
  Search,
  ShoppingBag,
  User,
} from 'lucide-react-native';
import { useSyncExternalStore } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pop } from '@/components/ui/motion';
import {
  getServerSnapshot as getCartServerSnapshot,
  getSnapshot as getCartSnapshot,
  subscribe as subscribeToCart,
} from '@/lib/cart-store';
import { selectedAddress } from '@/lib/addresses';
import { isTabActive, type TabKey } from '@/lib/nav';
import { useAddressBook, useIsOnline, useStoreConfig } from '@/hooks/useStoreData';
import { colors, GUTTER } from '@/theme';

function useCartCount(): number {
  const snapshot = useSyncExternalStore(subscribeToCart, getCartSnapshot, getCartServerSnapshot);
  return snapshot.lines.reduce((total, line) => total + line.quantity, 0);
}

/**
 * "You are offline."
 *
 * Above the header rather than over it, so it pushes the app down instead of
 * covering the search field — the storefront's placement, and the reason it is
 * a calm strip rather than a modal: on Aizawl mobile data losing signal is an
 * ordinary event, not an error.
 */
function OfflineBanner() {
  const online = useIsOnline();
  if (online) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      className="bg-destructive-soft px-4 py-2"
      style={{ paddingHorizontal: GUTTER }}
    >
      <Text className="text-destructive text-center text-sm font-medium">
        You are offline. Browsing still works, but orders cannot be placed until your connection is
        back.
      </Text>
    </View>
  );
}

/**
 * The storefront header lockup: the eDawr mark, then the name in real type.
 *
 * `assets/mark.png` is the amber "e" cut out of the master badge by
 * `edawr-frontend/scripts/generate-brand-assets.mjs`, which writes the same
 * file into this app — so the web header and this one are literally the same
 * pixels. Both used to draw a lucide <Zap> instead, because no logo file
 * existed to point at.
 *
 * The mark and not the whole badge for the same reason as on the web: the
 * badge's only content is the word "eDawr", and at 32pt that wordmark is
 * unreadable.
 */
function Logo() {
  return (
    <Link href="/" asChild>
      <Pressable accessibilityRole="link" accessibilityLabel="eDawr, home" className="flex-row items-center gap-2">
        <Image
          source={require('../../assets/mark.png')}
          style={{ width: 32, height: 32, borderRadius: 12 }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text className="text-foreground text-[17px] font-semibold">eDawr</Text>
      </Pressable>
    </Link>
  );
}

/**
 * "Deliver to …", the second header row.
 *
 * With no saved address this is deliberately *not* a plausible-looking
 * "Home · Aizawl" — it says "Add an address", because inventing a delivery
 * address the customer never gave is worse than an empty state.
 */
function LocationPicker({ onOpen }: { onOpen: () => void }) {
  const book = useAddressBook();
  const config = useStoreConfig();
  const saved = selectedAddress(book);

  if (!saved) {
    return (
      <Link href="/addresses" asChild>
        <Pressable
          accessibilityRole="link"
          className="flex-row items-center gap-2 self-start rounded-full px-3 py-2"
        >
          <MapPin size={16} color={colors.amber} />
          <View>
            <Text className="text-muted-foreground text-2xs">Deliver to</Text>
            <Text className="text-foreground text-[13px] font-medium">Add an address</Text>
          </View>
        </Pressable>
      </Link>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Deliver to ' + saved.label + ', ' + saved.city + '. Change address.'}
      onPress={onOpen}
      className="flex-row items-center gap-2 self-start rounded-full px-3 py-2"
    >
      <MapPin size={16} color={colors.amber} />
      <View>
        <Text className="text-muted-foreground text-2xs">Deliver to</Text>
        <Text className="text-foreground text-[13px] font-medium">
          {saved.label} · {saved.city || config?.store_city || ''}
        </Text>
      </View>
      <ChevronDown size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/** The pill in the header, with the badge that pops on every change. */
function CartButton() {
  const count = useCartCount();

  return (
    <Link href="/cart" asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={'Cart, ' + count + ' items'}
        className="bg-primary flex-row items-center gap-2 rounded-full px-4 py-2.5"
      >
        <ShoppingBag size={16} color={colors.primaryForeground} />
        {count > 0 ? (
          <Pop replayKey={count} className="bg-amber min-w-5 items-center rounded-full px-1.5">
            <Text className="text-amber-foreground num text-2xs font-semibold">{count}</Text>
          </Pop>
        ) : null}
      </Pressable>
    </Link>
  );
}

function AppHeader({ onOpenSearch, onOpenAddresses }: { onOpenSearch: () => void; onOpenAddresses: () => void }) {
  return (
    <View className="border-border/70 bg-background border-b">
      <View
        className="h-16 flex-row items-center gap-3"
        style={{ paddingHorizontal: GUTTER }}
      >
        <Logo />

        {/* A button that opens the overlay, not a text field — the same choice
            the web makes, so there is one search experience rather than two. */}
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search the store"
          onPress={onOpenSearch}
          className="border-border bg-surface ml-auto h-11 min-w-0 flex-1 flex-row items-center gap-3 rounded-full border px-4"
        >
          <Search size={16} color={colors.mutedForeground} />
          <Text numberOfLines={1} className="text-muted-foreground flex-1 text-sm">
            Search for groceries, snacks, household…
          </Text>
        </Pressable>

        <CartButton />
      </View>

      <View style={{ paddingHorizontal: GUTTER }} className="pb-2">
        <LocationPicker onOpen={onOpenAddresses} />
      </View>
    </View>
  );
}

/**
 * The bar's four entries: a key, where tapping goes, and how it looks.
 *
 * Search and Cart used to be here too, making six. Both are in `AppHeader`,
 * which is on screen at the same time on every route: the search field is the
 * widest thing in the top row and the cart pill with its badge ends it. So the
 * app showed two ways to search and two ways to reach the basket, permanently,
 * one screen apart. Six also exceeds what either platform's own bar does — iOS
 * and Android both top out at five — and these six were not even the same kind
 * of thing, which is why the old interface needed `action`, `badge` and
 * `activatable` flags to describe two entries that were not destinations.
 *
 * *Which routes light which tab* is not here — that is `lib/nav.ts`, shared
 * with the storefront and pinned by `nav.test.ts`, because the rule was
 * silently wrong in both apps. This file owns presentation; that one owns the
 * rule.
 */
const NAV_ITEMS: Array<{ key: TabKey; label: string; icon: typeof Home; href: string }> = [
  { key: 'home', label: 'Home', icon: Home, href: '/' },
  { key: 'categories', label: 'Categories', icon: Grid2X2, href: '/categories' },
  { key: 'orders', label: 'Orders', icon: Package, href: '/orders' },
  { key: 'account', label: 'Account', icon: User, href: '/account' },
];

function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="border-border/70 bg-background border-t"
      style={{ paddingBottom: Math.max(insets.bottom, 6) }}
    >
      <View className="h-14 flex-row items-stretch justify-around px-2">
        {NAV_ITEMS.map((item) => {
          const active = isTabActive(pathname, item.key);
          const Icon = item.icon;

          return (
            <Pressable
              key={item.key}
              accessibilityRole="link"
              accessibilityLabel={item.label}
              accessibilityState={active ? { selected: true } : undefined}
              // `navigate` rather than `push`: tapping Home from three
              // screens deep should return there, not stack a fourth copy.
              onPress={() => router.navigate(item.href)}
              className="min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-1"
            >
              <Icon size={20} color={active ? colors.amber : colors.mutedForeground} />
              <Text
                className={
                  'text-[11px] ' + (active ? 'text-foreground' : 'text-muted-foreground')
                }
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export { AppHeader, MobileNav, OfflineBanner, useCartCount };
