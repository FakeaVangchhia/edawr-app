/**
 * One category.
 *
 * Ported from `edawr-frontend/src/app/category/[slug]/CategoryPage.tsx`.
 *
 * `Product.category` is free text with no id, so the route carries a slug
 * derived from the name and this resolves it by matching derived slugs — see
 * `lib/catalogue.ts`. That means the category list has to load before the
 * products can be fetched, which is why this is two sequential requests rather
 * than one.
 *
 * An unrecognised slug renders a "no such category" state rather than a 404
 * screen: the resolution happens on the device, after the route has already
 * been entered, and the chrome around it should stay usable.
 */
import { Link, useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ProductGrid } from '@/components/ProductGrid';
import { Skeleton } from '@/components/ui/motion';
import { usePromiseMinutes } from '@/hooks/useStoreData';
import { categoryForSlug } from '@/lib/catalogue';
import { fetchCategories, fetchProducts } from '@/lib/store-api';
import { GUTTER, colors } from '@/theme';
import type { StoreCategory, StoreProduct } from '@/types';

const PAGE_SIZE = 60;

interface Resolved {
  category: StoreCategory | null;
  products: StoreProduct[];
  error: string;
}

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [state, setState] = useState<Resolved | null>(null);
  const promiseMinutes = usePromiseMinutes();

  useEffect(() => {
    const controller = new AbortController();

    fetchCategories(controller.signal)
      .then(async (categories) => {
        const category = categoryForSlug(categories, slug);
        if (!category) return { category: null, products: [], error: '' };

        const products = await fetchProducts(
          { category: category.name, limit: PAGE_SIZE },
          controller.signal,
        );
        return { category, products, error: '' };
      })
      .then(setState)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          category: null,
          products: [],
          error: caught instanceof Error ? caught.message : 'Could not load this category.',
        });
      });

    return () => controller.abort();
  }, [slug]);

  if (state === null) {
    return (
      <ScrollView
        className="bg-background flex-1"
        contentContainerClassName="py-10"
        contentContainerStyle={{ paddingHorizontal: GUTTER }}
      >
        <Skeleton className="h-5 w-48 rounded-full" />
        <Skeleton className="mt-6 h-12 w-72 rounded-2xl" />
        <View className="mt-10">
          <ProductGrid products={[]} isLoading />
        </View>
      </ScrollView>
    );
  }

  if (state.error) {
    return <Notice title="This category didn't load" body={state.error} tone="error" cta="All categories" />;
  }

  if (!state.category) {
    return (
      <Notice
        title="No such category"
        body="This category has been renamed or is no longer stocked."
        tone="muted"
        cta="Browse all categories"
      />
    );
  }

  const { category, products } = state;

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="py-10 pb-16"
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
    >
      <View accessibilityRole="header" className="flex-row items-center gap-1">
        <Link href="/" asChild>
          <Pressable accessibilityRole="link" hitSlop={6}>
            <Text className="text-muted-foreground text-sm">Home</Text>
          </Pressable>
        </Link>
        <ChevronRight size={14} color={colors.mutedForeground} />
        <Link href="/categories" asChild>
          <Pressable accessibilityRole="link" hitSlop={6}>
            <Text className="text-muted-foreground text-sm">Categories</Text>
          </Pressable>
        </Link>
        <ChevronRight size={14} color={colors.mutedForeground} />
        <Text numberOfLines={1} className="text-foreground flex-1 text-sm">
          {category.name}
        </Text>
      </View>

      <Text className="text-foreground mt-6 text-3xl font-semibold">{category.name}</Text>
      <Text className="text-muted-foreground num mt-3 text-base">
        {products.length} {products.length === 1 ? 'item' : 'items'} in stock
      </Text>

      <View className="mt-10">
        <ProductGrid
          products={products}
          isLoading={false}
          promiseMinutes={promiseMinutes}
          emptyTitle="Nothing in this category right now"
          emptyBody="Everything here has sold out. It will be back once the shelf is restocked."
        />
      </View>
    </ScrollView>
  );
}

function Notice({
  title,
  body,
  tone,
  cta,
}: {
  title: string;
  body: string;
  tone: 'error' | 'muted';
  cta: string;
}) {
  return (
    <View
      className="bg-background flex-1 items-center justify-center py-20"
      style={{ paddingHorizontal: GUTTER }}
    >
      <Text className="text-foreground text-2xl font-semibold">{title}</Text>
      <Text
        className={
          'mt-2 text-center text-sm ' +
          (tone === 'error' ? 'text-destructive' : 'text-muted-foreground')
        }
      >
        {body}
      </Text>
      <Link href="/categories" asChild>
        <Pressable
          accessibilityRole="link"
          className="bg-primary mt-8 h-12 items-center justify-center rounded-full px-7"
        >
          <Text className="text-primary-foreground text-sm font-semibold">{cta}</Text>
        </Pressable>
      </Link>
    </View>
  );
}
