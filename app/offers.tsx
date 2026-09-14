/**
 * Offers.
 *
 * Ported from `edawr-frontend/src/app/offers/OffersPage.tsx`.
 *
 * The prototype this came from advertised promo codes — SWIFT50, FRESH10,
 * FREEDEL. There is no promotions system behind any of them, so they were
 * deleted rather than reimplemented as decoration. Everything on this screen is
 * a real rule the server enforces: the free-delivery threshold, the delivery
 * tiers, the minimum order, the handling fee, and stock that is genuinely below
 * its MRP right now.
 *
 * If a promotions system is ever built, this is the screen it belongs on. Until
 * then, inventing an offer here is inventing a promise the checkout will break.
 */
import { Link } from 'expo-router';
import { ArrowRight, PackageCheck, Tag, Zap } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ProductRail } from '@/components/ProductRail';
import { Skeleton } from '@/components/ui/motion';
import { useStoreConfig } from '@/hooks/useStoreData';
import { tiersFrom } from '@/lib/delivery';
import { formatMoney } from '@/lib/format';
import { fetchProducts } from '@/lib/store-api';
import { GUTTER, colors } from '@/theme';
import type { StoreProduct } from '@/types';

const CATALOGUE_LIMIT = 120;

export default function OffersScreen() {
  const config = useStoreConfig();
  const [discounted, setDiscounted] = useState<StoreProduct[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchProducts({ limit: CATALOGUE_LIMIT }, controller.signal)
      .then((products) =>
        setDiscounted(
          products
            .filter((product) => product.in_stock && product.discount_percent > 0)
            .sort((a, b) => b.discount_percent - a.discount_percent),
        ),
      )
      // Swallowed into the empty state rather than surfaced: the delivery
      // offers above do not depend on this request, and an error banner over a
      // screen that still has three valid offers on it reads as broken.
      .catch(() => setDiscounted([]));

    return () => controller.abort();
  }, []);

  const tiers = tiersFrom(config);

  return (
    <ScrollView className="bg-background flex-1" contentContainerClassName="pb-16">
      <View className="py-10" style={{ paddingHorizontal: GUTTER }}>
        <Text className="text-foreground text-3xl font-semibold">Offers</Text>
        <Text className="text-muted-foreground mt-3 max-w-xl text-base">
          No codes to remember. Everything here is applied automatically when you check out.
        </Text>

        <View className="mt-10 gap-4">
          {config ? (
            <>
              <OfferCard
                icon={<PackageCheck size={20} color={colors.amber} />}
                title={'Free delivery over ' + formatMoney(config.free_delivery_above)}
                body="Reach the threshold and the delivery fee comes off your bill at checkout. Nothing to enter."
              />
              {tiers.map((tier) => (
                <OfferCard
                  key={tier.key}
                  icon={<Zap size={20} color={colors.amber} fill={colors.amber} />}
                  title={tier.label + ' · about ' + tier.promise_minutes + ' min'}
                  body={
                    tier.fee === 0
                      ? 'Delivered on this speed at no extra charge.'
                      : formatMoney(tier.fee) +
                        ' delivery, or free once your basket passes the threshold.'
                  }
                />
              ))}
            </>
          ) : (
            Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-44 rounded-4xl" />
            ))
          )}
        </View>

        {config ? (
          <View className="bg-primary mt-10 gap-6 rounded-4xl p-10">
            <View>
              <Text className="text-primary-foreground text-2xl font-semibold">
                Orders start at {formatMoney(config.min_order_value)}.
              </Text>
              <Text className="text-primary-foreground/70 mt-2 max-w-lg text-base">
                A {formatMoney(config.handling_fee)} handling fee applies to every order, shown on
                your bill before you confirm.
              </Text>
            </View>
            <Link href="/products" asChild>
              <Pressable
                accessibilityRole="link"
                className="bg-amber h-13 flex-row items-center gap-2 self-start rounded-full px-8"
              >
                <Text className="text-amber-foreground text-base font-semibold">Shop now</Text>
                <ArrowRight size={16} color={colors.amberForeground} />
              </Pressable>
            </Link>
          </View>
        ) : null}
      </View>

      {discounted && discounted.length > 0 ? (
        <ProductRail
          accent
          title="Reduced today"
          subtitle="Every item here is below its MRP right now"
          items={discounted}
          href="/products"
          promiseMinutes={config?.promise_minutes ?? null}
        />
      ) : null}

      {discounted?.length === 0 ? (
        <View style={{ paddingHorizontal: GUTTER }}>
          <View className="border-border/70 flex-row items-center gap-3 rounded-4xl border p-6">
            <Tag size={20} color={colors.mutedForeground} />
            <Text className="text-muted-foreground flex-1 text-sm">
              Nothing is discounted below MRP at the moment. The delivery offers above still apply.
            </Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function OfferCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <View className="border-border/70 rounded-4xl border p-6">
      <View className="bg-amber-soft h-11 w-11 items-center justify-center rounded-2xl">
        {icon}
      </View>
      <Text className="text-foreground mt-4 text-[17px] font-semibold">{title}</Text>
      <Text className="text-muted-foreground mt-2 text-sm leading-relaxed">{body}</Text>
    </View>
  );
}
