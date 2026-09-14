/**
 * The storefront's design system, translated for NativeWind.
 *
 * `edawr-frontend/src/app/globals.css` is the source of truth. It is Tailwind
 * v4, which declares tokens CSS-first in an `@theme` block and resolves colours
 * from oklch at paint time; NativeWind 4 targets Tailwind 3.4, which needs them
 * here as literal values. So every colour below is the oklch token from that
 * file converted to sRGB — the value a browser actually paints, which is what
 * makes the two apps match.
 *
 * Two of those computed values differ from the hex written in that file's own
 * header comment: it names Deep Navy #080E20 and Golden Amber #F5A623, but the
 * oklch it actually ships resolves to #070D1E and #F7A438. The computed values
 * win here, because matching the rendered storefront is the point.
 *
 * THE PALETTE RULE, restated because it is easy to lose in a port: amber on
 * white measures 2.03:1 and fails AA for text by a factor of two. Amber is a
 * FILL, never ink. `amber-foreground` is navy for exactly this reason — do not
 * put amber text on a white ground.
 */

/** Tailwind v4 generates `h-13`, `size-11` and friends from any number on
 *  demand; 3.4 only ships a fixed scale, and the storefront leans on the gaps
 *  (`h-13` is the 52px primary button). So the whole 0–96 range is declared. */
const spacing = { px: '1px' };
for (let n = 0; n <= 96; n++) spacing[n] = `${n * 0.25}rem`;
for (const half of [0.5, 1.5, 2.5, 3.5]) spacing[half] = `${half * 0.25}rem`;

/** From `--radius: 1rem`. The idiom the storefront applies these with:
 *  pills/buttons/steppers `full`, text inputs `2xl`, product and category tiles
 *  `3xl`, section panels and order cards `4xl`. */
const borderRadius = {
  none: '0px',
  sm: '10px',
  DEFAULT: '13px',
  md: '13px',
  lg: '16px',
  xl: '22px',
  '2xl': '28px',
  '3xl': '36px',
  '4xl': '44px',
  full: '9999px',
};

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    spacing,
    borderRadius,
    extend: {
      colors: {
        background: '#FFFFFF',
        foreground: '#050C1D',
        surface: '#F7F8FA',
        card: { DEFAULT: '#FFFFFF', foreground: '#050C1D' },
        popover: { DEFAULT: '#FFFFFF', foreground: '#050C1D' },
        primary: { DEFAULT: '#070D1E', foreground: '#FFFFFF' },
        secondary: { DEFAULT: '#F3F4F7', foreground: '#070D1E' },
        muted: { DEFAULT: '#F3F4F7', foreground: '#666C78' },
        accent: { DEFAULT: '#F1F2F6', foreground: '#070D1E' },
        amber: { DEFAULT: '#F7A438', foreground: '#070D1E', soft: '#FFF4DC' },
        success: { DEFAULT: '#007E46', soft: '#E3F8E9' },
        destructive: { DEFAULT: '#D40C1A', foreground: '#FFFFFF', soft: '#FFF0ED' },
        border: '#E4E6EA',
        input: '#E4E6EA',
        ring: '#F7A438',
      },
      fontFamily: {
        sans: ['Inter', 'System'],
      },
      fontSize: {
        // Tailwind's own scale, restated so a `text-*` class cannot silently
        // pick up a web default line-height that reads wrong on a phone.
        '2xs': ['11px', '15px'],
        xs: ['12px', '16px'],
        sm: ['14px', '20px'],
        base: ['16px', '24px'],
        lg: ['18px', '26px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '30px'],
        '3xl': ['30px', '36px'],
        '4xl': ['36px', '40px'],
        '5xl': ['48px', '52px'],
        '7xl': ['72px', '76px'],
      },
    },
  },
  plugins: [],
};
