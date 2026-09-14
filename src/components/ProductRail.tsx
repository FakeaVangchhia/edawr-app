/**
 * A horizontal rail of product tiles.
 *
 * Ported from the `ProductRail` export of
 * `edawr-frontend/src/components/ProductCard.tsx`. It lives in its own file
 * here only because that file was already the largest component in the port.
 *
 * The web renders a snap-scrolling row on mobile and a five-column grid at
 * `lg`. A phone always takes the first branch, so that is the only one built:
 * 170px tiles, 16px apart, snapping to each tile's leading edge, bleeding to
 * the screen edge past the page gutter.
 *
 * Returns null on an empty list rather than an empty rail, and caps at ten —
 * both matching the web, and the cap matters because `buildHomeRows` hands it
 * unbounded slices of the catalogue.
 */
import { Link } from 'expo-router';
import { Zap } from 'lucide-react-native';
import { FlatList, Pressable, Text, View } from 'react-native';

import { ProductCard } from '@/components/ProductCard';
import { colors, GUTTER } from '@/theme';
import type { StoreProduct } from '@/types';

const TILE_WIDTH = 170;
const TILE_GAP = 16;
const MAX_ITEMS = 10;

export function ProductRail({
  title,
  subtitle,
  items,
  href,
  accent,
  promiseMinutes = null,
}: {
  title: string;
  subtitle?: string;
  items: StoreProduct[];
  href?: string;
  accent?: boolean;
  promiseMinutes?: number | null;
}) {
  if (items.length === 0) return null;

  return (
    <View className="py-8">
      <View
        className="mb-5 flex-row items-end justify-between gap-4"
        style={{ paddingHorizontal: GUTTER }}
      >
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            {accent ? <Zap size={20} color={colors.amber} fill={colors.amber} /> : null}
            <Text className="text-foreground flex-1 text-2xl font-semibold">{title}</Text>
          </View>
          {subtitle ? (
            <Text className="text-muted-foreground mt-1 text-sm">{subtitle}</Text>
          ) : null}
        </View>

        {href ? (
          <Link href={href} asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <Text className="text-muted-foreground shrink-0 text-sm font-medium">View all</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>

      <FlatList
        horizontal
        data={items.slice(0, MAX_ITEMS)}
        keyExtractor={(product) => String(product.id)}
        showsHorizontalScrollIndicator={false}
        // `snap-x` plus `snap-start` on the web: each tile comes to rest at the
        // gutter rather than wherever the flick happened to stop.
        snapToInterval={TILE_WIDTH + TILE_GAP}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: TILE_GAP }}
        renderItem={({ item }) => (
          <View style={{ width: TILE_WIDTH }}>
            <ProductCard product={item} promiseMinutes={promiseMinutes} />
          </View>
        )}
      />
    </View>
  );
}
