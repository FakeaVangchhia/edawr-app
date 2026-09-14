/**
 * The whole catalogue, filterable by category.
 *
 * Ported from `edawr-frontend/src/app/products/ProductsPage.tsx`.
 *
 * The category filter is a **server** filter — it re-fetches with `?category=`
 * rather than filtering an array that was already downloaded. The sort is
 * client-side, because it only reorders the page that came back; it never
 * changes which products are in it.
 *
 * Fetched data is tagged with the category that produced it, so a slow response
 * for one category cannot land after a fast one for another and show the wrong
 * products under the right heading. The loading flag is derived from that tag
 * rather than stored, which keeps every `setState` off the synchronous path of
 * an effect.
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ProductGrid } from '@/components/ProductGrid';
import { usePromiseMinutes } from '@/hooks/useStoreData';
import { SORT_LABELS, sortProducts, type SortKey } from '@/lib/catalogue';
import { fetchCategories, fetchProducts } from '@/lib/store-api';
import { GUTTER } from '@/theme';
import type { StoreCategory, StoreProduct } from '@/types';

const PAGE_SIZE = 60;
const ALL = 'All';

/**
 * The loaded grid, tagged with the exact request that produced it.
 *
 * `key` is `category|page` rather than just the category, because paging adds a
 * second axis a response can be stale on: switching category while a "load more"
 * is in flight would otherwise append page 2 of Dairy under the Snacks heading.
 *
 * `exhausted` is what makes the count honest. A short page is the only
 * end-of-list signal the endpoint gives, so until one arrives the screen knows
 * it has *at least* this many items and must not claim it has all of them.
 */
interface Loaded {
  key: string;
  category: string;
  products: StoreProduct[];
  error: string;
  exhausted: boolean;
}

const keyFor = (category: string, page: number) => category + '|' + page;

export default function ProductsScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [categoryFilter, setCategoryFilter] = useState(params.category ?? ALL);
  const [sort, setSort] = useState<SortKey>('recommended');
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Bumped from the "Load more" handler, never from inside an effect.
  const [page, setPage] = useState(0);
  const promiseMinutes = usePromiseMinutes();

  useEffect(() => {
    const controller = new AbortController();
    fetchCategories(controller.signal)
      .then(setCategories)
      .catch(() => {
        /* The filter chips are a convenience; the grid still loads. */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const key = keyFor(categoryFilter, page);

    fetchProducts(
      { category: categoryFilter, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      controller.signal,
    )
      .then((batch) => {
        if (controller.signal.aborted) return;
        setLoaded((previous) => {
          // Page 0 replaces; a later page appends, but only onto the page
          // immediately before it in the same category. Anything else is a
          // response that outlived the state it belonged to.
          const carry =
            page > 0 && previous?.key === keyFor(categoryFilter, page - 1) ? previous.products : [];
          return {
            key,
            category: categoryFilter,
            products: [...carry, ...batch],
            error: '',
            // A short page is the end of the list. Asking for 60 and getting 60
            // means there may be more; it never means there are not.
            exhausted: batch.length < PAGE_SIZE,
          };
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({
          key,
          category: categoryFilter,
          products: [],
          error: caught instanceof Error ? caught.message : 'Could not load the catalogue.',
          exhausted: true,
        });
      });

    return () => controller.abort();
  }, [categoryFilter, page]);

  const current = loaded?.key === keyFor(categoryFilter, page) ? loaded : null;

  // While a *later* page is in flight, keep showing what is already on screen.
  //
  // `current` is null for the whole round trip after "Load more" bumps `page`,
  // and treating that as `isLoading` made the grid swap sixty rendered products
  // for a skeleton and then show a hundred and twenty at once — the button
  // vanishing along with them. A first load has nothing to hold on to and
  // should still show the skeleton; a subsequent page has everything.
  const carried = loaded?.category === categoryFilter ? loaded : null;
  const shown = current ?? (page > 0 ? carried : null);

  const isLoading = shown === null;
  const isLoadingMore = current === null && shown !== null;
  const products = shown ? sortProducts(shown.products, sort) : [];
  const hasMore = Boolean(shown && !shown.exhausted);

  const changeCategory = (next: string) => {
    setCategoryFilter(next);
    // Back to the top of the new category. Without this, switching filters while
    // on page 3 asks for offset 180 of a category that may have twelve rows and
    // renders an empty grid.
    setPage(0);
  };

  const sortKeys = Object.keys(SORT_LABELS) as SortKey[];

  return (
    <ScrollView className="bg-background flex-1" contentContainerClassName="py-10 pb-16">
      <View style={{ paddingHorizontal: GUTTER }}>
        <Text className="text-foreground text-3xl font-semibold">Shop everything</Text>
        <Text className="text-muted-foreground mt-3 text-base">
          The full catalogue, filterable by category. Everything arrives on the same promise.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-8 grow-0"
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 8 }}
      >
        <FilterChip label="All" active={categoryFilter === ALL} onPress={() => changeCategory(ALL)} />
        {categories.map((category) => (
          <FilterChip
            key={category.name}
            label={category.name}
            count={category.product_count}
            active={categoryFilter === category.name}
            onPress={() => changeCategory(category.name)}
          />
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: GUTTER }}>
        <View className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
          {/*
            A live region, because this is the only catalogue screen that
            filters *in place*. Search and the category screens are route-driven,
            so changing what is shown changes the heading and a screen reader
            announces the navigation. Here, picking a category or a sort silently
            swaps the grid underneath. The count was already on screen — this
            only makes it speak. The storefront does the same.
          */}
          <Text
            accessibilityLiveRegion="polite"
            className="text-muted-foreground num text-sm"
          >
            {isLoading
              ? 'Loading…'
              : (hasMore ? products.length + '+' : String(products.length)) +
                ' ' +
                (products.length === 1 ? 'item' : 'items')}
          </Text>

          {/*
            A row of chips rather than the web's native `<select>`. React Native
            has no select, and the alternatives are a picker module or a modal —
            both heavier than four options deserve, and both hiding the current
            sort behind a tap.
          */}
          <Text className="text-muted-foreground text-sm">Sort</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3 grow-0"
          contentContainerStyle={{ gap: 8 }}
        >
          {sortKeys.map((key) => (
            <FilterChip
              key={key}
              label={SORT_LABELS[key]}
              active={sort === key}
              onPress={() => setSort(key)}
            />
          ))}
        </ScrollView>

        {current?.error ? (
          <Text className="text-destructive mt-6 text-sm">{current.error}</Text>
        ) : null}

        <View className="mt-6">
          <ProductGrid
            products={products}
            isLoading={isLoading}
            promiseMinutes={promiseMinutes}
            emptyTitle="This category is empty"
            emptyBody="Nothing is in stock here right now. Try another category."
          />
        </View>

        {hasMore ? (
          <View className="mt-10 items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isLoadingMore }}
              disabled={isLoadingMore}
              onPress={() => setPage((currentPage) => currentPage + 1)}
              className={
                'border-border h-12 items-center justify-center rounded-full border px-7 ' +
                (isLoadingMore ? 'opacity-60' : '')
              }
            >
              <Text className="text-foreground text-sm font-semibold">
                {isLoadingMore ? 'Loading…' : 'Load more'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function FilterChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={
        'shrink-0 flex-row items-center rounded-full px-4 py-2 ' +
        (active ? 'bg-primary' : 'border-border bg-surface border')
      }
    >
      <Text
        className={
          'text-sm font-medium ' + (active ? 'text-primary-foreground' : 'text-foreground')
        }
      >
        {label}
      </Text>
      {count !== undefined ? (
        <Text
          className={
            'num ml-1.5 text-xs opacity-60 ' +
            (active ? 'text-primary-foreground' : 'text-foreground')
          }
        >
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}
