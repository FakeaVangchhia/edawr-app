/**
 * The banners at the top of the home screen.
 *
 * Content comes from `GET /api/store/promos`, which the console manages and
 * which already applies each banner's window — this component never decides
 * what is live, only how it scrolls. It does not auto-advance, and that is the
 * storefront's decision kept rather than a thing not yet built: a carousel that
 * moves on its own moves the tap target out from under a thumb, and on a screen
 * whose whole promise is speed a customer should not have to wait for the
 * banner they wanted to come round again.
 *
 * Ported from `edawr-frontend/src/components/PromoCarousel.tsx`. Four things
 * differ, all forced:
 *
 * **The rail is a `ScrollView` with snap offsets**, not CSS `snap-x`. The
 * active dot therefore comes from `onMomentumScrollEnd` arithmetic rather than
 * from an `IntersectionObserver`, which does not exist here. The card width is
 * measured from the window rather than assumed, so the arithmetic survives a
 * rotation.
 *
 * **The banners are fetched by the screen**, because there is no server render
 * to hand them down from. The web's docblock argues against a skeleton for this
 * rail and the argument holds harder here: a shop with no banners — every shop
 * on day one — would get a band that painted and then collapsed on every
 * launch. So it renders nothing until there is something, and the layout above
 * it never moves.
 *
 * **No arrows.** They exist on the web for desktop, where there is no thumb to
 * swipe with. Every viewport here has one.
 *
 * **The scrim is drawn, not declared.** React Native has no CSS gradient, so
 * the fade the copy sits on is an SVG one — the same approach `ImageFallback`
 * already takes, and the same reason.
 */
import { Link } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { assetUrl } from '@/lib/api';
import { promoDestination } from '@/lib/promo-link';
import { GUTTER, colors } from '@/theme';
import type { StorePromo } from '@/types';

/** The gap between cards, and the amount of the next one left peeking. */
const GAP = 16;

export function PromoCarousel({ promos }: { promos: StorePromo[] }) {
  const { width } = useWindowDimensions();
  const [active, setActive] = useState(0);

  if (promos.length === 0) return null;

  const cardWidth = width - GUTTER * 2;
  const stride = cardWidth + GAP;
  const many = promos.length > 1;

  return (
    <View accessibilityRole="summary" accessibilityLabel="Promotions">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // `snapToInterval` rather than `pagingEnabled`: a page is the window
        // width, and these cards are narrower than that by the gutter on each
        // side, so paging would drift by 40px per card.
        snapToInterval={stride}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: GAP }}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / stride);
          // Clamped because an over-scroll at either end can round past the
          // ends of the list, and a dot index out of range renders nothing.
          setActive(Math.max(0, Math.min(promos.length - 1, index)));
        }}
      >
        {promos.map((promo) => (
          <PromoCard key={promo.id} promo={promo} width={cardWidth} />
        ))}
      </ScrollView>

      {many ? (
        <View className="mt-3 flex-row justify-center gap-1.5">
          {promos.map((promo, index) => (
            <View
              key={promo.id}
              // Not a button, unlike the web's: there the dots double as a way
              // to jump, because a pointer has no swipe. A thumb does, and a
              // 6px tap target would be one nobody can hit anyway.
              accessibilityElementsHidden
              importantForAccessibility="no"
              className={
                index === active
                  ? 'bg-primary h-1.5 w-6 rounded-full'
                  : 'bg-border h-1.5 w-1.5 rounded-full'
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One banner. The whole card is the target; the copy sits on a navy fade so it
 * reads over any photograph — and, with no photograph, on navy itself.
 */
function PromoCard({ promo, width }: { promo: StorePromo; width: number }) {
  const image = assetUrl(promo.image_url);
  const destination = promoDestination(promo.link);
  const scrimId = `promo-scrim-${promo.id}`;

  const body = (
    <>
      {image ? (
        <Image source={{ uri: image }} className="h-full w-full" resizeMode="cover" />
      ) : null}

      {image ? (
        // The fade, bottom-heavy: transparent across the top two fifths so the
        // photograph is still a photograph, solid enough at the bottom that
        // white text on it clears contrast whatever was shot there.
        //
        // Positioned by a wrapping View with a plain style, not by a className
        // on the Svg: NativeWind maps className onto the components it knows,
        // and react-native-svg's are not among them — the class would be
        // silently dropped and the scrim would push the image out of the card.
        // `ImageFallback` puts its Svg in a View for the same reason.
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              {/* Unique per banner: several of these Svg roots are mounted at
                  once and a shared id is a collision waiting for the platform
                  that resolves them globally. */}
              <LinearGradient id={scrimId} x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor={colors.primary} stopOpacity="0.92" />
                <Stop offset="0.55" stopColor={colors.primary} stopOpacity="0.45" />
                <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${scrimId})`} />
          </Svg>
        </View>
      ) : null}

      <View className="absolute inset-0 justify-end p-5">
        <Text className="text-primary-foreground text-[22px] font-semibold leading-tight">
          {promo.title}
        </Text>
        {promo.subtitle ? (
          <Text className="text-primary-foreground/75 mt-1 text-sm">{promo.subtitle}</Text>
        ) : null}
        <View className="bg-amber mt-4 flex-row items-center gap-1.5 self-start rounded-full px-4 py-2">
          <Text className="text-amber-foreground text-[13px] font-semibold">{destination.cta}</Text>
          <ArrowRight size={14} color={colors.amberForeground} />
        </View>
      </View>
    </>
  );

  const card = 'bg-primary overflow-hidden rounded-4xl';
  const size = { width, aspectRatio: 16 / 7 };

  // A path is a screen of this app, so it is a router navigation. Anything else
  // leaves — `Linking.openURL` hands `tel:`, a WhatsApp link or a website to
  // whichever app the OS says owns it, which is the native equivalent of the
  // web's real anchor. See lib/promo-link.ts for the split.
  if (!destination.external) {
    return (
      <Link href={destination.href} asChild>
        <Pressable accessibilityRole="link" accessibilityLabel={promo.title} className={card} style={size}>
          {body}
        </Pressable>
      </Link>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={promo.title}
      className={card}
      style={size}
      // Rejects when no app can open the URL — a handset with no dialler, or a
      // scheme the API allowed and this device does not know. Swallowed rather
      // than surfaced: the banner failing to open is not something the customer
      // can act on, and an alert on top of it would be the second failure.
      onPress={() => void Linking.openURL(destination.href).catch(() => {})}
    >
      {body}
    </Pressable>
  );
}
