/**
 * One product.
 *
 * Ported from `edawr-frontend/src/app/product/[id]/ProductPage.tsx`.
 *
 * A 404 from `/api/store/products/{id}` is a *screen state*, not a failure —
 * the request worked perfectly and the answer is that the product is gone. It
 * gets its own branch and its own copy, separate from the one for a request
 * that actually broke.
 */
import { Link, useLocalSearchParams } from 'expo-router';
import { ChevronRight, PackageCheck, RotateCcw, ShieldCheck, Zap } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { ImageFallback } from '@/components/ImageFallback';
import { AddControl } from '@/components/ProductCard';
import { ProductRail } from '@/components/ProductRail';
import { Skeleton } from '@/components/ui/motion';
import { usePromiseMinutes, useStoreConfig } from '@/hooks/useStoreData';
import { ApiError, assetUrl } from '@/lib/api';
import { slugify } from '@/lib/catalogue';
import { formatMoney } from '@/lib/format';
import { fetchProduct, fetchProducts } from '@/lib/store-api';
import { GUTTER, colors } from '@/theme';
import type { StoreProduct } from '@/types';

/** How many neighbours the "More from …" rail asks for. */
const RELATED_LIMIT = 12;

interface Loaded {
  product: StoreProduct | null;
  related: StoreProduct[];
  missing: boolean;
  error: string;
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numericId = Number(id);
  const [state, setState] = useState<Loaded | null>(null);
  const promiseMinutes = usePromiseMinutes();
  const config = useStoreConfig();

  useEffect(() => {
    const controller = new AbortController();

    fetchProduct(numericId, controller.signal)
      .then(async (product) => {
        if (!product.category) {
          return { product, related: [], missing: false, error: '' };
        }
        const neighbours = await fetchProducts(
          { category: product.category, limit: RELATED_LIMIT },
          controller.signal,
        );
        return {
          product,
          related: neighbours.filter((each) => each.id !== product.id),
          missing: false,
          error: '',
        };
      })
      .then(setState)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        // A 404 here means "no such product", which is a screen state rather
        // than a failure — the request itself worked perfectly.
        if (caught instanceof ApiError && caught.status === 404) {
          setState({ product: null, related: [], missing: true, error: '' });
          return;
        }
        setState({
          product: null,
          related: [],
          missing: false,
          error: caught instanceof Error ? caught.message : 'Could not load this product.',
        });
      });

    return () => controller.abort();
  }, [numericId]);

  if (state === null) return <ProductSkeleton />;

  if (state.missing || (!state.product && !state.error)) {
    return (
      <View
        className="bg-background flex-1 items-center justify-center py-20"
        style={{ paddingHorizontal: GUTTER }}
      >
        <Text className="text-foreground text-2xl font-semibold">
          This product isn&apos;t available
        </Text>
        <Text className="text-muted-foreground mt-2 text-center text-sm">
          It has sold out or been withdrawn from the catalogue.
        </Text>
        <Link href="/products" asChild>
          <Pressable
            accessibilityRole="link"
            className="bg-primary mt-8 h-12 items-center justify-center rounded-full px-7"
          >
            <Text className="text-primary-foreground text-sm font-semibold">Shop everything</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  if (!state.product) {
    return (
      <View
        className="bg-background flex-1 items-center justify-center py-20"
        style={{ paddingHorizontal: GUTTER }}
      >
        <Text className="text-foreground text-2xl font-semibold">This screen didn&apos;t load</Text>
        <Text className="text-destructive mt-2 text-center text-sm">{state.error}</Text>
      </View>
    );
  }

  const { product, related } = state;
  const image = assetUrl(product.image_url);
  const saving = product.mrp > product.price ? product.mrp - product.price : 0;

  return (
    <ScrollView className="bg-background flex-1" contentContainerClassName="pb-10">
      <View className="py-8" style={{ paddingHorizontal: GUTTER }}>
        <View className="flex-row flex-wrap items-center gap-1">
          <Link href="/" asChild>
            <Pressable accessibilityRole="link" hitSlop={6}>
              <Text className="text-muted-foreground text-sm">Home</Text>
            </Pressable>
          </Link>
          <ChevronRight size={14} color={colors.mutedForeground} />
          {product.category ? (
            <>
              <Link
                href={{
                  pathname: '/category/[slug]',
                  params: { slug: slugify(product.category) },
                }}
                asChild
              >
                <Pressable accessibilityRole="link" hitSlop={6}>
                  <Text className="text-muted-foreground text-sm">{product.category}</Text>
                </Pressable>
              </Link>
              <ChevronRight size={14} color={colors.mutedForeground} />
            </>
          ) : null}
          <Text numberOfLines={1} className="text-foreground flex-1 text-sm">
            {product.name}
          </Text>
        </View>

        <View className="bg-surface mt-8 overflow-hidden rounded-4xl">
          {image ? (
            <Image
              source={{ uri: image }}
              accessibilityLabel={product.name}
              className="aspect-square w-full"
              resizeMode="cover"
            />
          ) : (
            <ImageFallback className="aspect-square w-full" />
          )}
          {product.discount_percent > 0 ? (
            <View className="bg-amber absolute left-4 top-4 rounded-full px-3 py-1">
              <Text className="text-amber-foreground num text-sm font-semibold">
                {product.discount_percent}% off
              </Text>
            </View>
          ) : null}
        </View>

        <View className="mt-10">
          {product.brand ? (
            <Text className="text-muted-foreground text-sm font-medium">{product.brand}</Text>
          ) : null}
          <Text className="text-foreground mt-1 text-3xl font-semibold">{product.name}</Text>
          {product.unit ? (
            <Text className="text-muted-foreground mt-2 text-base">{product.unit}</Text>
          ) : null}

          <View className="mt-6 flex-row flex-wrap items-end gap-3">
            <Text className="text-foreground num text-4xl font-semibold">
              {formatMoney(product.price)}
            </Text>
            {saving > 0 ? (
              <>
                <Text className="text-muted-foreground num text-lg line-through">
                  {formatMoney(product.mrp)}
                </Text>
                <View className="bg-amber-soft rounded-full px-3 py-1">
                  <Text className="text-amber-foreground num text-sm font-semibold">
                    Save {formatMoney(saving)}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {promiseMinutes !== null ? (
            <View className="bg-secondary mt-4 flex-row items-center gap-1.5 self-start rounded-full px-3 py-1.5">
              <Zap size={14} color={colors.amber} fill={colors.amber} />
              <Text className="text-muted-foreground text-sm">
                Arrives in about {promiseMinutes} minutes
              </Text>
            </View>
          ) : null}

          {!product.in_stock ? (
            <View className="bg-destructive-soft mt-4 rounded-2xl px-4 py-3">
              <Text className="text-destructive text-sm">
                Out of stock. It will return once the shelf is restocked.
              </Text>
            </View>
          ) : null}
          {product.in_stock && product.low_stock ? (
            <View className="bg-amber-soft mt-4 rounded-2xl px-4 py-3">
              <Text className="text-amber-foreground text-sm">Low stock — only a few left.</Text>
            </View>
          ) : null}

          <View className="mt-8 self-start">
            <AddControl product={product} size="lg" />
          </View>

          {product.description ? (
            <View className="border-border mt-10 border-t pt-8">
              <Text className="text-foreground text-lg font-semibold">About this product</Text>
              <Text className="text-muted-foreground mt-3 text-[15px] leading-relaxed">
                {product.description}
              </Text>
            </View>
          ) : null}

          <View className="border-border mt-10 gap-4 border-t pt-8">
            <Assurance
              icon={<Zap size={16} color={colors.amber} fill={colors.amber} />}
              title={promiseMinutes ? promiseMinutes + '-minute promise' : 'Quick delivery'}
              body="Tracked live from the moment you confirm."
            />
            <Assurance
              icon={<PackageCheck size={16} color={colors.amber} />}
              title={
                config ? 'Free over ' + formatMoney(config.free_delivery_above) : 'Free delivery'
              }
              body="Applied automatically at checkout."
            />
            <Assurance
              icon={<RotateCcw size={16} color={colors.amber} />}
              title="Cancel while packing"
              body="Free until a rider collects it."
            />
          </View>

          <View className="mt-8 flex-row items-start gap-2">
            <View className="mt-0.5">
              <ShieldCheck size={16} color={colors.amber} />
            </View>
            <Text className="text-muted-foreground flex-1 text-xs leading-relaxed">
              Every price is confirmed by the store when you check out, so what you see in the
              basket is what you pay.
            </Text>
          </View>
        </View>
      </View>

      {product.category ? (
        <ProductRail
          title={'More from ' + product.category}
          items={related}
          href={'/category/' + slugify(product.category)}
          promiseMinutes={promiseMinutes}
        />
      ) : null}
    </ScrollView>
  );
}

function Assurance({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <View>
      <View className="flex-row items-center gap-1.5">
        {icon}
        <Text className="text-foreground text-sm font-semibold">{title}</Text>
      </View>
      <Text className="text-muted-foreground mt-1 text-xs">{body}</Text>
    </View>
  );
}

function ProductSkeleton() {
  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="py-8"
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
    >
      <Skeleton className="h-5 w-64 rounded-full" />
      <Skeleton className="mt-8 aspect-square w-full rounded-4xl" />
      <View className="mt-10 gap-4">
        <Skeleton className="h-10 w-3/4 rounded-2xl" />
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-12 w-48 rounded-2xl" />
        <Skeleton className="h-13 w-40 rounded-full" />
        <Skeleton className="h-32 rounded-3xl" />
      </View>
    </ScrollView>
  );
}
