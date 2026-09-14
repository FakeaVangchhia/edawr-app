/**
 * The storefront's three keyframes, rebuilt in Reanimated.
 *
 * `globals.css` defines `pop`, `rise` and `pulse-soft` and applies them through
 * `animate-*` classes. NativeWind does not carry CSS keyframes across, so they
 * are components here — which is the same shape the web uses anyway, since
 * `animate-pop` is applied by remounting an element with `key={quantity}`.
 *
 * All three honour the OS reduce-motion setting, matching the
 * `prefers-reduced-motion` block at the bottom of `globals.css`. That block
 * clamps every animation to 0.01ms rather than removing it, and these do the
 * same thing by rendering the settled state directly: the point is that the
 * element still ends up where it belongs, just without the travel.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, type ViewProps } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { duration, EASE_APPLE } from '@/theme';

const easeApple = Easing.bezier(...EASE_APPLE);

/**
 * Whether the OS asks for reduced motion.
 *
 * A hook rather than a module constant because it can change while the app is
 * open — someone turning it on in Settings should not have to relaunch.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReduce(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return reduce;
}

/**
 * `animate-pop` — scale 0.86 → 1.06 → 1 over 280ms.
 *
 * **The app's signature interaction.** It fires on the cart badge, on the Add
 * button as it becomes a stepper, and on the quantity numeral itself. The
 * overshoot past 1 is the whole character of it: a straight 0.86 → 1 reads as
 * something sliding into place, while the overshoot reads as something landing.
 *
 * Replays whenever `replayKey` changes, which is how the web gets the same
 * effect from `key={quantity}` forcing a remount.
 */
export function Pop({
  children,
  replayKey,
  style,
  ...rest
}: ViewProps & { replayKey?: string | number }) {
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduce) {
      scale.value = 1;
      return;
    }
    // 0.86 → 1.06 at 60% of the way through → 1. The two segments are split
    // 60/40 to match the CSS keyframe's own timing.
    scale.value = withSequence(
      withTiming(0.86, { duration: 0 }),
      withTiming(1.06, { duration: duration.pop * 0.6, easing: easeApple }),
      withTiming(1, { duration: duration.pop * 0.4, easing: easeApple }),
    );
  }, [replayKey, reduce, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View {...rest} style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

/** `animate-rise` — fade in and travel 12px up, over 500ms. */
export function Rise({ children, style, ...rest }: ViewProps) {
  const reduce = useReduceMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = reduce
      ? 1
      : withTiming(1, { duration: duration.rise, easing: easeApple });
  }, [reduce, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));

  return (
    <Animated.View {...rest} style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

/**
 * `animate-pulse-soft` — opacity 1 → 0.45 → 1, 1.8s, forever.
 *
 * Marks the step an order is currently on in the tracker, and every "Pricing
 * your basket…" line. Deliberately gentler than Tailwind's own `animate-pulse`,
 * which bottoms out at 0.5 on a much shorter cycle and reads as agitated.
 */
export function PulseSoft({ children, style, ...rest }: ViewProps) {
  const reduce = useReduceMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduce) {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: duration.pulse / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: duration.pulse / 2, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [reduce, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View {...rest} style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

/**
 * `<Skeleton/>` — the storefront's is `bg-primary/10` plus Tailwind's own
 * `animate-pulse`. Navy at 10% on white, which is the grey every loading state
 * in the app is built from.
 */
export function Skeleton({ className, style, ...rest }: ViewProps & { className?: string }) {
  const reduce = useReduceMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduce) {
      opacity.value = 1;
      return;
    }
    // Tailwind's `animate-pulse`: 2s, opacity 1 → .5 → 1, ease-in-out.
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [reduce, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      {...rest}
      className={`bg-primary/10 ${className ?? ''}`}
      style={[style, animated]}
    />
  );
}
