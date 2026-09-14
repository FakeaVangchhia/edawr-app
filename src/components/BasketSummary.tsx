/**
 * The bill, and the speed picker that changes it.
 *
 * Ported from `edawr-frontend/src/components/BasketSummary.tsx`.
 *
 * **Nothing in this file does arithmetic on money.** Every figure is read
 * straight off the `BasketQuote` the server produced, including the total. That
 * is the whole point of `/api/store/quote` existing: adding up line totals in
 * TypeScript would be a second pricing engine, and it would disagree with the
 * first one the day a fee changed.
 *
 * The one number that is compared rather than computed is
 * `free_delivery_shortfall`, and the server calculates that too.
 */
import { Zap } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { deliveryFeeLabel, feeForTier, tiersFrom } from '@/lib/delivery';
import { formatMoney, formatMoneyExact } from '@/lib/format';
import { colors } from '@/theme';
import type { BasketQuote, DeliveryType, StoreConfig } from '@/types';

/**
 * A row on the bill.
 *
 * `undefined` renders as "—", never as "Free" or "₹0". A figure that has not
 * come back from the server yet is *unknown*, and telling a customer their
 * delivery is free before the store has said so is a promise the bill then
 * breaks.
 */
function BillRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number | undefined;
  emphasis?: boolean;
}) {
  const display =
    value === undefined ? '—' : value === 0 && !emphasis ? 'Free' : formatMoneyExact(value);

  const free = value === 0 && !emphasis;

  return (
    <View
      className={
        'flex-row items-center justify-between gap-4 ' +
        (emphasis ? 'border-border border-t pt-3' : '')
      }
    >
      <Text
        className={
          emphasis ? 'text-foreground text-base font-semibold' : 'text-muted-foreground text-sm'
        }
      >
        {label}
      </Text>
      <Text
        className={
          'num ' +
          (emphasis
            ? 'text-foreground text-base font-semibold'
            : free
              ? 'text-amber-foreground text-sm'
              : 'text-foreground text-sm')
        }
      >
        {display}
      </Text>
    </View>
  );
}

export function DeliveryTierPicker({
  config,
  quote,
  selected,
  onSelect,
  disabled,
}: {
  config: StoreConfig | null;
  quote: BasketQuote | null;
  selected: DeliveryType;
  onSelect: (tier: DeliveryType) => void;
  disabled?: boolean;
}) {
  const tiers = tiersFrom(config);

  return (
    <View className="gap-3">
      {tiers.map((tier) => {
        const active = tier.key === selected;
        const fee = feeForTier(tier, selected, quote);

        return (
          <Pressable
            key={tier.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled: !!disabled }}
            accessibilityLabel={
              tier.label +
              ', about ' +
              tier.promise_minutes +
              ' minutes, ' +
              deliveryFeeLabel(fee, formatMoney)
            }
            onPress={() => onSelect(tier.key)}
            disabled={disabled}
            className={
              'rounded-3xl border p-4 ' +
              (active ? 'border-primary bg-secondary' : 'border-border/70') +
              (disabled ? ' opacity-60' : '')
            }
          >
            <View className="flex-row items-center gap-2">
              <View className="bg-amber-soft h-8 w-8 shrink-0 items-center justify-center rounded-xl">
                <Zap size={16} color={colors.amber} fill={colors.amber} />
              </View>
              <Text className="text-foreground text-sm font-semibold">{tier.label}</Text>
            </View>
            <Text className="text-muted-foreground num mt-2 text-xs">
              About {tier.promise_minutes} min · {deliveryFeeLabel(fee, formatMoney)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BillLines({ quote }: { quote: BasketQuote | null }) {
  return (
    <View className="gap-3">
      <BillRow label="Item total" value={quote?.items_total} />
      <BillRow label="Delivery" value={quote?.delivery_fee} />
      <BillRow label="Handling" value={quote?.handling_fee} />
      <BillRow label="To pay" value={quote?.grand_total} emphasis />
    </View>
  );
}

/**
 * "Add ₹120 more to get free delivery."
 *
 * The shortfall is the server's own figure, not `threshold - subtotal` worked
 * out here. It renders only when there is something to earn: once delivery is
 * already free, the nudge is noise.
 */
export function FreeDeliveryNudge({ quote }: { quote: BasketQuote | null }) {
  if (!quote || quote.free_delivery_shortfall <= 0 || quote.delivery_fee === 0) return null;

  return (
    <View className="bg-amber-soft rounded-2xl px-4 py-3">
      <Text className="text-amber-foreground text-sm">
        Add{' '}
        <Text className="num font-semibold">{formatMoney(quote.free_delivery_shortfall)}</Text> more
        to get free delivery.
      </Text>
    </View>
  );
}

/** The minimum-order gate, shown when the basket is below it. */
export function MinimumOrderNotice({
  quote,
  config,
}: {
  quote: BasketQuote | null;
  config: StoreConfig | null;
}) {
  if (!quote || quote.meets_minimum || quote.items_total <= 0) return null;

  return (
    <View className="bg-destructive-soft rounded-2xl px-4 py-3">
      <Text className="text-destructive text-sm">
        Orders start at{' '}
        <Text className="num font-semibold">
          {config ? formatMoney(config.min_order_value) : 'the store minimum'}
        </Text>
        . Add a little more to check out.
      </Text>
    </View>
  );
}
