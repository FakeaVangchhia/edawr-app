/**
 * The search overlay.
 *
 * Ported from `edawr-frontend/src/components/SearchOverlay.tsx`. The web
 * renders it as a Radix dialog anchored near the top of the viewport, opened by
 * ⌘K or the header button; here it is a full-screen modal, opened by the header
 * button. The ⌘K affordance is gone, having no meaning on a phone, and so is
 * the Search tab that used to be a second way in — see `AppShell`'s nav.
 *
 * Results come from `/api/store/products?q=`, not from filtering an array on
 * the device. Filtering client-side would mean shipping the whole catalogue on
 * first launch to make search work, which is fine for a demo and indefensible
 * for a real inventory.
 *
 * The result state is **tagged with the query that produced it**. Without that
 * tag, a slow response for "mi" can land after a fast one for "milk" and
 * silently replace the right results with stale ones. Tagging also means the
 * loading flag is derived rather than stored, so nothing sets state
 * synchronously inside an effect — an error in the storefront's lint config and
 * just as much of a bug here.
 */
import { Link, useRouter } from 'expo-router';
import { Clock, Search, TrendingUp, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddControl } from '@/components/ProductCard';
import { ImageFallback } from '@/components/ImageFallback';
import { PulseSoft } from '@/components/ui/motion';
import { useRecentSearches } from '@/hooks/useStoreData';
import { ApiError, assetUrl } from '@/lib/api';
import { slugify } from '@/lib/catalogue';
import { formatMoney } from '@/lib/format';
import { rememberSearch } from '@/lib/recent-searches';
import { fetchCategories, fetchProducts } from '@/lib/store-api';
import { colors, GUTTER } from '@/theme';
import type { StoreCategory, StoreProduct } from '@/types';

const DEBOUNCE_MS = 250;
/** The web shows the first eight categories as shortcuts. */
const BROWSE_LIMIT = 8;

/**
 * Case-insensitive "is `a` the start of `b`".
 *
 * Decides whether the previous results are worth leaving on screen while the
 * next ones load: "mi" → "milk" is the same search being narrowed, "milk" →
 * "bread" is a different one.
 */
function isPrefix(a: string, b: string): boolean {
  return b.toLowerCase().startsWith(a.toLowerCase());
}

interface Results {
  query: string;
  products: StoreProduct[];
  error: string;
}

export function SearchOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const recent = useRecentSearches();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [categories, setCategories] = useState<StoreCategory[]>([]);

  const term = query.trim();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetchCategories(controller.signal)
      .then(setCategories)
      .catch(() => {
        /* The category shortcuts are a convenience; search still works without them. */
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!term) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchProducts({ q: term, limit: 8 }, controller.signal)
        .then((products) => setResults({ query: term, products, error: '' }))
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setResults({
            query: term,
            products: [],
            error:
              caught instanceof ApiError || caught instanceof Error
                ? caught.message
                : 'Search is unavailable right now.',
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  // Derived, not stored: results are stale whenever they were produced by a
  // different query than the one currently typed.
  //
  // **Stale results stay on screen rather than being replaced by nothing.**
  // This used to render only an exact match for the current term, so every
  // keystroke emptied the list and put "Searching…" in its place — at a 250ms
  // debounce plus a round trip over Aizawl mobile data, typing "milk" flashed
  // the panel blank four times. Holding the previous rows at reduced opacity
  // lets the list settle instead of strobing, and the results a customer is
  // already reading do not vanish from under them. The storefront does the
  // same.
  //
  // **But only rows that could still be about what is being typed.** `results`
  // outlives the modal — closing it resets `query`, not the results — so
  // holding *any* previous rows meant searching "milk", closing, reopening and
  // typing "b" showed the milk rows greyed out as though they were results for
  // "b". Requiring one query to be a prefix of the other keeps exactly the case
  // this exists for and sends everything else back to "Searching…".
  const related =
    results !== null && (isPrefix(results.query, term) || isPrefix(term, results.query));
  const shown = term && related ? results : null;
  const isStale = shown !== null && shown.query !== term;
  const isLoading = term.length > 0 && results?.query !== term;

  const close = () => {
    setQuery('');
    onOpenChange(false);
  };

  const go = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    rememberSearch(trimmed);
    close();
    router.push({ pathname: '/search', params: { q: trimmed } });
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <SafeAreaView className="bg-background flex-1">
        <View
          className="border-border/70 flex-row items-center gap-3 border-b py-4"
          style={{ paddingHorizontal: GUTTER }}
        >
          <Search size={20} color={colors.mutedForeground} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => go(query)}
            returnKeyType="search"
            placeholder="Search for groceries, snacks, household…"
            placeholderTextColor={colors.mutedForeground}
            className="text-foreground min-w-0 flex-1 text-base"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close search"
            onPress={close}
            hitSlop={8}
            className="h-7 w-7 items-center justify-center rounded-full"
          >
            <X size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="p-3"
        >
          {term.length === 0 ? (
            <View className="gap-5 p-2">
              {recent.length > 0 ? (
                <View>
                  <View className="flex-row items-center gap-1.5">
                    <Clock size={14} color={colors.mutedForeground} />
                    <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                      Recent
                    </Text>
                  </View>
                  <View className="mt-3 flex-row flex-wrap gap-2">
                    {recent.map((entry) => (
                      <Pressable
                        key={entry}
                        accessibilityRole="button"
                        onPress={() => go(entry)}
                        className="bg-secondary rounded-full px-3.5 py-1.5"
                      >
                        <Text className="text-foreground text-sm">{entry}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {categories.length > 0 ? (
                <View>
                  <View className="flex-row items-center gap-1.5">
                    <TrendingUp size={14} color={colors.mutedForeground} />
                    <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                      Browse categories
                    </Text>
                  </View>
                  <View className="mt-3 flex-row flex-wrap gap-2">
                    {categories.slice(0, BROWSE_LIMIT).map((category) => (
                      <Link
                        key={category.name}
                        href={{
                          pathname: '/category/[slug]',
                          params: { slug: slugify(category.name) },
                        }}
                        asChild
                      >
                        <Pressable
                          accessibilityRole="link"
                          onPress={close}
                          className="bg-secondary rounded-full px-3.5 py-1.5"
                        >
                          <Text className="text-foreground text-sm">{category.name}</Text>
                        </Pressable>
                      </Link>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : isLoading && !shown ? (
            /* Only while there is nothing to keep on screen. Once there is, the
               dimmed list below carries the pending state instead. */
            <PulseSoft className="p-4">
              <Text className="text-muted-foreground text-sm">Searching…</Text>
            </PulseSoft>
          ) : !isStale && shown?.error ? (
            <Text className="text-destructive p-4 text-sm">{shown.error}</Text>
          ) : !isStale && shown && shown.products.length === 0 ? (
            /* The empty state names the query that produced it, so it is held
               back until that query is the current one — otherwise
               “Nothing matches ‘mi’” flashes up mid-word. */
            <Text className="text-muted-foreground p-4 text-sm">
              Nothing matches “{term}”. Try a shorter word.
            </Text>
          ) : (
            <View style={{ opacity: isStale ? 0.5 : 1 }} pointerEvents={isStale ? 'none' : 'auto'}>
              {shown?.products.map((product) => {
                const image = assetUrl(product.image_url);
                return (
                  <View
                    key={product.id}
                    className="flex-row items-center gap-3 rounded-2xl p-2"
                  >
                    <Link
                      href={{ pathname: '/product/[id]', params: { id: product.id } }}
                      asChild
                    >
                      <Pressable
                        accessibilityRole="link"
                        onPress={close}
                        className="min-w-0 flex-1 flex-row items-center gap-3"
                      >
                        {image ? (
                          <Image
                            source={{ uri: image }}
                            className="bg-surface h-11 w-11 shrink-0 rounded-xl"
                            resizeMode="cover"
                          />
                        ) : (
                          <ImageFallback className="h-11 w-11 shrink-0 rounded-xl" />
                        )}
                        <View className="min-w-0 flex-1">
                          <Text numberOfLines={1} className="text-foreground text-sm font-medium">
                            {product.name}
                          </Text>
                          <Text className="text-muted-foreground num text-xs">
                            {formatMoney(product.price)}
                            {product.unit ? ' · ' + product.unit : ''}
                          </Text>
                        </View>
                      </Pressable>
                    </Link>
                    <AddControl product={product} />
                  </View>
                );
              })}

              {!isStale && shown && shown.products.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => go(term)}
                  className="mt-1 w-full rounded-2xl px-4 py-3"
                >
                  <Text className="text-muted-foreground text-sm font-medium">
                    See all results for “{term}”
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
