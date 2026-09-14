/**
 * The product tile and its add control, used on every catalogue surface.
 *
 * Ported from `edawr-frontend/src/components/ProductCard.tsx`.
 *
 * Prices here are **display only**. They are the numbers the server sent with
 * the catalogue, rendered as-is; nothing in this file multiplies a price by a
 * quantity or adds two of them together. The bill comes from
 * `/api/store/quote`, and the two would drift the first time a fee changed.
 */
import { Link } from 'expo-router';
import { Minus, Plus, Zap } from 'lucide-react-native';
import { useSyncExternalStore } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { ImageFallback } from '@/components/ImageFallback';
import { Pop } from '@/components/ui/motion';
import { toast } from '@/components/ui/toast';
import { assetUrl } from '@/lib/api';
import { addOne, getServerSnapshot, getSnapshot, setQuantity, subscribe } from '@/lib/cart-store';
import { formatMoney } from '@/lib/format';
import { colors } from '@/theme';
import type { StoreProduct } from '@/types';

function useCartQuantity(productId: number): number {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return snapshot.lines.find((line) => line.product.id === productId)?.quantity ?? 0;
}

export function AddControl({
  product,
  size = 'sm',
}: {
  product: StoreProduct;
  size?: 'sm' | 'lg';
}) {
  const quantity = useCartQuantity(product.id);
  const big = size === 'lg';

  /**
   * The announcement, and why it is a sibling rather than the numeral itself.
   *
   * On the web the live region used to *be* the element showing the number,
   * which only exists once the quantity is non-zero — and a region inserted at
   * the same moment its content first changes is not announced by most screen
   * readers. So the first Add, the interaction that matters most, said nothing.
   *
   * The same trap exists here, so the same fix does: an always-mounted region
   * beside all three branches, sized to nothing so the visual layout is
   * unchanged.
   */
  const liveRegion = (
    <View
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={quantity === 0 ? '' : product.name + ', ' + quantity + ' in basket'}
      className="absolute h-0 w-0 overflow-hidden opacity-0"
      pointerEvents="none"
    />
  );

  // Out of stock disables rather than fails on submit. Letting someone fill a
  // basket the server will reject at checkout wastes the one interaction that
  // actually matters.
  if (!product.in_stock) {
    return (
      <View>
        {liveRegion}
        <View
          className={
            'bg-secondary items-center justify-center rounded-full ' +
            (big ? 'h-13 px-8' : 'h-9 px-4')
          }
        >
          <Text
            className={'text-muted-foreground font-medium ' + (big ? 'text-base' : 'text-2xs')}
          >
            Out of stock
          </Text>
        </View>
      </View>
    );
  }

  if (quantity === 0) {
    return (
      <View>
        {liveRegion}
        <Pop replayKey="idle">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Add ' + product.name + ' to cart'}
            onPress={() => {
              addOne(product);
              toast.success(product.name + ' added');
            }}
            // `active:scale-95` on the web. NativeWind maps the `active:`
            // variant onto the pressed state, so the class does the same job.
            className={
              'bg-primary items-center justify-center rounded-full active:scale-95 ' +
              (big ? 'h-13 px-8' : 'h-9 px-5')
            }
          >
            <Text
              className={
                'text-primary-foreground font-semibold ' + (big ? 'text-base' : 'text-sm')
              }
            >
              Add
            </Text>
          </Pressable>
        </Pop>
      </View>
    );
  }

  return (
    <View>
      {liveRegion}
      <Pop
        replayKey="stepper"
        className={
          'bg-primary flex-row items-center justify-between rounded-full ' +
          (big ? 'h-13 w-40 px-2' : 'h-9 w-24 px-1.5')
        }
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Decrease quantity of ' + product.name}
          hitSlop={6}
          onPress={() => setQuantity(product, quantity - 1)}
          className="h-8 w-8 items-center justify-center rounded-full active:scale-90"
        >
          <Minus size={16} color={colors.primaryForeground} />
        </Pressable>

        {/* Replays `pop` on every change, which is what the web gets from
            remounting this node with `key={quantity}`. */}
        <Pop replayKey={quantity}>
          <Text
            // Announced by the live region above instead — otherwise a screen
            // reader reads the bare numeral with no idea what it counts.
            accessibilityElementsHidden
            importantForAccessibility="no"
            className="text-primary-foreground num text-sm font-semibold"
          >
            {quantity}
          </Text>
        </Pop>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Increase quantity of ' + product.name}
          hitSlop={6}
          onPress={() => addOne(product)}
          className="h-8 w-8 items-center justify-center rounded-full active:scale-90"
        >
          <Plus size={16} color={colors.primaryForeground} />
        </Pressable>
      </Pop>
    </View>
  );
}

/**
 * The delivery promise, as a chip.
 *
 * One number, from `/api/store/config`, passed down rather than looked up here
 * — a component that fetched its own promise would fire a request per tile.
 */
export function EtaChip({ minutes, subtle }: { minutes: number | null; subtle?: boolean }) {
  if (minutes === null) return null;

  return (
    <View
      className={
        'flex-row items-center gap-1 self-start rounded-full px-2.5 py-1 ' +
        (subtle ? 'bg-secondary' : 'bg-amber-soft')
      }
    >
      <Zap size={12} color={colors.amber} fill={colors.amber} />
      <Text
        className={
          'text-2xs font-medium ' + (subtle ? 'text-muted-foreground' : 'text-amber-foreground')
        }
      >
        {minutes} min
      </Text>
    </View>
  );
}

export function ProductCard({
  product,
  promiseMinutes = null,
}: {
  product: StoreProduct;
  promiseMinutes?: number | null;
}) {
  const image = assetUrl(product.image_url);

  return (
    <Link href={{ pathname: '/product/[id]', params: { id: product.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        className={
          'border-border/70 bg-card flex-1 rounded-3xl border p-3 ' +
          (product.in_stock ? '' : 'opacity-70')
        }
      >
        <View className="bg-surface overflow-hidden rounded-2xl">
          {image ? (
            <Image
              source={{ uri: image }}
              accessibilityLabel={product.name}
              className="aspect-square w-full"
              resizeMode="cover"
            />
          ) : (
            <ImageFallback className="aspect-square w-full" />
          )}

          {product.discount_percent > 0 ? (
            <View className="bg-amber absolute left-2 top-2 rounded-full px-2 py-0.5">
              <Text className="text-amber-foreground num text-2xs font-semibold">
                {product.discount_percent}% off
              </Text>
            </View>
          ) : null}

          {product.in_stock && product.low_stock ? (
            <View className="bg-background/90 absolute right-2 top-2 rounded-full px-2 py-0.5">
              <Text className="text-2xs text-foreground font-medium">Low stock</Text>
            </View>
          ) : null}
        </View>

        <View className="flex-1 gap-1.5 px-1 pt-3">
          <EtaChip minutes={promiseMinutes} subtle />
          <Text numberOfLines={2} className="text-foreground text-[15px] font-semibold leading-snug">
            {product.name}
          </Text>
          {product.unit ? (
            <Text className="text-muted-foreground text-xs">{product.unit}</Text>
          ) : null}

          <View className="mt-auto flex-row items-end justify-between gap-2 pt-3">
            <View>
              <Text className="text-foreground num text-base font-semibold">
                {formatMoney(product.price)}
              </Text>
              {product.mrp > product.price ? (
                <Text className="text-muted-foreground num text-xs line-through">
                  {formatMoney(product.mrp)}
                </Text>
              ) : null}
            </View>
            <AddControl product={product} />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}
