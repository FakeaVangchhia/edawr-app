import type { StoreCategory, StoreProduct } from '@/types';

/**
 * Turning the catalogue into the shapes the storefront renders.
 *
 * Two jobs live here, and both exist because the API is deliberately narrow.
 *
 * **Slugs.** `Product.category` is free text — there is no category table with
 * an id to route on, and `StoreCategory` carries only a name. So the URL slug is
 * derived from the name and resolved back by matching derived slugs. That means
 * a renamed category changes its URL, which is correct: the old URL described a
 * category that no longer exists.
 *
 * **Homepage rows.** The prototype this design came from drove its rows off
 * hardcoded tags — "Trending Near You", "Picked for You". There is no tag field
 * on `Product` and no personalisation in this system, so those rows would have
 * been decoration claiming to be data. Every row below is instead derived from
 * something the API actually says.
 */

/** URL-safe slug for a category name. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve a slug back to the category it names.
 *
 * Matching on the derived slug rather than on the name means the round trip is
 * exact by construction: whatever `slugify` produced for a link is what this
 * looks for. Comparing against a hand-written slug column would let the two
 * drift, and the failure would be a 404 on a link the app itself rendered.
 */
export function categoryForSlug(
  categories: StoreCategory[],
  slug: string,
): StoreCategory | null {
  return categories.find((category) => slugify(category.name) === slug) ?? null;
}

/** One merchandising row on the homepage. */
export interface ProductRow {
  key: string;
  title: string;
  subtitle?: string;
  items: StoreProduct[];
  /** Where "see everything in this row" goes, when that is a real page. */
  href?: string;
  /** Marks the row the design gives the amber bolt to. Exactly one, at most. */
  accent?: boolean;
}

/** The ceiling the design's horizontal rails scroll to. */
const ROW_SIZE = 10;

/**
 * The threshold for the "Under ₹199" row.
 *
 * A display-side filter over prices the server sent, not a calculation — the
 * figure it compares against was computed in Decimal by `api/pricing.py` and is
 * only being *read* here. This is the line the money rule cares about: no total
 * is derived, nothing is summed.
 */
const BUDGET_CEILING = 199;

/**
 * Build the homepage rows from real catalogue data.
 *
 * `products` should be a decent slice of the catalogue — the caller fetches one
 * page of it. Rows that come up empty are dropped rather than rendered as an
 * empty rail, which is why the homepage looks sensible on a store with four
 * products and on one with four hundred.
 */
export function buildHomeRows(
  products: StoreProduct[],
  categories: StoreCategory[],
): ProductRow[] {
  const rows: ProductRow[] = [];

  // In-stock first everywhere. The API already sorts the list that way, but
  // these rows re-sort by price and discount, which would otherwise float a
  // sold-out item to the top of the page.
  const sellable = products.filter((product) => product.in_stock);

  const budget = sellable
    .filter((product) => product.price <= BUDGET_CEILING)
    .sort((a, b) => a.price - b.price)
    .slice(0, ROW_SIZE);

  if (budget.length > 0) {
    rows.push({
      key: 'budget',
      title: `Under ₹${BUDGET_CEILING}`,
      subtitle: 'Everyday prices, no trade-offs',
      items: budget,
      accent: true,
    });
  }

  const discounted = sellable
    .filter((product) => product.discount_percent > 0)
    .sort((a, b) => b.discount_percent - a.discount_percent)
    .slice(0, ROW_SIZE);

  if (discounted.length > 0) {
    rows.push({
      key: 'value',
      title: 'Best value today',
      subtitle: 'The biggest savings against MRP right now',
      items: discounted,
    });
  }

  // Then the store's own categories, in the order the manager sorted them. Three is
  // enough to give the page rhythm without turning it into the full catalogue,
  // which is what /products is for.
  for (const category of categories.slice(0, 3)) {
    const items = sellable
      .filter((product) => product.category === category.name)
      .slice(0, ROW_SIZE);

    // A category rail with two items in it reads as a broken row rather than a
    // short one, so it is not worth a heading.
    if (items.length < 3) continue;

    rows.push({
      key: `category-${slugify(category.name)}`,
      title: category.name,
      items,
      href: `/category/${slugify(category.name)}`,
    });
  }

  return rows;
}

/** Sort orders offered on /products, applied to what the API returned. */
export type SortKey = 'recommended' | 'price-asc' | 'price-desc' | 'discount';

export const SORT_LABELS: Record<SortKey, string> = {
  recommended: 'Recommended',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  discount: 'Biggest saving',
};

/**
 * Reorder a page of products.
 *
 * "Recommended" is the server's own order (in-stock first, then cheapest) and
 * therefore returns the array untouched. Sorting is client-side because it
 * reorders a page that has already been fetched; it never changes *which*
 * products are shown, which is the server's decision.
 */
export function sortProducts(products: StoreProduct[], sort: SortKey): StoreProduct[] {
  if (sort === 'recommended') return products;

  const sorted = [...products];
  if (sort === 'price-asc') sorted.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') sorted.sort((a, b) => b.price - a.price);
  if (sort === 'discount') sorted.sort((a, b) => b.discount_percent - a.discount_percent);
  return sorted;
}
