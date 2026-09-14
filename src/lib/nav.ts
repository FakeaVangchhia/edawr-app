/**
 * Which routes each tab stands for.
 *
 * Ported from `edawr-frontend/src/lib/nav.ts`, unchanged: expo-router and the
 * Next app use the same paths, so the same rule governs both bars.
 *
 * This lives in `lib/` rather than inside `AppShell` because it is pure route
 * logic and because it was silently wrong for a long time with nothing to catch
 * it. Highlighting used to be `pathname.startsWith(tab.href)`, and this app's
 * routes are singular where its tabs are plural: the category page is
 * `/category/[slug]` behind a `/categories` tab, and the tracker is
 * `/order/[token]` behind `/orders`. Neither
 * `'/category/dairy'.startsWith('/categories')` nor
 * `'/order/abc'.startsWith('/orders')` is true, so the two journeys customers
 * make most — browsing a category, watching an order arrive — both drew a tab bar
 * with nothing selected at all.
 *
 * As a plain function it is covered by `nav.test.ts`, so the next route added
 * under a different name fails a test rather than quietly unlighting a tab.
 */

/** The tab keys, in the order they appear in the bar. */
export type TabKey = 'home' | 'categories' | 'orders' | 'account';

/**
 * Every route prefix a tab owns.
 *
 * Deliberately owned by nobody: `/cart` and `/checkout`, which are reached from
 * the header rather than from a tab, and `/product/[id]`, which is arrived at
 * from several different sections and belongs to none of them. A tab bar with
 * nothing lit is the honest answer on those.
 */
export const TAB_OWNS: Record<TabKey, readonly string[]> = {
  home: ['/'],
  categories: ['/categories', '/category'],
  orders: ['/orders', '/order'],
  account: ['/account', '/addresses', '/signin', '/signup'],
};

/**
 * True when `pathname` is `prefix` or sits underneath it.
 *
 * Segment-aware on purpose. A bare `startsWith` would treat `/categories-old`
 * as a page under `/categories`, and would match `'/'` against every route in
 * the app — lighting up Home everywhere.
 */
export function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when this tab owns the route currently on screen. */
export function isTabActive(pathname: string, tab: TabKey): boolean {
  return TAB_OWNS[tab].some((prefix) => under(pathname, prefix));
}
