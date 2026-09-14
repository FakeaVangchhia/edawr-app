/**
 * Checkout.
 *
 * Ported from `edawr-frontend/src/app/checkout/CheckoutPage.tsx`.
 *
 * **It sends no money.** The request body carries product ids, quantities, the
 * customer's details and a delivery tier — no price, no fee, no total. The
 * server prices the order from its own catalogue. Anything else would be a
 * checkout where the customer names their own price.
 *
 * **It offers no payment method it cannot honour.** `Order.PAYMENT_CHOICES` is
 * cash on delivery and nothing else, so that is the only option shown — as a
 * statement, not a control. The prototype's UPI and card tiles were buttons
 * wired to nothing.
 */
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Banknote, Check, Crosshair, Loader2, MapPin, Plus } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BillLines, DeliveryTierPicker, MinimumOrderNotice } from '@/components/BasketSummary';
import { ImageFallback } from '@/components/ImageFallback';
import { PulseSoft, Skeleton } from '@/components/ui/motion';
import { toast } from '@/components/ui/toast';
import { useDraft } from '@/hooks/useDraft';
import { useQuote } from '@/hooks/useQuote';
import { useAddressBook, useCart, useProfile, useSession, useStoreConfig } from '@/hooks/useStoreData';
import { addAddress, selectAddress, selectedAddress, toDeliveryAddress } from '@/lib/addresses';
import { ApiError, assetUrl } from '@/lib/api';
import { clearCart } from '@/lib/cart-store';
import { clearCheckoutAttempt } from '@/lib/checkout-attempt';
import { signUp } from '@/lib/customer-api';
import { DEFAULT_DELIVERY_TYPE } from '@/lib/delivery';
import { formatMoney } from '@/lib/format';
import {
  distanceFromStore,
  GEOLOCATION_MESSAGES,
  isDeliverable,
  requestPosition,
  type Coordinates,
} from '@/lib/geolocation';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';
import { saveProfile } from '@/lib/profile';
import { recentOrdersArePersisted, rememberOrder } from '@/lib/recent-orders';
import { saveSession } from '@/lib/session';
import { registerForPushNotifications } from '@/push';
import { placeOrder } from '@/lib/store-api';
import { isValidAddress, isValidIndianMobile, isValidName } from '@/lib/validation';
import { GUTTER, colors } from '@/theme';
import type { DeliveryType, UnavailableItem } from '@/types';

interface FieldErrors {
  name?: string;
  phone?: string;
  address?: string;
  signupPassword?: string;
}

/**
 * `+919812345678` as `9812345678`, for a field a customer types by hand.
 *
 * The account stores the normalised form; the server normalises whatever comes
 * back, so showing the local ten digits costs nothing and reads like a phone
 * number rather than like a database row.
 */
function localPhone(stored: string | undefined): string {
  if (!stored) return '';
  const digits = stored.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tier?: string }>();
  const { lines, hydrated } = useCart();
  const config = useStoreConfig();
  const book = useAddressBook();
  const profile = useProfile();
  const session = useSession();

  // The tier is carried from the cart so the customer is not silently moved to
  // a different speed — and re-validated, because a route param is user input.
  const requested = params.tier;
  const initialTier: DeliveryType =
    requested === 'instant' || requested === 'slow' ? requested : DEFAULT_DELIVERY_TYPE;

  // Every field seeded from a stored source is *derived* from it rather than
  // captured once: `useState(profile.name)` grabs whatever was there on the
  // first render and never lets go, which is why the remembered name and
  // number would never appear. See `hooks/useDraft.ts`.
  const saved = selectedAddress(book);
  const savedAddress = saved ? toDeliveryAddress(saved) : '';
  const savedLandmark = saved?.landmark ?? '';

  const [deliveryType, setDeliveryType] = useState<DeliveryType>(initialTier);
  // The account first, the device-local profile second.
  const [name, setName] = useDraft(session?.name || profile.name);
  const [phone, setPhone] = useDraft(localPhone(session?.phone) || profile.phone);

  // The optional account offer, shown only to a guest. Unchecked by default: an
  // untouched box is a guest order with zero extra keystrokes, which is the
  // whole point of leaving checkout open to people without accounts.
  const [wantsAccount, setWantsAccount] = useState(false);
  const [signupPassword, setSignupPassword] = useState('');
  const [address, setAddress, resetAddress] = useDraft(savedAddress);
  const [landmark, setLandmark, resetLandmark] = useDraft(savedLandmark);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isPlacing, setIsPlacing] = useState(false);
  const [failure, setFailure] = useState('');
  const [unavailable, setUnavailable] = useState<UnavailableItem[]>([]);

  // The customer's position, if they chose to share it. `null` is a supported
  // final state, not a pending one — see lib/geolocation.ts.
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNote, setLocationNote] = useState('');

  /**
   * Guards the state writes after `await placeOrder`.
   *
   * The 409 path calls `setUnavailable` and `setFailure` after a round trip the
   * customer may have navigated away from, and React drops those writes on an
   * unmounted tree — taking the backend's actual sentence ("Some items are no
   * longer available: Amul Taaza Milk.") with them.
   *
   * It starts true rather than being set in the effect: React 19 in StrictMode
   * mounts, unmounts and remounts, and an effect that only ever sets `true` on
   * mount would leave this false through the second render.
   */
  const mounted = useRef(true);

  /**
   * The three required inputs, so a failed validation can put the keyboard in
   * the first one that needs fixing.
   *
   * The storefront does this by id and `document.getElementById`; there is no
   * document here, so the refs are held directly. Same reason on both: the
   * submit button is pinned to the bottom of the viewport and the field it is
   * complaining about is usually a screenful above it, so marking a box red and
   * leaving the customer where they are reads as nothing happening at all.
   *
   * Focusing a `TextInput` inside a `ScrollView` scrolls it into view and
   * raises the keyboard, which is the platform's version of the web's
   * scroll-then-focus.
   */
  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { quote, isLoading, error } = useQuote(lines, deliveryType);

  const outsideArea = isDeliverable(coords, config) === false;
  const distanceKm = distanceFromStore(coords, config);
  // `is_open` is false while the shop is shut or a manager has paused orders.
  // Checked here as well as on the cart because a customer can sit on this
  // screen through a closing time, and because the server will refuse anyway —
  // this is what stops them finding that out after filling in the whole form.
  const storeClosed = config ? !config.is_open : false;

  const addressOverridden = address !== savedAddress;

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!isValidName(name)) {
      next.name = 'Enter the name the rider should ask for.';
    }
    if (!isValidIndianMobile(phone)) {
      next.phone = 'Enter a 10-digit mobile number, like 98123 45678.';
    }
    if (!isValidAddress(address)) {
      next.address = 'Enter a full address a rider could actually find.';
    }
    // Only when the box is ticked. An untouched offer must never be able to
    // block an order — that is the difference between an option and a wall.
    if (wantsAccount && !session) {
      const problem = passwordProblem(signupPassword, phone);
      if (problem) next.signupPassword = problem;
    }
    setErrors(next);

    // Report the topmost problem by taking the customer to it, in the order the
    // fields appear. Everything else stays marked, so fixing this one and
    // submitting again lands on the next.
    const first = ([
      [next.name, nameRef],
      [next.phone, phoneRef],
      [next.address, addressRef],
      [next.signupPassword, passwordRef],
    ] as const).find(([message]) => message);
    if (first) first[1].current?.focus();

    return Object.keys(next).length === 0;
  };

  const locate = async () => {
    if (isLocating) return;
    setIsLocating(true);
    setLocationNote('');

    const { coords: found, failure: why } = await requestPosition();
    if (!mounted.current) return;

    if (found) {
      setCoords(found);
      setLocationNote('');
    } else if (why) {
      // Never an error state. The address field is the real input and this is a
      // hint layered on it, so the copy says so rather than demanding a retry.
      setLocationNote(GEOLOCATION_MESSAGES[why]);
    }
    setIsLocating(false);
  };

  const submit = async () => {
    if (isPlacing) return;
    setFailure('');
    setUnavailable([]);
    if (!validate()) return;

    setIsPlacing(true);
    try {
      const order = await placeOrder(
        lines,
        {
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          customer_address: address.trim(),
          customer_landmark: landmark.trim(),
          delivery_notes: notes.trim(),
          // Sent as a pair or not at all: the server rejects half a position,
          // because latitude without longitude is a client bug rather than a
          // partial answer.
          ...(coords
            ? { customer_latitude: coords.latitude, customer_longitude: coords.longitude }
            : {}),
        },
        deliveryType,
      );

      // Remember the token before anything else: it is handed over exactly once
      // and there is no account to find the order behind if it is lost.
      rememberOrder({
        token: order.tracking_token,
        orderId: order.id,
        placedAt: order.created_at,
        total: order.grand_total,
        itemCount: order.items.length,
      });
      saveProfile({ name: name.trim(), phone: phone.trim() });

      // **The account is created after the order, and cannot fail it.** By this
      // point the order is committed, the token is remembered and the customer
      // has bought their groceries. A sign-up that threw here — a number
      // already taken, a password the server refuses, a dropped connection —
      // must produce a message and nothing else.
      //
      // `claimToken` is what stops the new account opening on an empty list:
      // the order predates it, and the phone number alone is not evidence of
      // anything until it is verified. Possession of the tracking token is.
      if (wantsAccount && !session) {
        try {
          saveSession(
            await signUp({
              phone: phone.trim(),
              password: signupPassword,
              name: name.trim(),
              claimToken: order.tracking_token,
            }),
          );
          // Registered here for the same reason signin.tsx and signup.tsx do
          // it: this is the first moment there is an account to attach the
          // handset to. Without it a customer who ticks the box at checkout is
          // signed in on an unregistered device until the next cold launch — so
          // the order they just placed, the one most worth being told about,
          // produces no notifications at all.
          void registerForPushNotifications();
          toast.success('Account created');
        } catch (signupError) {
          toast.error('Your order is placed', {
            description:
              signupError instanceof ApiError && signupError.isConflict
                ? 'That number already has an account — sign in to see this order in it.'
                : 'We could not create your account. Try again from the Account screen.',
          });
        }
      }

      // The idempotency key has been redeemed. Leaving it in storage means the
      // next checkout's first act is reading a spent one, and a used key
      // lingering on the device is exactly what confuses whoever is later
      // debugging a duplicate order.
      clearCheckoutAttempt();

      // A failed write makes the order *look* remembered until the next launch
      // loses it. The tracking screen is the customer's only other copy of the
      // token, so this is the one moment they can be told to keep it.
      toast.success('Order placed', {
        description: recentOrdersArePersisted()
          ? 'Arriving in about ' + order.promised_minutes + ' minutes'
          : 'Keep this order open — this device cannot remember it.',
      });

      // Navigate first, empty the basket second. The other order re-renders
      // this screen through the `lines.length === 0` branch below, so the
      // customer sees "Nothing to check out" flash over a successful order
      // while the router is still working.
      router.replace({ pathname: '/order/[token]', params: { token: order.tracking_token } });
      clearCart();
    } catch (caught: unknown) {
      if (!mounted.current) return;

      // A 409 means the catalogue moved under a basket that was valid when it
      // was built. Naming the exact rows is the difference between a customer
      // fixing it in one tap and a customer giving up.
      if (caught instanceof ApiError && caught.isConflict) {
        const rows = caught.payload.unavailable;
        if (Array.isArray(rows)) setUnavailable(rows as UnavailableItem[]);
        setFailure(caught.message);
      } else {
        setFailure(
          caught instanceof Error ? caught.message : 'We could not place your order just now.',
        );
      }
      setIsPlacing(false);
    }
  };

  if (!hydrated) return <CheckoutSkeleton />;

  if (lines.length === 0) {
    return (
      <View
        className="bg-background flex-1 items-center justify-center py-20"
        style={{ paddingHorizontal: GUTTER }}
      >
        <Text className="text-foreground text-2xl font-semibold">Nothing to check out</Text>
        <Text className="text-muted-foreground mt-2 text-center text-sm">
          Your basket is empty, so there is no order to place yet.
        </Text>
        <Link href="/products" asChild>
          <Pressable
            accessibilityRole="link"
            className="bg-primary mt-8 h-12 items-center justify-center rounded-full px-7"
          >
            <Text className="text-primary-foreground text-sm font-semibold">Start shopping</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  const blocked =
    unavailable.length > 0 || quote?.meets_minimum === false || storeClosed || outsideArea;
  const ctaDisabled = isPlacing || isLoading || blocked;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="bg-background flex-1"
    >
      <ScrollView
        contentContainerClassName="py-8"
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-foreground text-3xl font-semibold">Checkout</Text>
        <Text className="text-muted-foreground mt-2 text-base">
          One screen. Your order leaves the store the moment you confirm.
        </Text>

        <View className="mt-8 gap-6">
          {/* --- Where to deliver ------------------------------------- */}
          <View className="border-border/70 rounded-4xl border p-6">
            <View className="flex-row items-center justify-between gap-4">
              <Text className="text-foreground text-lg font-semibold">Where to deliver</Text>
              <Link href="/addresses" asChild>
                <Pressable accessibilityRole="link" className="flex-row items-center gap-1" hitSlop={8}>
                  <Plus size={14} color={colors.foreground} />
                  <Text className="text-foreground text-sm font-medium">Manage</Text>
                </Pressable>
              </Link>
            </View>

            {book.entries.length > 0 ? (
              <View className="mt-4 gap-3">
                {book.entries.map((entry) => {
                  const active = entry.id === saved?.id && !addressOverridden;
                  return (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        selectAddress(entry.id);
                        resetAddress();
                        resetLandmark();
                        setErrors((current) => ({ ...current, address: undefined }));
                      }}
                      className={
                        'rounded-3xl border p-4 ' +
                        (active ? 'border-primary bg-secondary' : 'border-border/70')
                      }
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="text-foreground text-sm font-semibold">{entry.label}</Text>
                        {active ? (
                          <View className="bg-primary h-5 w-5 shrink-0 items-center justify-center rounded-full">
                            <Check size={12} color={colors.primaryForeground} />
                          </View>
                        ) : null}
                      </View>
                      <Text className="text-muted-foreground mt-1 text-xs leading-relaxed">
                        {toDeliveryAddress(entry)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View className="mt-4 gap-4">
              <Field
                label="Your name"
                value={name}
                onChange={(value) => {
                  setName(value);
                  setErrors((current) => ({ ...current, name: undefined }));
                }}
                placeholder="Who should the rider ask for?"
                error={errors.name}
                autoComplete="name"
                inputRef={nameRef}
                onNext={() => phoneRef.current?.focus()}
              />
              <Field
                label="Mobile number"
                value={phone}
                onChange={(value) => {
                  setPhone(value);
                  setErrors((current) => ({ ...current, phone: undefined }));
                }}
                placeholder="98123 45678"
                keyboardType="phone-pad"
                autoComplete="tel"
                error={errors.phone}
                inputRef={phoneRef}
                onNext={() => addressRef.current?.focus()}
              />
              <Field
                label="Delivery address"
                value={address}
                onChange={(value) => {
                  setAddress(value);
                  setErrors((current) => ({ ...current, address: undefined }));
                }}
                placeholder="House, street, locality"
                error={errors.address}
                multiline
                inputRef={addressRef}
              />
            </View>

            <View className="bg-surface mt-4 rounded-3xl p-4">
              <View className="flex-row flex-wrap items-center gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void locate()}
                  disabled={isLocating || isPlacing}
                  className={
                    'border-border h-10 flex-row items-center gap-2 rounded-full border px-4 ' +
                    (isLocating || isPlacing ? 'opacity-60' : '')
                  }
                >
                  {isLocating ? (
                    <Loader2 size={16} color={colors.foreground} />
                  ) : (
                    <Crosshair size={16} color={colors.foreground} />
                  )}
                  <Text className="text-foreground text-sm font-semibold">
                    {coords ? 'Update my location' : 'Share my location'}
                  </Text>
                </Pressable>
                <Text className="text-muted-foreground flex-1 text-xs">
                  Optional. It helps the rider find you and lets us check we deliver to your area.
                </Text>
              </View>

              {/* Always mounted, text swapped. A conditionally rendered live
                  region is inserted at the same moment its content first
                  changes, and most screen readers announce nothing at all. */}
              <Text
                accessibilityLiveRegion="polite"
                className={
                  'mt-2 min-h-4 text-xs ' +
                  (outsideArea ? 'text-destructive font-medium' : 'text-muted-foreground')
                }
              >
                {outsideArea
                  ? 'That is about ' +
                    distanceKm +
                    ' km from the store, outside the ' +
                    config?.delivery_radius_km +
                    ' km delivery area.'
                  : coords
                    ? 'Location shared' +
                      (distanceKm !== null ? ' · ' + distanceKm + ' km from the store' : '') +
                      '.'
                    : locationNote}
              </Text>
            </View>

            <View className="mt-4 gap-4">
              <Field
                label="Landmark (optional)"
                value={landmark}
                onChange={setLandmark}
                placeholder="Near the church, opposite the bank"
              />
              <Field
                label="Note for the rider (optional)"
                value={notes}
                onChange={setNotes}
                placeholder="Gate code, or where to leave it"
              />
            </View>

            {!session ? (
              <View className="bg-surface mt-6 rounded-3xl p-5">
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: wantsAccount }}
                  onPress={() => setWantsAccount((current) => !current)}
                  className="flex-row items-start gap-3"
                >
                  <View
                    className={
                      'mt-0.5 h-4 w-4 shrink-0 items-center justify-center rounded border ' +
                      (wantsAccount ? 'border-primary bg-primary' : 'border-border')
                    }
                  >
                    {wantsAccount ? <Check size={11} color={colors.primaryForeground} /> : null}
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground text-sm font-medium">
                      Save my details for next time
                    </Text>
                    <Text className="text-muted-foreground mt-0.5 text-sm">
                      Create an account with this number, and your orders follow you to any device.
                    </Text>
                  </View>
                </Pressable>

                {wantsAccount ? (
                  <View className="mt-4">
                    <Field
                      label="Choose a password"
                      value={signupPassword}
                      onChange={setSignupPassword}
                      secure
                      error={errors.signupPassword}
                      inputRef={passwordRef}
                    />
                    <Text className="text-muted-foreground mt-2 text-xs">{PASSWORD_HINT}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {book.entries.length === 0 && isValidAddress(address) ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  addAddress({
                    label: 'Home',
                    line: address.trim(),
                    city: config?.store_city ?? '',
                    landmark: landmark.trim(),
                  });
                  toast.success('Address saved on this device');
                }}
                className="mt-4 flex-row items-center gap-1.5 self-start"
              >
                <MapPin size={14} color={colors.foreground} />
                <Text className="text-foreground text-sm font-medium">
                  Save this address for next time
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* --- Delivery speed --------------------------------------- */}
          <View className="border-border/70 rounded-4xl border p-6">
            <Text className="text-foreground text-lg font-semibold">Delivery speed</Text>
            <View className="mt-4">
              <DeliveryTierPicker
                config={config}
                quote={quote}
                selected={deliveryType}
                onSelect={setDeliveryType}
                disabled={isPlacing}
              />
            </View>
          </View>

          {/* --- Payment: a statement, not a control ------------------- */}
          <View className="border-border/70 rounded-4xl border p-6">
            <Text className="text-foreground text-lg font-semibold">Payment</Text>
            <View className="bg-surface mt-4 flex-row items-center gap-3 rounded-3xl p-4">
              <View className="bg-amber-soft h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
                <Banknote size={20} color={colors.amber} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold">Cash on delivery</Text>
                <Text className="text-muted-foreground text-xs">
                  Pay the rider at your door. It is the only method this store takes today.
                </Text>
              </View>
            </View>
          </View>

          {/* --- Your order and the bill ------------------------------- */}
          <View className="border-border/70 gap-6 rounded-4xl border p-6">
            <View>
              <Text className="text-foreground text-lg font-semibold">Your order</Text>
              <View className="mt-4 gap-3">
                {lines.map((line) => {
                  const image = assetUrl(line.product.image_url);
                  const problem = unavailable.find((item) => item.product_id === line.product.id);
                  return (
                    <View
                      key={line.product.id}
                      className={
                        'flex-row items-center gap-3 rounded-2xl ' +
                        (problem ? 'bg-destructive-soft p-2' : '')
                      }
                    >
                      {image ? (
                        <Image
                          source={{ uri: image }}
                          className="bg-surface h-11 w-11 shrink-0 rounded-xl"
                          resizeMode="cover"
                        />
                      ) : (
                        <ImageFallback className="h-11 w-11 shrink-0 rounded-xl" />
                      )}
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-foreground text-sm font-medium">
                          {line.product.name}
                        </Text>
                        <Text className="text-muted-foreground num text-xs">
                          Qty {line.quantity} · {formatMoney(line.product.price)}
                        </Text>
                        {problem ? (
                          <Text className="text-destructive text-xs font-medium">
                            {problem.reason}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            <View className="border-border border-t pt-6">
              <BillLines quote={quote} />
              {isLoading ? (
                <PulseSoft className="mt-3">
                  <Text className="text-muted-foreground text-xs">Pricing your basket…</Text>
                </PulseSoft>
              ) : null}
              {error ? <Text className="text-destructive mt-3 text-xs">{error}</Text> : null}
            </View>

            <MinimumOrderNotice quote={quote} config={config} />

            {storeClosed ? (
              <View accessibilityLiveRegion="polite" className="bg-amber-soft rounded-2xl px-4 py-3">
                <Text className="text-amber-foreground text-sm font-semibold">
                  The store is closed
                </Text>
                {/* The server's own sentence, so what is shown here and what
                    checkout would refuse with cannot drift apart. */}
                <Text className="text-amber-foreground mt-1 text-sm">{config?.closed_reason}</Text>
                <Text className="text-amber-foreground mt-1 text-xs">
                  Your basket is saved. Come back when we open and it will still be here.
                </Text>
              </View>
            ) : null}

            {failure ? (
              <View className="bg-destructive-soft rounded-2xl px-4 py-3">
                <Text className="text-destructive text-sm">{failure}</Text>
                {unavailable.length > 0 ? (
                  <Link href="/cart" asChild>
                    <Pressable accessibilityRole="link" className="mt-2 self-start">
                      <Text className="text-destructive text-sm font-semibold underline">
                        Fix your basket
                      </Text>
                    </Pressable>
                  </Link>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* `bottom-0`, not the tab bar's height: the nav is a flex sibling below
          this screen rather than a fixed overlay, so this edge already sits on
          top of it. See the longer note on the cart. */}
      <View className="border-border/70 bg-background absolute inset-x-0 bottom-0 border-t px-5 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: ctaDisabled }}
          onPress={() => void submit()}
          disabled={ctaDisabled}
          className={
            'bg-primary h-13 w-full flex-row items-center justify-center gap-2 rounded-full active:scale-[0.99] ' +
            (ctaDisabled ? 'opacity-60' : '')
          }
        >
          {isPlacing ? <Loader2 size={16} color={colors.primaryForeground} /> : null}
          <Text className="text-primary-foreground text-base font-semibold">
            {isPlacing ? 'Placing order…' : storeClosed ? 'Store closed' : 'Place order'}
          </Text>
          {!isPlacing && !storeClosed && quote ? (
            <Text className="text-primary-foreground num text-base font-semibold">
              · {formatMoney(quote.grand_total)}
            </Text>
          ) : null}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * One labelled input.
 *
 * `inputRef` lets `validate` focus the first field that needs fixing, and
 * `onNext` gives the keyboard's return key somewhere to go — without it every
 * field showed a "return" key that did nothing, so filling in the form meant
 * dismissing the keyboard and tapping the next box for each of them.
 *
 * `error` is announced rather than only coloured. `accessibilityLabel` carries
 * the message alongside the label because a red border says nothing to a screen
 * reader, and `assertive` interrupts — the customer has just pressed the button
 * that was supposed to place their order, so it is worth interrupting for.
 */
function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  autoComplete,
  keyboardType,
  secure,
  multiline,
  inputRef,
  onNext,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  autoComplete?: 'name' | 'tel';
  keyboardType?: 'phone-pad';
  secure?: boolean;
  multiline?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  onNext?: () => void;
}) {
  return (
    <View>
      <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
        {label}
      </Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        secureTextEntry={secure}
        multiline={multiline}
        autoCapitalize={autoComplete === 'name' || multiline ? 'words' : 'none'}
        autoCorrect={false}
        // A multiline box needs its return key to insert a newline, so it never
        // advances; everything else moves on to the field below.
        returnKeyType={multiline ? undefined : onNext ? 'next' : 'done'}
        onSubmitEditing={multiline ? undefined : onNext}
        submitBehavior={onNext && !multiline ? 'submit' : undefined}
        accessibilityLabel={error ? label + '. ' + error : label}
        className={
          'bg-surface mt-2 w-full rounded-2xl border px-4 text-sm ' +
          (multiline ? 'min-h-12 py-3' : 'h-12') +
          ' ' +
          (error ? 'border-destructive' : 'border-border')
        }
        style={{ color: colors.foreground }}
      />
      {error ? (
        <Text accessibilityLiveRegion="assertive" className="text-destructive mt-1.5 text-xs">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function CheckoutSkeleton() {
  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="py-8"
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
    >
      <Skeleton className="h-12 w-52 rounded-2xl" />
      <View className="mt-8 gap-6">
        <Skeleton className="h-80 rounded-4xl" />
        <Skeleton className="h-40 rounded-4xl" />
        <Skeleton className="h-32 rounded-4xl" />
        <Skeleton className="h-96 rounded-4xl" />
      </View>
    </ScrollView>
  );
}
