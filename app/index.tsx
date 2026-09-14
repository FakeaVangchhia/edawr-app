/**
 * The storefront home.
 *
 * Ported from `edawr-frontend/src/app/HomePage.tsx`.
 *
 * The prototype this design came from drove its rows off hardcoded tags —
 * "Trending Near You", "Picked for You". `Product` has no tag field and this
 * system has no personalisation, so those rows would have been decoration
 * dressed as data. `buildHomeRows` derives every row from something the API
 * actually says instead; see `lib/catalogue.ts`.
 *
 * The facts under the headline follow the same principle. They show the store's
 * real promise and its real catalogue size, and nothing else — the prototype's
 * "4.9 customer rating" had no rating system behind it.
 */
import { Link } from 'expo-router';
import { ArrowRight, PackageCheck, ShieldCheck, Zap } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { ImageFallback } from '@/components/ImageFallback';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductRail } from '@/components/ProductRail';
import { Rise, Skeleton } from '@/components/ui/motion';
import { useAddressBook, useStoreConfig } from '@/hooks/useStoreData';
import { selectedAddress } from '@/lib/addresses';
import { assetUrl } from '@/lib/api';
import { buildHomeRows, slugify, type ProductRow } from '@/lib/catalogue';
import { formatMoney } from '@/lib/format';
import { fetchCategories, fetchProducts } from '@/lib/store-api';
import { GUTTER, colors } from '@/theme';
import type { StoreCategory, StoreProduct } from '@/types';

/** One page of the catalogue is plenty to build every row from. */
const HOME_PRODUCT_LIMIT = 120;

/**
 * How many products the home grid shows before "View all".
 *
 * Twenty is ten rows at two columns — enough that the screen is visibly a shop
 * rather than a sample, without turning home into /products, which exists and
 * pages properly.
 */
const SHELF_SIZE = 20;

/**
 * How many categories the top of the screen features.
 *
 * Two, and the number is doing work. One is a promotion and reads as an advert;
 * four is the category strip, which sits directly below with all of them.
 */
const FEATURED_COUNT = 2;

interface Loaded {
  categories: StoreCategory[];
  rows: ProductRow[];
  /** In-stock products, in the order the API returned them — the shop grid. */
  shelf: StoreProduct[];
  /** The two busiest categories, for the cards at the top. */
  featured: StoreCategory[];
  productCount: number;
}

export default function HomeScreen() {
  const config = useStoreConfig();
  const book = useAddressBook();
  const address = selectedAddress(book);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetchCategories(controller.signal),
      // Sorted by what people actually buy. The grid below is this screen's
      // answer to "what is in the shop", and cheapest-first answers a question
      // nobody asked. The rails further down re-sort this same list by price
      // and by discount, which is what makes them a different cut rather than
      // the same one again.
      fetchProducts({ limit: HOME_PRODUCT_LIMIT, sort: 'popular' }, controller.signal),
      // A second categories request rather than a client-side sort of the
      // first, because the ranking is not derivable from a category: it is
      // units sold across its products over the last thirty days, which only
      // the server can count.
      fetchCategories(controller.signal, { sort: 'popular' }),
    ])
      .then(([categories, products, popular]) => {
        // Guarded like the catch below, which always was. This resolves after a
        // round trip the customer may have navigated away from, and the abort
        // in the cleanup does not stop an already-resolved promise from writing.
        if (controller.signal.aborted) return;
        setData({
          categories,
          rows: buildHomeRows(products, categories),
          // Out-of-stock rows are filtered here rather than hidden, so the grid
          // below never renders a short row of tiles nobody can buy.
          shelf: products.filter((product) => product.in_stock),
          featured: popular.slice(0, FEATURED_COUNT),
          productCount: products.length,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Could not load the store.');
      });

    return () => controller.abort();
  }, []);

  const city = address?.city || config?.store_city || 'Aizawl';
  const promise = config?.promise_minutes ?? null;

  return (
    <ScrollView className="bg-background flex-1" contentContainerClassName="pb-6">
      {/*
        A band, not a landing screen. On the web this was once a full-height
        hero; for a shop whose whole promise is speed, the slowest thing on the
        page was reaching something you could buy.
      */}
      <View className="border-border/70 border-b">
        <View className="gap-4 py-6" style={{ paddingHorizontal: GUTTER }}>
          <Rise>
            <Text className="text-foreground text-[26px] font-semibold leading-[1.1]">
              Everything you need,{' '}
              <Text className="text-muted-foreground">
                {promise ? 'in ' + promise + ' minutes.' : 'in minutes.'}
              </Text>
            </Text>

            {/* The three facts from the old stat block, as one line. */}
            <View className="mt-2 flex-row flex-wrap items-center gap-x-4 gap-y-1">
              <View className="flex-row items-center gap-1.5">
                <Zap size={14} color={colors.amber} fill={colors.amber} />
                <Text className="text-muted-foreground text-[13px]">
                  {address ? 'Deliver to ' + address.label + ' · ' + city : 'Delivering across ' + city}
                </Text>
              </View>
              {config ? (
                <View className="flex-row items-center gap-1.5">
                  <ShieldCheck size={14} color={colors.amber} />
                  <Text className="text-muted-foreground text-[13px]">
                    Free over {formatMoney(config.free_delivery_above)}
                  </Text>
                </View>
              ) : null}
              {data ? (
                <View className="flex-row items-center gap-1.5">
                  <PackageCheck size={14} color={colors.amber} />
                  <Text className="text-muted-foreground text-[13px]">
                    {data.categories.length} categories
                  </Text>
                </View>
              ) : null}
            </View>
          </Rise>

          <Link href="/products" asChild>
            <Pressable
              accessibilityRole="link"
              className="bg-primary h-11 flex-row items-center gap-2 self-start rounded-full px-6"
            >
              <Text className="text-primary-foreground text-sm font-semibold">Shop all</Text>
              <ArrowRight size={16} color={colors.primaryForeground} />
            </Pressable>
          </Link>
        </View>

        {/*
          The two most-ordered categories, and "most ordered" is literal:
          `?sort=popular` ranks by units actually sold over the last thirty
          days, counting only orders that became sales.

          The space is reserved while loading rather than left empty. Rendering
          nothing until the fetch lands means this block grows and shoves the
          rest of the screen down — and someone who taps where a card is about
          to appear hits whatever arrives instead.
        */}
        {data === null || data.featured.length > 0 ? (
          <View className="gap-4 pb-6" style={{ paddingHorizontal: GUTTER }}>
            {data
              ? data.featured.map((category) => (
                  <FeaturedCard key={category.name} category={category} />
                ))
              : Array.from({ length: FEATURED_COUNT }, (_, index) => (
                  <Skeleton key={index} className="aspect-[16/10] w-full rounded-4xl" />
                ))}
          </View>
        ) : null}
      </View>

      <View className="border-border/70 border-b py-10">
        <View
          className="mb-5 flex-row items-end justify-between"
          style={{ paddingHorizontal: GUTTER }}
        >
          <Text className="text-foreground text-2xl font-semibold">Shop by category</Text>
          <Link href="/categories" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <Text className="text-muted-foreground text-sm font-medium">View all</Text>
            </Pressable>
          </Link>
        </View>

        {error ? (
          <Text className="text-destructive text-sm" style={{ paddingHorizontal: GUTTER }}>
            {error}
          </Text>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 16 }}
        >
          {data
            ? data.categories.map((category) => (
                <Link
                  key={category.name}
                  href={{ pathname: '/category/[slug]', params: { slug: slugify(category.name) } }}
                  asChild
                >
                  <Pressable accessibilityRole="link" className="w-28 shrink-0">
                    <View className="border-border/70 bg-surface overflow-hidden rounded-3xl border">
                      <CategoryImage category={category} />
                    </View>
                    <Text className="text-foreground mt-2.5 text-center text-[13px] font-medium">
                      {category.name}
                    </Text>
                  </Pressable>
                </Link>
              ))
            : Array.from({ length: 8 }, (_, index) => (
                <View key={index} className="w-28 shrink-0">
                  <Skeleton className="aspect-square w-full rounded-3xl" />
                </View>
              ))}
        </ScrollView>
      </View>

      {/*
        The shop itself, and the reason the band above is a band.

        The rails below still earn their place: they are *cuts* of the same
        catalogue — cheapest, best discount, per category — which is a different
        question from "what is in the shop". This answers that one.

        `ProductGrid` rather than a bespoke layout, so the columns match
        /products, /category and /search exactly.
      */}
      <View className="py-10">
        <View style={{ paddingHorizontal: GUTTER }}>
          <View className="mb-5 flex-row items-end justify-between gap-4">
            <View className="flex-1">
              <Text className="text-foreground text-2xl font-semibold">In the shop now</Text>
              <Text className="text-muted-foreground mt-1 text-sm">
                {data
                  ? data.shelf.length + ' of ' + data.productCount + ' items in stock today'
                  : 'Loading the shelves…'}
              </Text>
            </View>
            <Link href="/products" asChild>
              <Pressable accessibilityRole="link" hitSlop={8}>
                <Text className="text-muted-foreground shrink-0 text-sm font-medium">View all</Text>
              </Pressable>
            </Link>
          </View>

          <ProductGrid
            products={data ? data.shelf.slice(0, SHELF_SIZE) : []}
            isLoading={data === null}
            promiseMinutes={promise}
            emptyTitle="The shelves are empty right now"
            emptyBody="Everything is out of stock at the moment. Please check back shortly."
          />
        </View>
      </View>

      {data?.rows.map((row) => (
        <ProductRail
          key={row.key}
          title={row.title}
          subtitle={row.subtitle}
          items={row.items}
          href={row.href}
          accent={row.accent}
          promiseMinutes={promise}
        />
      ))}

      {config ? (
        <View className="py-12" style={{ paddingHorizontal: GUTTER }}>
          <View className="bg-primary gap-6 rounded-4xl p-10">
            <View>
              <Text className="text-primary-foreground text-3xl font-semibold">
                Free delivery over {formatMoney(config.free_delivery_above)}.
              </Text>
              <Text className="text-primary-foreground/70 mt-3 text-base">
                Applied automatically at checkout — no code to remember. Live tracking on every
                order.
              </Text>
            </View>
            <Link href="/products" asChild>
              <Pressable
                accessibilityRole="link"
                className="bg-amber h-13 flex-row items-center gap-2 self-start rounded-full px-8"
              >
                <Text className="text-amber-foreground text-base font-semibold">
                  Start shopping
                </Text>
                <ArrowRight size={16} color={colors.amberForeground} />
              </Pressable>
            </Link>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

/**
 * One category card: a picture, and nothing else.
 *
 * **No visible label and no button, deliberately.** The whole card is the
 * target, so there is nothing on it to miss and nothing competing with the
 * image. The category strip immediately below carries the names, so someone who
 * wants to read rather than look has them a few pixels away.
 *
 * "Nothing else" stops at the accessible name: `accessibilityLabel` carries the
 * category, because a link whose only content is a decorative image announces
 * nothing at all to a screen reader.
 */
function FeaturedCard({ category }: { category: StoreCategory }) {
  const image = assetUrl(category.image_url);

  return (
    <Link
      href={{ pathname: '/category/[slug]', params: { slug: slugify(category.name) } }}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={category.name}
        className="bg-surface overflow-hidden rounded-4xl"
      >
        {image ? (
          <Image
            source={{ uri: image }}
            className="aspect-[16/10] w-full"
            resizeMode="cover"
          />
        ) : (
          <ImageFallback className="aspect-[16/10] w-full" />
        )}
      </Pressable>
    </Link>
  );
}

function CategoryImage({ category }: { category: StoreCategory }) {
  const image = assetUrl(category.image_url);
  if (!image) return <ImageFallback className="aspect-square w-full" />;
  return (
    <Image source={{ uri: image }} className="aspect-square w-full" resizeMode="cover" />
  );
}
