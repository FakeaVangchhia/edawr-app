/**
 * Live order tracking.
 *
 * Ported from `edawr-frontend/src/app/order/[token]/OrderTracker.tsx`.
 *
 * **The token is the credential.** It is 190 bits from the server and it is the
 * only thing authorising this screen — there is no account check, because a
 * guest has no account. That is the same trust model as a paper receipt, and it
 * is why claiming an order to an account needs no verified number: claiming
 * grants nothing that opening this screen did not already grant.
 *
 * Polled every ten seconds while the order is live *and* the app is in the
 * foreground, and never once it has stopped. `isLive` covers `Failed` as well
 * as `Delivered` and `Cancelled` —
 * the reason that helper exists is that two screens each had their own inline
 * copy of the check and **both omitted `Failed`**, so a failed delivery polled
 * forever behind a cheerful countdown.
 */
import { Link, useLocalSearchParams } from 'expo-router';
import {
  Bike,
  ChefHat,
  Check,
  Loader2,
  MapPin,
  PackageCheck,
  PackageX,
  PhoneCall,
  Receipt,
  Store,
  XCircle,
  Zap,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { ImageFallback } from '@/components/ImageFallback';
import { PulseSoft, Skeleton } from '@/components/ui/motion';
import { toast } from '@/components/ui/toast';
import { useSession } from '@/hooks/useStoreData';
import { ApiError, assetUrl } from '@/lib/api';
import { claimOrder } from '@/lib/customer-api';
import {
  formatClockTime,
  formatCountdown,
  formatDateTime,
  formatMoney,
  formatMoneyExact,
  formatPhone,
} from '@/lib/format';
import { isLive, isStopped } from '@/lib/order-status';
import { forgetOrder } from '@/lib/recent-orders';
import { cancelOrder, trackOrder } from '@/lib/store-api';
import { GUTTER, colors } from '@/theme';
import type { OrderStatus, TrackedOrder } from '@/types';

const POLL_MS = 10_000;

const STEPS: Array<{ status: OrderStatus; label: string; note: string; icon: typeof Check }> = [
  {
    status: 'Placed',
    label: 'Order confirmed',
    note: 'We have your order and the store is on it.',
    icon: Receipt,
  },
  {
    status: 'Packing',
    label: 'Packing your order',
    note: 'Your items are being picked off the shelf.',
    icon: ChefHat,
  },
  {
    status: 'Ready',
    label: 'Ready for a rider',
    note: 'Packed and waiting for the nearest rider.',
    icon: PackageCheck,
  },
  {
    status: 'Dispatched',
    label: 'On the way',
    note: 'Your rider has the bag and is moving.',
    icon: Bike,
  },
  {
    status: 'Delivered',
    label: 'Delivered',
    note: 'Handed over. Enjoy.',
    icon: Check,
  },
];

const STAMPS: Partial<Record<OrderStatus, keyof TrackedOrder>> = {
  Placed: 'created_at',
  Packing: 'packed_at',
  Dispatched: 'dispatched_at',
  Delivered: 'delivered_at',
};

export default function OrderTrackerScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [state, setState] = useState<{ order: TrackedOrder | null; error: string } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const session = useSession();
  const [claimed, setClaimed] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  /**
   * Bumped to re-run the fetch. Refreshing by changing state that the effect
   * depends on — rather than by calling a fetch function from inside it — is
   * what keeps every setState on an async or event-handler path.
   */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    trackOrder(token, controller.signal)
      .then((order) => {
        // Guarded like the catch below. `reloadToken` changes abort the
        // in-flight request, and a response that resolved just before the
        // abort landed would overwrite a newer poll's result with older data —
        // or write to a tree the customer has already left.
        if (controller.signal.aborted) return;
        setState({ order, error: '' });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 404) {
          // A token that 404s is one this device should stop advertising. The
          // last order we did load stays on screen — losing the whole view over
          // one failed poll is worse than showing a slightly old one.
          forgetOrder(token);
          setState((current) => ({
            order: current?.order ?? null,
            error: 'We could not find that order. Check the link and try again.',
          }));
          return;
        }
        setState((current) => ({
          order: current?.order ?? null,
          error: caught instanceof Error ? caught.message : 'Could not load that order.',
        }));
      });

    return () => controller.abort();
  }, [token, reloadToken]);

  const order = state?.order ?? null;
  const live = order !== null && isLive(order.status);

  /**
   * Poll while the order is live — but only while the app is in the foreground.
   *
   * This used to poll every ten seconds for as long as the screen was mounted.
   * The common case here is a customer placing an order and then putting the
   * phone in their pocket for fifteen minutes, which meant six requests a
   * minute, indefinitely, against a battery and a metered Aizawl connection, to
   * update a screen nobody was looking at.
   *
   * `AppState` is the platform's version of the web's `visibilitychange`, and
   * the storefront's tracker does exactly this. Returning to the app refreshes
   * *immediately* rather than waiting out the rest of an interval — that is the
   * moment a customer most wants the status to be right.
   *
   * 'active' is the only state that counts as looking: iOS reports 'inactive'
   * during the app switcher and while a call comes in, and neither is someone
   * reading the screen.
   */
  useEffect(() => {
    if (!live) return;

    const refresh = () => setReloadToken((value) => value + 1);
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      timer ??= setInterval(refresh, POLL_MS);
    };
    const stop = () => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    };

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        refresh();
        start();
      } else {
        stop();
      }
    });

    if (AppState.currentState === 'active') start();

    return () => {
      stop();
      subscription.remove();
    };
  }, [live]);

  if (state === null) return <TrackingSkeleton />;

  if (!order) {
    return (
      <View
        className="bg-background flex-1 items-center justify-center py-20"
        style={{ paddingHorizontal: GUTTER }}
      >
        <Text className="text-foreground text-2xl font-semibold">
          We couldn&apos;t find that order
        </Text>
        <Text className="text-muted-foreground mt-2 text-center text-sm">{state.error}</Text>
        <Link href="/orders" asChild>
          <Pressable
            accessibilityRole="link"
            className="bg-primary mt-8 h-12 items-center justify-center rounded-full px-7"
          >
            <Text className="text-primary-foreground text-sm font-semibold">Your orders</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  const delivered = order.status === 'Delivered';
  const failed = order.status === 'Failed';
  // Neither Cancelled nor Failed appears in STEPS, so findIndex returns -1 and
  // every step renders as not-yet-started — a Dispatched order that failed
  // would show a completely greyed-out timeline. Both get an explanation in
  // place of the step list instead.
  const stopped = isStopped(order.status);
  const currentStep = STEPS.findIndex((step) => step.status === order.status);

  const cancel = async () => {
    if (isCancelling) return;
    setIsCancelling(true);
    try {
      const updated = await cancelOrder(token, 'Cancelled by customer');
      setState({ order: updated, error: '' });
      toast.success('Order cancelled', { description: 'Your items have gone back on the shelf.' });
    } catch (caught: unknown) {
      toast.error(caught instanceof Error ? caught.message : 'We could not cancel that order.', {
        // A 409 here is the state machine refusing, which is the useful part.
        description: 'A rider may already have collected it.',
      });
      setReloadToken((value) => value + 1);
    } finally {
      setIsCancelling(false);
    }
  };

  /**
   * Attach this order to the signed-in account.
   *
   * Offered here because this is the moment the customer is holding the proof:
   * possession of the tracking token is already the whole credential for this
   * screen. The server checks nothing else, and does not need to.
   */
  const claim = async () => {
    if (isClaiming) return;
    setIsClaiming(true);
    try {
      const updated = await claimOrder(token);
      setState({ order: updated, error: '' });
      setClaimed(true);
      toast.success('Saved to your account');
    } catch (caught: unknown) {
      toast.error(caught instanceof Error ? caught.message : 'Could not save that to your account.');
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="py-8 pb-16"
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
    >
      <View className="flex-row flex-wrap items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-muted-foreground text-sm">Order</Text>
          <Text className="text-foreground num text-3xl font-semibold">#{order.id}</Text>
          <Text className="text-muted-foreground mt-1 text-sm">
            Placed {formatDateTime(order.created_at)}
          </Text>

          {/*
            The account offer, at the moment it is most likely to be taken: the
            order has gone through and the customer is watching it come.
          */}
          {!session ? (
            <View className="mt-3 flex-row flex-wrap items-center gap-1">
              <Link href={'/signup?next=' + encodeURIComponent('/order/' + token)} asChild>
                <Pressable accessibilityRole="link" hitSlop={6}>
                  <Text className="text-foreground text-sm font-medium underline">
                    Create an account
                  </Text>
                </Pressable>
              </Link>
              <Text className="text-muted-foreground text-sm">
                to keep this order when you change phone.
              </Text>
            </View>
          ) : claimed ? (
            <Text className="text-success mt-3 text-sm">Saved to your account.</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => void claim()}
              disabled={isClaiming}
              className={'mt-3 self-start ' + (isClaiming ? 'opacity-60' : '')}
            >
              <Text className="text-foreground text-sm font-medium underline">
                {isClaiming ? 'Saving…' : 'Save this order to my account'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* The one thing on this screen that changes on its own. It is polled
            every ten seconds, so a customer who is not watching got no signal
            at all that their order had moved. Always mounted with only its text
            changing — a region inserted at the same moment its content first
            changes is not announced by most screen readers. */}
        <View
          accessibilityLiveRegion="polite"
          className={
            'rounded-full px-4 py-2 ' +
            (stopped ? 'bg-destructive-soft' : delivered ? 'bg-success-soft' : 'bg-amber-soft')
          }
        >
          <Text
            className={
              'text-sm font-semibold ' +
              (stopped ? 'text-destructive' : delivered ? 'text-success' : 'text-amber-foreground')
            }
          >
            {order.status_label}
          </Text>
        </View>
      </View>

      {state.error ? (
        <View
          accessibilityLiveRegion="polite"
          className="bg-destructive-soft mt-4 rounded-2xl px-4 py-3"
        >
          <Text className="text-destructive text-sm">
            {state.error} Showing the last update we received.
          </Text>
        </View>
      ) : null}

      <View className="mt-8 gap-6">
        {!stopped && !delivered ? (
          <View className="bg-primary flex-row items-center gap-4 rounded-4xl p-6">
            <View className="bg-amber h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
              <Zap size={24} color={colors.amberForeground} fill={colors.amberForeground} />
            </View>
            <View className="flex-1">
              <Text className="text-primary-foreground num text-2xl font-semibold">
                {formatCountdown(order.minutes_remaining)}
              </Text>
              <Text className="text-primary-foreground/70 text-sm">
                {order.is_late
                  ? 'Running late — it is on its way.'
                  : order.delivery_type_label +
                    ' · arriving by ' +
                    formatClockTime(order.promised_at)}
              </Text>
            </View>
          </View>
        ) : null}

        <View className="border-border/70 rounded-4xl border p-6">
          <Text className="text-foreground text-lg font-semibold">Progress</Text>

          {stopped ? (
            <View className="mt-5 flex-row items-start gap-3">
              <View className="bg-destructive-soft h-9 w-9 shrink-0 items-center justify-center rounded-full">
                {failed ? (
                  <PackageX size={20} color={colors.destructive} />
                ) : (
                  <XCircle size={20} color={colors.destructive} />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold">
                  {failed ? 'Delivery could not be completed' : 'Order cancelled'}
                </Text>
                <Text className="text-muted-foreground mt-0.5 text-sm">
                  {/* The rider is required to give a reason for a failed
                      delivery, and the server stores it here. It is what the
                      store reads back when the customer rings about it. */}
                  {order.cancellation_reason ??
                    (failed
                      ? 'Your rider could not complete this delivery.'
                      : 'This order was cancelled.')}
                </Text>
                {failed ? (
                  <Text className="text-muted-foreground mt-2 text-sm">
                    You have not been charged — this order was cash on delivery. Place it again
                    whenever you are ready.
                  </Text>
                ) : null}
                {!failed && order.cancelled_at ? (
                  <Text className="text-muted-foreground num mt-0.5 text-xs">
                    {formatDateTime(order.cancelled_at)}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View className="mt-5">
              {STEPS.map((step, index) => {
                const done = index < currentStep;
                const active = index === currentStep;
                const stampKey = STAMPS[step.status];
                const stamp = stampKey ? (order[stampKey] as string | null) : null;
                const Icon = step.icon;
                const node = (
                  <View
                    className={
                      'h-9 w-9 shrink-0 items-center justify-center rounded-full ' +
                      (done ? 'bg-success-soft' : active ? 'bg-amber' : 'bg-secondary')
                    }
                  >
                    <Icon
                      size={16}
                      color={
                        done
                          ? colors.success
                          : active
                            ? colors.amberForeground
                            : colors.mutedForeground
                      }
                    />
                  </View>
                );

                return (
                  <View key={step.status} className="flex-row gap-3">
                    <View className="items-center">
                      {active ? <PulseSoft>{node}</PulseSoft> : node}
                      {index < STEPS.length - 1 ? (
                        <View
                          className={'my-1 w-px flex-1 ' + (done ? 'bg-success/40' : 'bg-border')}
                        />
                      ) : null}
                    </View>

                    <View className={'flex-1 pb-5 ' + (!done && !active ? 'opacity-50' : '')}>
                      <Text className="text-foreground text-sm font-semibold">{step.label}</Text>
                      <Text className="text-muted-foreground mt-0.5 text-sm">{step.note}</Text>
                      {stamp && (done || active) ? (
                        <Text className="text-muted-foreground num mt-0.5 text-xs">
                          {formatClockTime(stamp)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View className="border-border/70 rounded-4xl border p-6">
          <Text className="text-foreground text-lg font-semibold">Your rider</Text>
          {order.rider ? (
            <View className="mt-4 flex-row items-center gap-3">
              <View className="bg-secondary h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
                <Bike size={20} color={colors.foreground} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-foreground text-sm font-semibold">{order.rider.name}</Text>
                <Text className="text-muted-foreground num text-xs">
                  {formatPhone(order.rider.phone)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Call ' + order.rider.name}
                onPress={() => void Linking.openURL('tel:' + order.rider!.phone)}
                className="bg-primary h-10 flex-row items-center gap-2 rounded-full px-5"
              >
                <PhoneCall size={16} color={colors.primaryForeground} />
                <Text className="text-primary-foreground text-sm font-semibold">Call</Text>
              </Pressable>
            </View>
          ) : (
            <View className="bg-surface mt-4 flex-row items-center gap-3 rounded-3xl p-4">
              <View className="bg-secondary h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
                <Store size={20} color={colors.mutedForeground} />
              </View>
              <Text className="text-muted-foreground flex-1 text-sm">
                {riderNote(order.status)}
              </Text>
            </View>
          )}
        </View>

        <View className="border-border/70 rounded-4xl border p-6">
          <Text className="text-foreground text-lg font-semibold">Delivering to</Text>
          <View className="mt-4 flex-row items-start gap-3">
            <View className="mt-0.5">
              <MapPin size={16} color={colors.amber} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-medium">{order.customer_name}</Text>
              <Text className="text-muted-foreground mt-0.5 text-sm">
                {order.customer_address}
              </Text>
              {order.customer_landmark ? (
                <Text className="text-muted-foreground text-sm">
                  Near {order.customer_landmark}
                </Text>
              ) : null}
              {order.delivery_notes ? (
                <Text className="text-muted-foreground mt-2 text-sm">
                  Note: {order.delivery_notes}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View className="border-border/70 gap-6 rounded-4xl border p-6">
          <View>
            <Text className="text-foreground text-lg font-semibold">
              {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
            </Text>
            <View className="mt-4 gap-3">
              {order.items.map((item) => {
                const image = assetUrl(item.image_url);
                return (
                  <View key={item.id} className="flex-row items-center gap-3">
                    {image ? (
                      <Image
                        source={{ uri: image }}
                        className="bg-surface h-11 w-11 shrink-0 rounded-xl"
                        resizeMode="cover"
                      />
                    ) : (
                      <ImageFallback className="h-11 w-11 shrink-0 rounded-xl" />
                    )}
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-foreground text-sm font-medium">
                        {item.name}
                      </Text>
                      <Text className="text-muted-foreground num text-xs">
                        Qty {item.quantity} · {formatMoney(item.price)}
                      </Text>
                    </View>
                    <Text className="text-foreground num text-sm font-semibold">
                      {formatMoney(item.line_total)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/*
            Every figure below was computed by the server when the order was
            created and is simply being read back. Nothing here re-adds them.
          */}
          <View className="border-border gap-3 border-t pt-6">
            <Row label="Item total" value={order.items_total} />
            <Row label="Delivery" value={order.delivery_fee} />
            <Row label="Handling" value={order.handling_fee} />
            <View className="border-border flex-row items-center justify-between border-t pt-3">
              <Text className="text-foreground text-base font-semibold">Total</Text>
              <Text className="text-foreground num text-base font-semibold">
                {formatMoneyExact(order.grand_total)}
              </Text>
            </View>
            {/* Cash on delivery means the money changes hands at the door, so an
                order that never reached the door was never paid. Saying "paid"
                under the total of a cancelled or failed order reads as a charge
                the customer then goes looking for. */}
            <Text className="text-muted-foreground pt-1 text-xs">
              {delivered
                ? 'Paid by cash on delivery.'
                : stopped
                  ? 'Nothing was charged for this order.'
                  : 'To be paid by cash on delivery.'}
            </Text>
          </View>

          {order.can_cancel ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void cancel()}
              disabled={isCancelling}
              className={
                'border-border h-12 w-full flex-row items-center justify-center gap-2 rounded-full border ' +
                (isCancelling ? 'opacity-60' : '')
              }
            >
              {isCancelling ? <Loader2 size={16} color={colors.foreground} /> : null}
              <Text className="text-foreground text-sm font-semibold">
                {isCancelling ? 'Cancelling…' : 'Cancel this order'}
              </Text>
            </Pressable>
          ) : null}

          <Link href="/orders" asChild>
            <Pressable accessibilityRole="link">
              <Text className="text-muted-foreground text-center text-sm font-medium">
                All your orders
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * What to say when the tracking payload carries no rider.
 *
 * The server attaches one only while the order is Dispatched, so "nobody is
 * attached" means something different at each end of the lifecycle: not yet for
 * a live order, no longer for one that has stopped. A failed delivery is the
 * case where a flat "no rider was assigned" reads as plainly false — someone
 * did try.
 */
function riderNote(status: OrderStatus): string {
  if (status === 'Failed') return 'The rider who attempted this delivery has been released from it.';
  if (status === 'Delivered' || status === 'Cancelled') return 'No rider is attached to this order.';
  return 'A rider is assigned once your order is packed and ready.';
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      <Text
        className={'num text-sm ' + (value === 0 ? 'text-amber-foreground' : 'text-foreground')}
      >
        {value === 0 ? 'Free' : formatMoneyExact(value)}
      </Text>
    </View>
  );
}

function TrackingSkeleton() {
  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="py-8"
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
    >
      <Skeleton className="h-12 w-48 rounded-2xl" />
      <View className="mt-8 gap-6">
        <Skeleton className="h-24 rounded-4xl" />
        <Skeleton className="h-80 rounded-4xl" />
        <Skeleton className="h-96 rounded-4xl" />
      </View>
    </ScrollView>
  );
}
