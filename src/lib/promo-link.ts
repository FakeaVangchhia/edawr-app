/**
 * Where a banner goes, and how the card should say so.
 *
 * `Promo.link` is a storefront path or one of the external destinations the API
 * allows — `https://`/`http://` (a website, or WhatsApp via wa.me), `tel:` and
 * `mailto:`. The API is the gate on what the string may be; this only reads it.
 *
 * Ported from `edawr-frontend/src/lib/promo-link.ts`, **unchanged**, including
 * `newTab`. There are no tabs here — the caller hands an external destination to
 * `Linking.openURL` and the OS decides which app answers — but the flag still
 * carries the distinction it was named for: a website leaves the app and the
 * customer comes back to it, whereas `tel:` and WhatsApp hand off to something
 * that will hand back. `PromoCarousel` uses it to word the card, and keeping the
 * shape identical is what lets the test file be the storefront's, line for line.
 */

export type PromoDestination = {
  href: string;
  /** True for anything that is not a screen of this app. */
  external: boolean;
  /** Websites only — see above. */
  newTab: boolean;
  /** The button label: "Shop now" is wrong for a phone number. */
  cta: string;
};

export function promoDestination(link: string | null | undefined): PromoDestination {
  const href = (link ?? '').trim() || '/products';
  if (href.startsWith('/')) {
    return { href, external: false, newTab: false, cta: 'Shop now' };
  }
  const lower = href.toLowerCase();
  if (lower.startsWith('https://wa.me/') || lower.startsWith('https://api.whatsapp.com/')) {
    return { href, external: true, newTab: false, cta: 'Message on WhatsApp' };
  }
  if (lower.startsWith('tel:')) {
    return { href, external: true, newTab: false, cta: 'Call now' };
  }
  if (lower.startsWith('mailto:')) {
    return { href, external: true, newTab: false, cta: 'Email us' };
  }
  return { href, external: true, newTab: true, cta: 'Learn more' };
}
