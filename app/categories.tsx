/**
 * Every category in the store.
 *
 * Ported from `edawr-frontend/src/app/categories/CategoriesPage.tsx`.
 *
 * The list comes from `/api/store/categories`, which builds itself from the
 * products that actually exist rather than from the category table — so an
 * category with nothing sellable in it never renders as an empty shelf.
 */
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { ImageFallback } from '@/components/ImageFallback';
import { Skeleton } from '@/components/ui/motion';
import { useStoreConfig } from '@/hooks/useStoreData';
import { assetUrl } from '@/lib/api';
import { slugify } from '@/lib/catalogue';
import { fetchCategories } from '@/lib/store-api';
import { GUTTER } from '@/theme';
import type { StoreCategory } from '@/types';

export default function CategoriesScreen() {
  const config = useStoreConfig();
  const [categories, setCategories] = useState<StoreCategory[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchCategories(controller.signal)
      .then(setCategories)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Could not load the categories.');
      });
    return () => controller.abort();
  }, []);

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="py-10 pb-16"
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
    >
      <Text className="text-foreground text-3xl font-semibold">Categories</Text>
      <Text className="text-muted-foreground mt-3 text-base">
        {categories
          ? categories.length +
            ' ' +
            (categories.length === 1 ? 'category' : 'categories') +
            '. Everything arrives' +
            (config ? ' in about ' + config.promise_minutes + ' minutes' : ' in minutes') +
            '.'
          : 'Everything you need, organised for a one-second decision.'}
      </Text>

      {error ? <Text className="text-destructive mt-8 text-sm">{error}</Text> : null}

      <View className="mt-10 flex-row flex-wrap" style={{ marginHorizontal: -8 }}>
        {categories
          ? categories.map((category) => {
              const image = assetUrl(category.image_url);
              return (
                <View key={category.name} className="w-1/2 px-2 pb-4">
                  <Link
                    href={{
                      pathname: '/category/[slug]',
                      params: { slug: slugify(category.name) },
                    }}
                    asChild
                  >
                    <Pressable
                      accessibilityRole="link"
                      className="border-border/70 bg-card rounded-3xl border p-3"
                    >
                      <View className="bg-surface overflow-hidden rounded-2xl">
                        {image ? (
                          <Image
                            source={{ uri: image }}
                            className="aspect-square w-full"
                            resizeMode="cover"
                          />
                        ) : (
                          <ImageFallback className="aspect-square w-full" />
                        )}
                      </View>
                      <Text className="text-foreground mt-3 px-1 text-[15px] font-semibold">
                        {category.name}
                      </Text>
                      <Text className="text-muted-foreground num px-1 pb-1 text-xs">
                        {category.product_count}{' '}
                        {category.product_count === 1 ? 'item' : 'items'}
                      </Text>
                    </Pressable>
                  </Link>
                </View>
              );
            })
          : Array.from({ length: 8 }, (_, index) => (
              <View key={index} className="w-1/2 px-2 pb-4">
                <Skeleton className="h-64 rounded-3xl" />
              </View>
            ))}
      </View>
    </ScrollView>
  );
}
