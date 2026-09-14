/**
 * The design tokens, as values.
 *
 * `tailwind.config.js` is the primary surface — almost all styling is
 * `className` strings copied from the storefront. This file exists for the
 * places a class cannot reach: the status bar, `contentContainerStyle`, native
 * shadow objects, Reanimated timing, and anything passed to a component as a
 * prop (icon `color`, `placeholderTextColor`, `RefreshControl` tint).
 *
 * Keep the two in step. If a colour changes here it changes there, and the
 * source of truth for both is `edawr-frontend/src/app/globals.css`.
 *
 * The rider app has no file like this, and `DeliveryScreen.tsx` grew a 500-line
 * stylesheet of repeated literals as a direct result. That is the mistake this
 * file exists to not repeat.
 */

/** oklch tokens from globals.css, converted to sRGB — the value a browser paints. */
export const colors = {
  background: '#FFFFFF',
  foreground: '#050C1D',
  surface: '#F7F8FA',
  card: '#FFFFFF',
  cardForeground: '#050C1D',
  primary: '#070D1E',
  primaryForeground: '#FFFFFF',
  secondary: '#F3F4F7',
  secondaryForeground: '#070D1E',
  muted: '#F3F4F7',
  mutedForeground: '#666C78',
  accent: '#F1F2F6',
  accentForeground: '#070D1E',
  /** A FILL, never ink — see the palette rule in tailwind.config.js. */
  amber: '#F7A438',
  amberForeground: '#070D1E',
  amberSoft: '#FFF4DC',
  success: '#007E46',
  successSoft: '#E3F8E9',
  destructive: '#D40C1A',
  destructiveForeground: '#FFFFFF',
  destructiveSoft: '#FFF0ED',
  border: '#E4E6EA',
  input: '#E4E6EA',
  ring: '#F7A438',
} as const;

/**
 * `border-border/70` is the storefront's card outline — border at 70% over
 * white. NativeWind resolves the modifier itself, but a few native props take a
 * plain colour and cannot, so the flattened value lives here.
 */
export const borderSoft = '#E9EBEE';

/** From `--radius: 1rem`. Pills 9999, inputs 28, tiles 36, panels 44. */
export const radius = {
  sm: 10,
  md: 13,
  lg: 16,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
  '4xl': 44,
  full: 9999,
} as const;

/**
 * `--shadow-card` and `--shadow-lift`, tinted `#030819`.
 *
 * A CSS shadow is two layers; React Native gives one. Each is approximated by
 * its larger, more visible layer, and Android needs `elevation` besides — the
 * `shadow*` props do nothing there.
 */
export const shadow = {
  card: {
    shadowColor: '#030819',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 2,
  },
  lift: {
    shadowColor: '#030819',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 44,
    elevation: 6,
  },
} as const;

/** Page gutter. The storefront's `container-page` is `padding-inline: 1.25rem`. */
export const GUTTER = 20;

/**
 * How far a toast sits above the bottom of the screen, before the safe-area
 * inset the `Toaster` adds on top of it.
 *
 * The `Toaster` is absolutely positioned against the whole window, outside the
 * header/content/nav column, so unlike the sticky CTAs it genuinely does have
 * to clear the tab bar itself — and the CTA stacked on top of that.
 *
 * 144 = the 56pt nav row + the ~77pt sticky action bar on cart and checkout +
 * a little air. It was 88, which assumed a 68pt bar and no CTA above it, so a
 * toast covered most of the action bar: on the cart that is the "Undo" on a
 * just-emptied basket, and on checkout the Place order button. The storefront
 * carries the same figure as `calc(var(--tabbar-height) + 5.5rem)`.
 */
export const TOAST_OFFSET = 144;

/**
 * `--ease-apple: cubic-bezier(0.32, 0.72, 0, 1)`, for Reanimated's `Easing.bezier`.
 * Used on essentially every transition in the storefront.
 */
export const EASE_APPLE = [0.32, 0.72, 0, 1] as const;

/** Durations the storefront animates at, in ms. */
export const duration = {
  /** `animate-pop` — the signature scale on adds and quantity changes. */
  pop: 280,
  /** `animate-rise` — opacity + 12px lift, on first paint of a hero. */
  rise: 500,
  /** `animate-pulse-soft`, one full cycle. */
  pulse: 1800,
  button: 300,
  card: 400,
  image: 700,
} as const;

/**
 * Typography, as the storefront sets it globally.
 *
 * `num` is applied to every price, quantity, count, countdown, order id and
 * timestamp — tabular figures stop a ticking countdown from shifting the layout
 * under itself.
 */
export const type = {
  bodyLetterSpacing: -0.011 * 16,
  headingLetterSpacing: -0.03 * 16,
  numLetterSpacing: -0.02 * 16,
} as const;
