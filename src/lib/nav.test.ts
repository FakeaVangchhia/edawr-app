import { TAB_OWNS, isTabActive, under, type TabKey } from './nav';

/**
 * The regression these exist for: the category page is `/category/[slug]` and the
 * tracker is `/order/[token]`, both singular, behind plural tabs. The old
 * `startsWith(href)` rule missed both, so the two commonest journeys in the app
 * rendered a tab bar with nothing selected.
 */

describe('under', () => {
  it('matches the prefix itself and anything beneath it', () => {
    expect(under('/orders', '/orders')).toBe(true);
    expect(under('/order/abc123', '/order')).toBe(true);
  });

  it('does not match a route that merely starts with the same characters', () => {
    // The reason this is not a bare `startsWith`.
    expect(under('/categories-old', '/categories')).toBe(false);
    expect(under('/ordersomething', '/order')).toBe(false);
  });

  it('treats "/" as the home route only, not as a prefix of everything', () => {
    expect(under('/', '/')).toBe(true);
    expect(under('/cart', '/')).toBe(false);
  });
});

describe('isTabActive', () => {
  it('lights Categories on a single category page', () => {
    // `'/category/dairy'.startsWith('/categories')` is false — the whole bug.
    expect(isTabActive('/category/dairy', 'categories')).toBe(true);
    expect(isTabActive('/categories', 'categories')).toBe(true);
  });

  it('lights Orders on the tracker', () => {
    expect(isTabActive('/order/abc123', 'orders')).toBe(true);
    expect(isTabActive('/orders', 'orders')).toBe(true);
  });

  it('lights Account on the routes that belong to it', () => {
    for (const path of ['/account', '/addresses', '/signin', '/signup']) {
      expect(isTabActive(path, 'account')).toBe(true);
    }
  });

  it('lights Home only on the home page', () => {
    expect(isTabActive('/', 'home')).toBe(true);
    expect(isTabActive('/products', 'home')).toBe(false);
  });

  it('lights nothing on routes no tab owns', () => {
    const tabs = Object.keys(TAB_OWNS) as TabKey[];
    // Cart and checkout are reached from the header; a product page is arrived
    // at from several sections and belongs to none.
    for (const path of ['/cart', '/checkout', '/product/12']) {
      expect(tabs.filter((tab) => isTabActive(path, tab))).toEqual([]);
    }
  });

  it('never lights two tabs at once', () => {
    const tabs = Object.keys(TAB_OWNS) as TabKey[];
    const paths = [
      '/',
      '/categories',
      '/category/dairy',
      '/orders',
      '/order/abc123',
      '/account',
      '/addresses',
      '/signin',
      '/signup',
    ];
    for (const path of paths) {
      expect(tabs.filter((tab) => isTabActive(path, tab))).toHaveLength(1);
    }
  });
});
