import { buildHomeRows, categoryForSlug, slugify, sortProducts } from './catalogue';
import type { StoreCategory, StoreProduct } from '@/types';

/**
 * `slugify` and `categoryForSlug` are a matched pair, and the property that
 * matters is the **round trip**: every link the app renders must resolve back to
 * the category it was built from. A slug that survives `slugify` but not the
 * lookup is a 404 on a link the app itself produced.
 */

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: 1,
    name: 'Amul Taaza Milk',
    category: 'Dairy & Bread',
    brand: 'Amul',
    unit: '500 ml',
    price: 62,
    mrp: 66,
    description: null,
    image_url: null,
    in_stock: true,
    low_stock: false,
    discount_percent: 6,
    ...overrides,
  };
}

function category(name: string, count = 5): StoreCategory {
  return { name, image_url: null, product_count: count };
}

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Fresh Produce')).toBe('fresh-produce');
  });

  it('spells out an ampersand rather than dropping it', () => {
    // "Dairy & Bread" and "Dairy Bread" would otherwise collide on one slug.
    expect(slugify('Dairy & Bread')).toBe('dairy-and-bread');
    expect(slugify('Cold Drinks & Juices')).toBe('cold-drinks-and-juices');
  });

  it('collapses punctuation and runs of separators', () => {
    expect(slugify("Baker's  Choice / Breads")).toBe('baker-s-choice-breads');
  });

  it('never leaves a leading or trailing hyphen', () => {
    expect(slugify('  & Snacks & ')).toBe('and-snacks-and');
    expect(slugify('!!!')).toBe('');
  });
});

describe('categoryForSlug', () => {
  const categories = [
    category('Dairy & Bread'),
    category('Fruits & Vegetables'),
    category('Snacks & Munchies'),
  ];

  it('round-trips every category the API returns', () => {
    for (const entry of categories) {
      expect(categoryForSlug(categories, slugify(entry.name))).toBe(entry);
    }
  });

  it('returns null for a slug nothing produces', () => {
    expect(categoryForSlug(categories, 'electronics')).toBeNull();
  });

  it('does not match on a raw name that was never slugified', () => {
    expect(categoryForSlug(categories, 'Dairy & Bread')).toBeNull();
  });
});

describe('sortProducts', () => {
  const items = [
    product({ id: 1, price: 62, discount_percent: 6 }),
    product({ id: 2, price: 20, discount_percent: 33 }),
    product({ id: 3, price: 249, discount_percent: 0 }),
  ];

  it('leaves "recommended" as the server ordered it', () => {
    // The API sorts in-stock first, then cheapest. Re-sorting here would
    // override a decision the server already made with more information.
    expect(sortProducts(items, 'recommended')).toBe(items);
  });

  it('does not mutate the array it was given', () => {
    const before = items.map((item) => item.id);
    sortProducts(items, 'price-desc');
    expect(items.map((item) => item.id)).toEqual(before);
  });

  it('orders by price in both directions', () => {
    expect(sortProducts(items, 'price-asc').map((item) => item.price)).toEqual([20, 62, 249]);
    expect(sortProducts(items, 'price-desc').map((item) => item.price)).toEqual([249, 62, 20]);
  });

  it('orders by the biggest saving', () => {
    expect(sortProducts(items, 'discount').map((item) => item.id)).toEqual([2, 1, 3]);
  });
});

describe('buildHomeRows', () => {
  const categories = [category('Dairy & Bread'), category('Snacks & Munchies')];

  it('never puts an out-of-stock product in a row', () => {
    const rows = buildHomeRows(
      [
        product({ id: 1, price: 20, in_stock: false }),
        product({ id: 2, price: 30, in_stock: true }),
      ],
      [],
    );

    for (const row of rows) {
      expect(row.items.every((item) => item.in_stock)).toBe(true);
    }
  });

  it('keeps the budget row to items at or below the ceiling', () => {
    const rows = buildHomeRows(
      [product({ id: 1, price: 199 }), product({ id: 2, price: 200 })],
      [],
    );

    const budget = rows.find((row) => row.key === 'budget');
    expect(budget?.items.map((item) => item.id)).toEqual([1]);
  });

  it('only puts genuinely discounted items in the value row', () => {
    const rows = buildHomeRows(
      [
        product({ id: 1, price: 500, discount_percent: 0 }),
        product({ id: 2, price: 500, discount_percent: 20 }),
      ],
      [],
    );

    const value = rows.find((row) => row.key === 'value');
    expect(value?.items.map((item) => item.id)).toEqual([2]);
  });

  it('drops a row rather than rendering an empty rail', () => {
    // A store with nothing discounted should simply not show that heading.
    const rows = buildHomeRows([product({ id: 1, price: 500, discount_percent: 0 })], []);
    expect(rows.some((row) => row.key === 'value')).toBe(false);
  });

  it('skips a category too thin to fill a rail', () => {
    const rows = buildHomeRows(
      [
        product({ id: 1, category: 'Dairy & Bread', price: 500 }),
        product({ id: 2, category: 'Dairy & Bread', price: 500 }),
      ],
      categories,
    );

    expect(rows.some((row) => row.key === 'category-dairy-and-bread')).toBe(false);
  });

  it('includes a category once it has enough to show', () => {
    const rows = buildHomeRows(
      [1, 2, 3].map((id) => product({ id, category: 'Dairy & Bread', price: 500 })),
      categories,
    );

    const row = rows.find((entry) => entry.key === 'category-dairy-and-bread');
    expect(row?.items).toHaveLength(3);
    expect(row?.href).toBe('/category/dairy-and-bread');
  });

  it('gives the accent to at most one row', () => {
    const rows = buildHomeRows(
      [1, 2, 3, 4].map((id) => product({ id, price: 50, discount_percent: 10 })),
      categories,
    );

    expect(rows.filter((row) => row.accent)).toHaveLength(1);
  });

  it('produces nothing at all from an empty catalogue', () => {
    expect(buildHomeRows([], categories)).toEqual([]);
  });
});
