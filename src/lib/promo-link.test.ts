import { promoDestination } from './promo-link';

/** Ported from `edawr-frontend/src/lib/promo-link.test.ts`, case for case. */
describe('promoDestination()', () => {
  it('treats a path, or nothing, as a screen of the app', () => {
    expect(promoDestination(null)).toEqual({
      href: '/products',
      external: false,
      newTab: false,
      cta: 'Shop now',
    });
    expect(promoDestination('/offers')).toMatchObject({ href: '/offers', external: false });
  });

  it('hands a phone, WhatsApp or mail link to the other app', () => {
    expect(promoDestination('https://wa.me/919812345678')).toMatchObject({
      external: true,
      newTab: false,
      cta: 'Message on WhatsApp',
    });
    expect(promoDestination('tel:+919812345678')).toMatchObject({
      external: true,
      newTab: false,
      cta: 'Call now',
    });
    expect(promoDestination('mailto:a@b.co')).toMatchObject({
      external: true,
      newTab: false,
      cta: 'Email us',
    });
  });

  it('marks a website as the destination that leaves the app', () => {
    expect(promoDestination('https://example.com/sale')).toEqual({
      href: 'https://example.com/sale',
      external: true,
      newTab: true,
      cta: 'Learn more',
    });
  });
});
