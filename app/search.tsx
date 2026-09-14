/**
 * Search results.
 *
 * Ported from `edawr-frontend/src/app/search/SearchPage.tsx`. The query lives
 * in the route params, not in component state — which is what makes a result
 * shareable, back-navigable, and re-enterable from the overlay without this
 * screen having to know the overlay exists.
 *
 * `draft` is the text in the field; `query` is what has actually been searched.
 * They are separate so typing does not fire a request per keystroke here (the
 * overlay is the debounced surface), and so the field can be cleared without
 * throwing away the results underneath it.
 */
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ProductGrid } from '@/components/ProductGrid';
import { usePromiseMinutes, useRecentSearches } from '@/hooks/useStoreData';
import { slugify } from '@/lib/catalogue';
import { rememberSearch } from '@/lib/recent-searches';
import { fetchCategories, fetchProducts } from '@/lib/store-api';
import { GUTTER, colors } from '@/theme';
import type { StoreCategory, StoreProduct } from '@/types';

const PAGE_SIZE = 40;

interface Results {
  query: string;
  products: StoreProduct[];
  error: string;
}

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const query = (params.q ?? '').trim();

  const recent = useRecentSearches();
  const promiseMinutes = usePromiseMinutes();
  const [draft, setDraft] = useState(query);
  const [results, setResults] = useState<Results | null>(null);
  const [categories, setCategories] = useState<StoreCategory[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCategories(controller.signal)
      .then(setCategories)
      .catch(() => {
        /* Suggestions are a convenience. */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!query) return;

    const controller = new AbortController();
    rememberSearch(query);

    fetchProducts({ q: query, limit: PAGE_SIZE }, controller.signal)
      .then((products) => setResults({ query, products, error: '' }))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setResults({
          query,
          products: [],
          error: caught instanceof Error ? caught.message : 'Search is unavailable right now.',
        });
      });

    return () => controller.abort();
  }, [query]);

  // Derived, not stored — results belonging to a different query are stale.
  const current = results?.query === query ? results : null;
  const isLoading = query.length > 0 && current === null;

  const submit = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    router.setParams({ q: trimmed });
  };

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="py-8 pb-16"
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="border-border bg-surface flex-row items-center gap-3 rounded-full border px-5 py-3">
        <Search size={20} color={colors.mutedForeground} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => submit(draft)}
          returnKeyType="search"
          accessibilityLabel="Search products"
          placeholder="Search for groceries, snacks, household…"
          placeholderTextColor={colors.mutedForeground}
          className="text-foreground min-w-0 flex-1 text-base"
        />
        {draft ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            onPress={() => setDraft('')}
            className="h-7 w-7 shrink-0 items-center justify-center rounded-full"
          >
            <X size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {!query ? (
        <View className="mt-10 gap-8">
          {recent.length > 0 ? (
            <View>
              <Text className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
                Recent searches
              </Text>
              <View className="mt-4 flex-row flex-wrap gap-2">
                {recent.map((term) => (
                  <Pressable
                    key={term}
                    accessibilityRole="button"
                    onPress={() => submit(term)}
                    className="bg-secondary rounded-full px-4 py-2"
                  >
                    <Text className="text-foreground text-sm">{term}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {categories.length > 0 ? (
            <View>
              <Text className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
                Browse categories instead
              </Text>
              <View className="mt-4 flex-row flex-wrap gap-2">
                {categories.map((category) => (
                  <Link
                    key={category.name}
                    href={{
                      pathname: '/category/[slug]',
                      params: { slug: slugify(category.name) },
                    }}
                    asChild
                  >
                    <Pressable accessibilityRole="link" className="bg-secondary rounded-full px-4 py-2">
                      <Text className="text-foreground text-sm">{category.name}</Text>
                    </Pressable>
                  </Link>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <Text className="text-foreground mt-8 text-2xl font-semibold">
            Results for “{query}”
          </Text>
          {current && !current.error ? (
            <Text className="text-muted-foreground num mt-2 text-sm">
              {current.products.length} {current.products.length === 1 ? 'item' : 'items'}
            </Text>
          ) : null}
          {current?.error ? (
            <Text className="text-destructive mt-2 text-sm">{current.error}</Text>
          ) : null}

          <View className="mt-8">
            <ProductGrid
              products={current?.products ?? []}
              isLoading={isLoading}
              promiseMinutes={promiseMinutes}
              emptyTitle={'Nothing matches “' + query + '”'}
              emptyBody="Try a shorter word, or browse the categories."
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}
