/**
 * The stand-in for a product or category with no photo.
 *
 * **This is the common case, not an edge case.** A freshly seeded catalogue has
 * no images at all, so this is what most of the storefront looks like on day
 * one — which is why it is a drawn illustration rather than a grey box.
 *
 * The web loads `public/product-placeholder.svg` through an `<img>`. React
 * Native has no equivalent, so the same shapes are redrawn here with
 * `react-native-svg`: identical geometry, identical literal colours. If that
 * asset is ever replaced with a real illustration, this needs the same edit —
 * which is the one thing the web version's "overwrite one file" design buys
 * that this does not.
 *
 * Every shape sits on transparency so the wrapper's `bg-amber-soft` shows
 * through as the ground, exactly as it does on the web.
 */
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export function ImageFallback({ className }: { className?: string }) {
  return (
    <View
      // Decorative: the product name is already beside it in every call site,
      // so announcing "no product photo yet" would only add noise.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className={`bg-amber-soft items-center justify-center ${className ?? ''}`}
    >
      {/* 58% of the well, as the web's `size-[58%]` sets it. */}
      <Svg viewBox="0 0 64 64" width="58%" height="58%" opacity={0.9}>
        {/* Greens and fruit first: the bag's fold overlaps and crops them. */}
        <Path d="M27 24c-6-4-7-11-1-14 4 3 4 10 1 14z" fill="#7f9e5f" />
        <Path d="M28 21c4-3 9-4 10 0-2 3-7 3-10 0z" fill="#7f9e5f" />
        <Path d="M27.5 24v-7" stroke="#5f7a45" strokeWidth={1.6} strokeLinecap="round" fill="none" />
        <Circle cx={41} cy={19} r={6} fill="#d1694a" />

        {/* Bag: body tapering to the base, then the folded-over top. */}
        <Path d="M14 30h36l-2.4 21.6A4 4 0 0 1 43.6 55H20.4a4 4 0 0 1-4-3.4L14 30z" fill="#e0a441" />
        <Rect x={12} y={22} width={40} height={9} rx={2.5} fill="#edc07d" />
      </Svg>
    </View>
  );
}
