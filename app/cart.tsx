/**
 * The basket.
 *
 * Ported from `edawr-frontend/src/app/cart/CartPage.tsx`.
 *
 * **No line total is computed here.** Every figure on this screen is the
 * server's, from `useQuote`. A `price × quantity` column written in TypeScript
 * would be a second pricing engine doing arithmetic in floats, which is exactly
 * what `api/pricing.py` exists to prevent.
 *
 * The row totals come from `quote.lines`, which `BasketQuoteSerializer` added
 * for this. Before that field existed the screen could only show a per-unit
 * price and leave the customer to multiply — the rule was being followed by
 * showing less, because the server had the number and was throwing it away.
 *
 * The chosen tier lives here rather than on the checkout screen because it
 * changes the bill the customer is looking at right now, and it is carried
 * forward as a route param when they continue.
 */
import { Link, useRouter } from 'expo-router';
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import {
  BillLines,
  DeliveryTierPicker,
  FreeDeliveryNudge,
  MinimumOrderNotice,
} from '@/components/BasketSummary';
import { ImageFallback } from '@/components/ImageFallback';
import { Pop, PulseSoft, Skeleton } from '@/components/ui/motion';
import { toast } from '@/components/ui/toast';
import { useQuote } from '@/hooks/useQuote';
import { useCart, useStoreConfig } from '@/hooks/useStoreData';
import { assetUrl } from '@/lib/api';
import { addOne, clearCart, mergeLines, removeLine, setQuantity } from '@/lib/cart-store';
import { DEFAULT_DELIVERY_TYPE } from '@/lib/delivery';
import { formatMoney } from '@/lib/format';
import { GUTTER, colors } from '@/theme';
import type { DeliveryType } from '@/types';

export default function CartScreen() {
  const router = useRouter();
  const { lines, hydrated } = useCart();
  const config = useStoreConfig();
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(DEFAULT_DELIVERY_TYPE);
  const { quote, isLoading, error } = useQuote(lines, deliveryType);

  // Row totals, keyed by product, exactly as the server quantised them. Empty
  // while a quote is in flight, which is why the render below falls back to the
  // per-unit price rather than to a locally computed product.
  const lineTotals = new Map((quote?.lines ?? []).map((row) => [row.product_id, row.line_total]));
  const storeClosed = config ? !config.is_open : false;

  if (!hydrated) return <CartSkeleton />;

  if (lines.length === 0) {
    return (
      <View
        className="bg-background flex-1 items-center justify-center py-20"
        style={{ paddingHorizontal: GUTTER }}
      >
        <View className="bg-secondary h-16 w-16 items-center justify-center rounded-3xl">
          <ShoppingBag size={28} color={colors.mutedForeground} />
        </View>
        <Text className="text-foreground mt-6 text-2xl font-semibold">Your basket is empty</Text>
        <Text className="text-muted-foreground mt-2 max-w-sm text-center text-sm">
          Add a few things and they will be at your door in minutes.
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

  const canCheckout =
    Boolean(quote?.meets_minimum) && quote?.unavailable.length === 0 && !storeClosed;
  const unavailableIds = new Set(quote?.unavailable.map((item) => item.product_id) ?? []);

  const goToCheckout = () => {
    if (!canCheckout) return;
    router.push({ pathname: '/checkout', params: { tier: deliveryType } });
  };

  return (
    <View className="bg-background flex-1">
      <ScrollView
        contentContainerClassName="py-8"
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 120 }}
      >
        <View className="flex-row items-end justify-between gap-4">
          <View className="flex-1">
            <Text className="text-foreground text-3xl font-semibold">Your basket</Text>
            <Text className="text-muted-foreground num mt-2 text-base">
              {lines.length} {lines.length === 1 ? 'product' : 'products'}
            </Text>
          </View>
          {/*
            Destructive, one tap, and previously final — the storefront's
            reasoning, and its fix. Undo rather than a confirmation step: a
            confirm taxes every deliberate use to guard against the rare
            accident, while an undo keeps the common case at one tap and still
            makes the accident recoverable. `mergeLines` restores exactly,
            because the basket it merges into is empty.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear the basket"
            hitSlop={8}
            onPress={() => {
              const previous = lines;
              clearCart();
              toast.success('Basket cleared', {
                action: { label: 'Undo', onPress: () => mergeLines(previous) },
              });
            }}
          >
            <Text className="text-muted-foreground text-sm font-medium">Clear all</Text>
          </Pressable>
        </View>

        <View className="mt-8 gap-3">
          {lines.map((line) => {
            const image = assetUrl(line.product.image_url);
            const unavailable = unavailableIds.has(line.product.id);
            const rowTotal = lineTotals.get(line.product.id);

            return (
              <View
                key={line.product.id}
                className={
                  'flex-row items-center gap-4 rounded-3xl border p-4 ' +
                  (unavailable ? 'border-destructive/40 bg-destructive-soft' : 'border-border/70')
                }
              >
                <Link
                  href={{ pathname: '/product/[id]', params: { id: line.product.id } }}
                  asChild
                >
                  <Pressable accessibilityRole="link" className="shrink-0">
                    {image ? (
                      <Image
                        source={{ uri: image }}
                        className="bg-surface h-16 w-16 rounded-2xl"
                        resizeMode="cover"
                      />
                    ) : (
                      <ImageFallback className="h-16 w-16 rounded-2xl" />
                    )}
                  </Pressable>
                </Link>

                <View className="min-w-0 flex-1">
                  <Link
                    href={{ pathname: '/product/[id]', params: { id: line.product.id } }}
                    asChild
                  >
                    <Pressable accessibilityRole="link">
                      <Text numberOfLines={1} className="text-foreground text-[15px] font-semibold">
                        {line.product.name}
                      </Text>
                    </Pressable>
                  </Link>
                  <Text className="text-muted-foreground num mt-0.5 text-xs">
                    {formatMoney(line.product.price)}
                    {line.product.unit ? ' · ' + line.product.unit : ''}
                  </Text>
                  {rowTotal !== undefined ? (
                    <Text className="text-foreground num mt-0.5 text-[13px] font-semibold">
                      {formatMoney(rowTotal)}
                    </Text>
                  ) : null}
                  {unavailable ? (
                    <Text className="text-destructive mt-1 text-xs font-medium">
                      {quote?.unavailable.find((item) => item.product_id === line.product.id)
                        ?.reason ?? 'No longer available'}
                    </Text>
                  ) : null}
                </View>

                <View className="bg-primary h-9 shrink-0 flex-row items-center justify-between rounded-full px-1.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={'Decrease quantity of ' + line.product.name}
                    hitSlop={4}
                    onPress={() => setQuantity(line.product, line.quantity - 1)}
                    className="h-8 w-8 items-center justify-center rounded-full active:scale-90"
                  >
                    <Minus size={16} color={colors.primaryForeground} />
                  </Pressable>
                  <Pop replayKey={line.quantity}>
                    <Text className="text-primary-foreground num w-7 text-center text-sm font-semibold">
                      {line.quantity}
                    </Text>
                  </Pop>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={'Increase quantity of ' + line.product.name}
                    hitSlop={4}
                    onPress={() => addOne(line.product)}
                    className="h-8 w-8 items-center justify-center rounded-full active:scale-90"
                  >
                    <Plus size={16} color={colors.primaryForeground} />
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'Remove ' + line.product.name}
                  hitSlop={4}
                  onPress={() => removeLine(line.product.id)}
                  className="h-9 w-9 shrink-0 items-center justify-center rounded-full"
                >
                  <Trash2 size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            );
          })}
        </View>

        <View className="border-border/70 mt-8 gap-6 rounded-4xl border p-6">
          <View>
            <Text className="text-foreground text-lg font-semibold">Delivery speed</Text>
            <View className="mt-4">
              <DeliveryTierPicker
                config={config}
                quote={quote}
                selected={deliveryType}
                onSelect={setDeliveryType}
                disabled={isLoading}
              />
            </View>
          </View>

          <View className="border-border border-t pt-6">
            <Text className="text-foreground mb-4 text-lg font-semibold">Bill</Text>
            <BillLines quote={quote} />
            {isLoading ? (
              <PulseSoft className="mt-3">
                <Text className="text-muted-foreground text-xs">Pricing your basket…</Text>
              </PulseSoft>
            ) : null}
            {error ? <Text className="text-destructive mt-3 text-xs">{error}</Text> : null}
          </View>

          <FreeDeliveryNudge quote={quote} />
          <MinimumOrderNotice quote={quote} config={config} />

          {storeClosed ? (
            <View accessibilityLiveRegion="polite" className="bg-amber-soft rounded-2xl px-4 py-3">
              <Text className="text-amber-foreground text-sm font-semibold">
                The store is closed
              </Text>
              {/* The server's own sentence — the same one checkout would refuse
                  with. Two implementations of "are we open?" is how a shop
                  shows one message and enforces another. */}
              <Text className="text-amber-foreground mt-1 text-sm">{config?.closed_reason}</Text>
              <Text className="text-amber-foreground mt-1 text-xs">
                Your basket is saved and will still be here when we open.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/*
        Sticky checkout, flush on top of the tab bar.

        `bottom-0` is the whole trick, and it used to be `bottom: 68`. That
        number came straight from the storefront, where the nav is
        `position: fixed` and overlays the page, so a sticky bar really does
        have to be lifted by the nav's height to avoid disappearing behind it.

        Nothing overlays anything here. The root layout is a column — header,
        this screen, then `MobileNav` — so the bottom edge of this screen
        already *is* the top of the tab bar. Lifting it by another 68px left the
        primary action floating in 68px of dead space above the bar, on the
        screen where vertical room is scarcest.
      */}
      <View className="border-border/70 bg-background absolute inset-x-0 bottom-0 border-t px-5 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCheckout }}
          disabled={!canCheckout}
          onPress={goToCheckout}
          className={
            'bg-primary h-13 w-full flex-row items-center justify-center gap-2 rounded-full active:scale-[0.99] ' +
            (canCheckout ? '' : 'opacity-50')
          }
        >
          <Text className="text-primary-foreground text-base font-semibold">
            {storeClosed ? 'Store closed' : 'Checkout'}
          </Text>
          {!storeClosed && quote ? (
            <Text className="text-primary-foreground num text-base font-semibold">
              · {formatMoney(quote.grand_total)}
            </Text>
          ) : null}
          {!storeClosed ? <ArrowRight size={16} color={colors.primaryForeground} /> : null}
        </Pressable>
      </View>
    </View>
  );
}

function CartSkeleton() {
  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="py-8"
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
    >
      <Skeleton className="h-12 w-56 rounded-2xl" />
      <View className="mt-8 gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-3xl" />
        ))}
      </View>
      <Skeleton className="mt-8 h-96 rounded-4xl" />
    </ScrollView>
  );
}
