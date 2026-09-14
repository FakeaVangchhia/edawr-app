/**
 * Order history.
 *
 * Ported from `edawr-frontend/src/app/orders/OrdersPage.tsx`.
 *
 * Two sources, merged: the account's own orders when signed in, and the
 * tracking tokens this device remembers. Local-only rows are re-fetched for
 * their live status, because a remembered order that still says "Placed" three
 * hours later is worse than no status.
 *
 * **"Gone" and "we cannot reach the store" are shown differently**, and they
 * used to be the same word. Both took the same `.catch(() => null)` branch and
 * both rendered "Unavailable", so a backend outage looked exactly like ten
 * deleted orders — the single most alarming thing this screen could say, and in
 * that case not even true.
 */
import { Link } from 'expo-router';
import { ChevronRight, Loader2, Package, RotateCcw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/motion';
import { toast } from '@/components/ui/toast';
import { useRecentOrders, useSession } from '@/hooks/useStoreData';
import { ApiError } from '@/lib/api';
import { mergeLines } from '@/lib/cart-store';
import { mapWithLimit } from '@/lib/concurrency';
import { fetchMyOrders } from '@/lib/customer-api';
import { formatDateTime, formatMoneyExact } from '@/lib/format';
import { mergeOrderHistory } from '@/lib/order-history';
import { isLive, isStopped } from '@/lib/order-status';
import { buildReorder } from '@/lib/reorder';
import { trackOrder } from '@/lib/store-api';
import { GUTTER, colors } from '@/theme';
import type { TrackedOrder } from '@/types';

/** What we know about one remembered token after trying to fetch it. */
type OrderState = TrackedOrder | 'gone' | 'unreachable';

/** How many tracking requests to have in flight at once. See lib/concurrency.ts. */
const FETCH_CONCURRENCY = 3;

export default function OrdersScreen() {
  const remembered = useRecentOrders();
  const session = useSession();
  const [reordering, setReordering] = useState<string | null>(null);

  /**
   * The set of tokens this device remembers, as one string.
   *
   * It doubles as the cache key for the fetch below: `remembered` is a fresh
   * array reference on every render, so depending on it directly would re-fetch
   * forever, and tagging the result with it is what makes the loading flag
   * derivable instead of stored. The account id joins it for the same reason —
   * signing in or out has to re-run this, and the id is what changed.
   */
  const tokens = remembered.map((entry) => entry.token).join(',');
  const queryKey = (session?.id ?? 'guest') + ':' + tokens;
  const [fetched, setFetched] = useState<{
    key: string;
    server: TrackedOrder[];
    orders: Record<string, OrderState>;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    // One request for the whole account, when there is one. A signed-in
    // customer's history usually arrives entirely from here, and the per-token
    // requests below then have nothing left to do.
    //
    // A failure is not fatal: the remembered tokens are still fetchable, so an
    // account whose orders cannot be loaded degrades to what a guest would see
    // rather than to an error screen.
    const account = session
      ? fetchMyOrders(controller.signal).catch(() => [] as TrackedOrder[])
      : Promise.resolve([] as TrackedOrder[]);

    void account.then((server) => {
      if (controller.signal.aborted) return;

      const covered = new Set(server.map((order) => order.tracking_token));
      const outstanding = (tokens ? tokens.split(',') : []).filter((token) => !covered.has(token));

      // An empty list still resolves — the "no orders" state is a result, not a
      // pending one, and returning early here would leave it loading forever.
      return mapWithLimit(outstanding, FETCH_CONCURRENCY, (token) =>
        trackOrder(token, controller.signal)
          .then((order) => [token, order] as const)
          .catch((error: unknown) => {
            // A failed token never fails the whole list — one reseeded database
            // should not hide the orders that are still fine — but *why* it
            // failed decides what the customer is told. A 404 means the order
            // is genuinely gone; anything else means we could not ask.
            const gone = error instanceof ApiError && error.status === 404;
            return [token, gone ? 'gone' : 'unreachable'] as const;
          }),
      ).then((entries) => {
        if (controller.signal.aborted) return;
        setFetched({ key: queryKey, server, orders: Object.fromEntries(entries) });
      });
    });

    return () => controller.abort();
    // `tokens` and `session?.id` are both inside `queryKey`; listing it alone
    // keeps the effect keyed on exactly the string the result is tagged with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // Derived, not stored: results belong to the query that produced them.
  const current = fetched?.key === queryKey ? fetched : null;
  const orders = current?.orders ?? {};
  const loaded = current !== null;

  // One row per tracking token, server copies preferred. A local-only row is
  // kept rather than dropped: it is either a guest order from before the
  // account existed or one placed on this device while signed out, and losing
  // it would be losing the only record of it.
  const history = mergeOrderHistory(current?.server ?? [], remembered);

  const reorder = async (token: string) => {
    if (reordering) return;
    setReordering(token);
    try {
      const { lines, skipped } = await buildReorder(token);
      if (lines.length === 0) {
        toast.error('Nothing from that order is available right now.');
        return;
      }
      mergeLines(lines);
      toast.success('Added to your basket', {
        description:
          skipped.length > 0
            ? skipped.length + ' item' + (skipped.length === 1 ? '' : 's') + ' could not be added.'
            : undefined,
      });
    } catch (caught: unknown) {
      toast.error(caught instanceof Error ? caught.message : 'Could not rebuild that basket.');
    } finally {
      setReordering(null);
    }
  };

  if (!loaded) {
    return (
      <ScrollView
        className="bg-background flex-1"
        contentContainerClassName="py-10"
        contentContainerStyle={{ paddingHorizontal: GUTTER }}
      >
        <Skeleton className="h-12 w-56 rounded-2xl" />
        <View className="mt-10 gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-4xl" />
          ))}
        </View>
      </ScrollView>
    );
  }

  if (history.length === 0) {
    return (
      <View
        className="bg-background flex-1 items-center justify-center py-20"
        style={{ paddingHorizontal: GUTTER }}
      >
        <View className="bg-secondary h-16 w-16 items-center justify-center rounded-3xl">
          <Package size={28} color={colors.mutedForeground} />
        </View>
        <Text className="text-foreground mt-6 text-2xl font-semibold">No orders yet</Text>
        <Text className="text-muted-foreground mt-2 max-w-sm text-center text-sm">
          {session
            ? 'Orders you place while signed in are saved to your account, so they follow you to any device.'
            : 'Orders you place are remembered on this device so you can track them. Sign in and they are saved to your account instead.'}
        </Text>
        <Link href="/products" asChild>
          <Pressable
            accessibilityRole="link"
            className="bg-primary mt-8 h-12 items-center justify-center rounded-full px-7"
          >
            <Text className="text-primary-foreground text-sm font-semibold">Start shopping</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="py-10 pb-16"
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
    >
      <Text className="text-foreground text-3xl font-semibold">Your orders</Text>
      <Text className="text-muted-foreground mt-3 max-w-xl text-base">
        Saved on this device. Tracking is authorised by the link itself, so anyone with it can see
        the order.
      </Text>

      <View className="mt-10 gap-4">
        {history.map((entry) => {
          // A row the server already returned needs no per-token state: it
          // arrived complete. Only local-only rows have a `gone` or
          // `unreachable` outcome to report.
          const state = entry.order ?? orders[entry.token];
          // Narrowed once, here, so every branch below reads an order or reads
          // nothing — rather than each one re-checking which of the three
          // states it is looking at.
          const order = typeof state === 'object' ? state : null;
          const live = order ? isLive(order.status) : false;
          const itemCount = order?.items.length ?? entry.remembered?.itemCount ?? 0;

          return (
            <View key={entry.token} className="border-border/70 rounded-4xl border p-6">
              <View className="flex-row flex-wrap items-start justify-between gap-4">
                <View>
                  <Text className="text-foreground num text-lg font-semibold">
                    #{entry.orderId}
                  </Text>
                  <Text className="text-muted-foreground num mt-0.5 text-sm">
                    {formatDateTime(order?.created_at ?? entry.placedAt)} · {itemCount}{' '}
                    {itemCount === 1 ? 'item' : 'items'}
                  </Text>
                </View>

                <View className="flex-row items-center gap-3">
                  <Text className="text-foreground num text-lg font-semibold">
                    {formatMoneyExact(order?.grand_total ?? entry.remembered?.total ?? 0)}
                  </Text>
                  {order ? (
                    <View
                      className={
                        'rounded-full px-3 py-1.5 ' +
                        // Failed is styled with Cancelled rather than left to
                        // fall through all three: an unmatched status renders
                        // an unstyled pill, which reads as an ordinary note
                        // rather than as the order having gone wrong.
                        (isStopped(order.status)
                          ? 'bg-destructive-soft'
                          : order.status === 'Delivered'
                            ? 'bg-success-soft'
                            : 'bg-amber-soft')
                      }
                    >
                      <Text
                        className={
                          'text-xs font-semibold ' +
                          (isStopped(order.status)
                            ? 'text-destructive'
                            : order.status === 'Delivered'
                              ? 'text-success'
                              : 'text-amber-foreground')
                        }
                      >
                        {order.status_label}
                      </Text>
                    </View>
                  ) : (
                    <View className="bg-secondary rounded-full px-3 py-1.5">
                      {/* The store being unreachable is not the order being
                          missing. Saying "unavailable" for both told a customer
                          their order had been deleted when in fact the API was
                          down for thirty seconds. */}
                      <Text className="text-muted-foreground text-xs font-medium">
                        {state === 'gone' ? 'No longer available' : 'Status unavailable'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {live && order ? (
                <Text className="text-amber-foreground num mt-3 text-sm">
                  Arriving in about {order.minutes_remaining} min
                </Text>
              ) : null}

              <View className="border-border mt-5 flex-row flex-wrap items-center gap-3 border-t pt-5">
                <Link href={{ pathname: '/order/[token]', params: { token: entry.token } }} asChild>
                  <Pressable
                    accessibilityRole="link"
                    className="bg-primary h-10 flex-row items-center gap-1 rounded-full px-5"
                  >
                    <Text className="text-primary-foreground text-sm font-semibold">
                      {live ? 'Track order' : 'View order'}
                    </Text>
                    <ChevronRight size={16} color={colors.primaryForeground} />
                  </Pressable>
                </Link>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: reordering !== null || !order }}
                  onPress={() => void reorder(entry.token)}
                  disabled={reordering !== null || !order}
                  className={
                    'border-border h-10 flex-row items-center gap-2 rounded-full border px-5 ' +
                    (reordering !== null || !order ? 'opacity-50' : '')
                  }
                >
                  {reordering === entry.token ? (
                    <Loader2 size={16} color={colors.foreground} />
                  ) : (
                    <RotateCcw size={16} color={colors.foreground} />
                  )}
                  <Text className="text-foreground text-sm font-medium">Order again</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
