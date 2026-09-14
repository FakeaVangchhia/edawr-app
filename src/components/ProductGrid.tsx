/**
 * The catalogue grid, and its loading and empty states.
 *
 * Ported from `edawr-frontend/src/components/ProductGrid.tsx`. One grid shared
 * by home, products, category and search, so those four screens cannot drift
 * into four slightly different ideas of what an empty category looks like.
 *
 * Two columns, 16px gutter — the storefront's `grid-cols-2 gap-4` below its
 * `sm` breakpoint, which is the branch a phone always takes.
 *
 * **On virtualisation.** This lays out with flex-wrap rather than a FlatList,
 * because every caller embeds it inside a ScrollView alongside other sections —
 * a nested VirtualizedList would warn, and would virtualise nothing useful
 * anyway. The catalogue screens page at 60 items, so the realistic worst case
 * is a few hundred tiles after several taps of "Load more". If those screens
 * ever grow past that, they are the ones that should own a FlatList; this
 * component should stay embeddable.
 */
import { Text, View } from 'react-native';

import { ProductCard } from '@/components/ProductCard';
import { Skeleton } from '@/components/ui/motion';
import type { StoreProduct } from '@/types';

/** How many skeleton tiles a first load shows. Matches the web. */
const SKELETON_COUNT = 10;

export function ProductGrid({
  products,
  isLoading,
  promiseMinutes = null,
  emptyTitle = 'Nothing here yet',
  emptyBody = 'Try another category, or search for something specific.',
}: {
  products: StoreProduct[];
  isLoading: boolean;
  promiseMinutes?: number | null;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  if (isLoading) {
    return (
      <View className="flex-row flex-wrap" style={{ marginHorizontal: -8 }}>
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <View key={index} className="w-1/2 px-2 pb-4">
            {/* h-72 — the height of a real tile, so the page does not jump
                when the catalogue lands. */}
            <Skeleton className="h-72 rounded-3xl" />
          </View>
        ))}
      </View>
    );
  }

  if (products.length === 0) {
    return (
      <View className="border-border/70 items-center rounded-4xl border py-20">
        <Text className="text-foreground text-lg font-semibold">{emptyTitle}</Text>
        <Text className="text-muted-foreground mt-2 max-w-sm px-6 text-center text-sm">
          {emptyBody}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -8 }}>
      {products.map((product) => (
        <View key={product.id} className="w-1/2 px-2 pb-4">
          <ProductCard product={product} promiseMinutes={promiseMinutes} />
        </View>
      ))}
    </View>
  );
}
