/**
 * The device-local address book.
 *
 * Ported from `edawr-frontend/src/app/addresses/AddressesPage.tsx`.
 *
 * **No API is involved.** There are no customer address endpoints on the
 * backend — an address is typed into the checkout body per order — so this is
 * purely a convenience that prefills that form. The copy says so, because a
 * customer who believes these are on their account will expect them on a new
 * phone.
 *
 * There is no edit UI, matching the web: `updateAddress` exists in
 * `lib/addresses.ts` and nothing calls it. Remove-and-re-add is two taps and
 * the entries are four short fields.
 */
import { Link } from 'expo-router';
import { Check, LocateFixed, MapPin, Plus, Settings, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { toast } from '@/components/ui/toast';
import { useLocateState } from '@/hooks/useCurrentLocation';
import { useAddressBook, useStoreConfig } from '@/hooks/useStoreData';
import {
  CURRENT_LOCATION_ID,
  addAddress,
  removeAddress,
  restoreAddress,
  selectAddress,
  selectedAddress,
  toDeliveryAddress,
} from '@/lib/addresses';
import {
  getLocateSnapshot,
  locateCurrentAddress,
  openLocationSettings,
  takePendingFix,
} from '@/lib/current-location';
import { isValidAddress } from '@/lib/validation';
import { GUTTER, colors } from '@/theme';

export default function AddressesScreen() {
  const book = useAddressBook();
  const config = useStoreConfig();
  const current = selectedAddress(book);

  const [isAdding, setIsAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [line, setLine] = useState('');
  const [city, setCity] = useState('');
  const [landmark, setLandmark] = useState('');

  const reset = () => {
    setLabel('');
    setLine('');
    setCity('');
    setLandmark('');
    setIsAdding(false);
  };

  const save = () => {
    if (!label.trim() || !isValidAddress(line)) return;
    addAddress({
      label: label.trim(),
      line: line.trim(),
      city: city.trim() || config?.store_city || '',
      landmark: landmark.trim(),
      // A fix whose street the geocoder could not read, if there is one: the
      // customer has just typed the street, so the two belong together.
      ...takePendingFix(),
    });
    toast.success('Address saved on this device');
    reset();
  };

  const canSave = Boolean(label.trim()) && isValidAddress(line);

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="py-10 pb-16"
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row flex-wrap items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-foreground text-3xl font-semibold">Addresses</Text>
          <Text className="text-muted-foreground mt-3 max-w-xl text-base">
            Saved on this phone so checkout can fill itself in. There is no account behind them —
            reinstalling the app clears these too.
          </Text>
        </View>

        {!isAdding ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsAdding(true)}
            className="bg-primary h-12 shrink-0 flex-row items-center gap-2 rounded-full px-6"
          >
            <Plus size={16} color={colors.primaryForeground} />
            <Text className="text-primary-foreground text-sm font-semibold">Add address</Text>
          </Pressable>
        ) : null}
      </View>

      <LocateCard onNeedsTyping={() => setIsAdding(true)} />

      {isAdding ? (
        <View className="border-border/70 mt-8 rounded-4xl border p-6">
          <View className="flex-row items-center justify-between">
            <Text className="text-foreground text-lg font-semibold">New address</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              hitSlop={8}
              onPress={reset}
              className="h-9 w-9 items-center justify-center rounded-full"
            >
              <X size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View className="mt-4 gap-4">
            <Field label="Save as" value={label} onChange={setLabel} placeholder="Home, Work, Mum's" />
            <Field
              label="City"
              value={city}
              onChange={setCity}
              placeholder={config?.store_city ?? 'Aizawl'}
            />
            <Field
              label="Address"
              value={line}
              onChange={setLine}
              placeholder="House, street, locality"
            />
            <Field
              label="Landmark (optional)"
              value={landmark}
              onChange={setLandmark}
              placeholder="Near the church, opposite the bank"
            />
          </View>

          <View className="mt-6 flex-row flex-wrap gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              onPress={save}
              disabled={!canSave}
              className={
                'bg-primary h-12 items-center justify-center rounded-full px-7 ' +
                (canSave ? '' : 'opacity-50')
              }
            >
              <Text className="text-primary-foreground text-sm font-semibold">Save address</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={reset}
              className="border-border h-12 items-center justify-center rounded-full border px-7"
            >
              <Text className="text-foreground text-sm font-medium">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {book.entries.length === 0 && !isAdding ? (
        <View className="border-border/70 mt-10 items-center rounded-4xl border py-20">
          <View className="bg-secondary h-16 w-16 items-center justify-center rounded-3xl">
            <MapPin size={28} color={colors.mutedForeground} />
          </View>
          <Text className="text-foreground mt-6 text-lg font-semibold">No saved addresses</Text>
          <Text className="text-muted-foreground mt-2 max-w-sm px-6 text-center text-sm">
            Add one and checkout will fill itself in. You can also just type an address at checkout.
          </Text>
        </View>
      ) : (
        <View className="mt-8 gap-4">
          {book.entries.map((entry) => {
            const active = entry.id === current?.id;
            return (
              <View
                key={entry.id}
                className={
                  'rounded-3xl border p-5 ' +
                  (active ? 'border-primary bg-secondary' : 'border-border/70')
                }
              >
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="text-foreground text-sm font-semibold">{entry.label}</Text>
                  {active ? (
                    <View className="bg-primary h-5 w-5 shrink-0 items-center justify-center rounded-full">
                      <Check size={12} color={colors.primaryForeground} />
                    </View>
                  ) : null}
                </View>

                <Text className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {toDeliveryAddress(entry)}
                </Text>
                {entry.landmark ? (
                  <Text className="text-muted-foreground mt-1 text-xs">Near {entry.landmark}</Text>
                ) : null}

                <View className="border-border mt-5 flex-row items-center gap-2 border-t pt-4">
                  {!active ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => selectAddress(entry.id)}
                      className="rounded-full px-3 py-1.5"
                    >
                      <Text className="text-foreground text-xs font-medium">Deliver here</Text>
                    </Pressable>
                  ) : null}
                  {/*
                    Destructive and one tap, on data the customer typed by hand
                    — house, street, locality, landmark. Re-entering that on a
                    phone is a minute of work, so the deletion is offered back
                    the same way the basket's "Clear all" is, rather than behind
                    a confirmation step that would tax every deliberate use.
                    The position and the selection are captured with the entry,
                    so undoing leaves the book exactly as it was. The storefront
                    carries the same undo.
                  */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={'Remove ' + entry.label}
                    onPress={() => {
                      const restored = entry;
                      const index = book.entries.findIndex((row) => row.id === entry.id);
                      const previousSelection = book.selectedId;
                      removeAddress(entry.id);
                      toast.success('Address removed', {
                        action: {
                          label: 'Undo',
                          onPress: () => restoreAddress(restored, index, previousSelection),
                        },
                      });
                    }}
                    className="ml-auto flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
                  >
                    <Trash2 size={14} color={colors.mutedForeground} />
                    <Text className="text-muted-foreground text-xs font-medium">Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Link href="/account" asChild>
        <Pressable accessibilityRole="link" className="mt-10 self-start">
          <Text className="text-muted-foreground text-sm font-medium">Back to your account</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

/**
 * "Use my current location", in whichever form still works.
 *
 * The OS shows its permission prompt only so many times. After that, asking
 * shows nothing, so a `blocked` customer gets a button to Settings instead;
 * the root layout locates them as soon as they come back with it switched on.
 * The typed form below is always there either way.
 */
function LocateCard({ onNeedsTyping }: { onNeedsTyping: () => void }) {
  const book = useAddressBook();
  const { status, pending } = useLocateState();
  const hasLocated = book.entries.some((entry) => entry.id === CURRENT_LOCATION_ID);

  const locate = async () => {
    const saved = await locateCurrentAddress({ ask: true });
    if (saved) {
      toast.success('Delivering to ' + saved.line, {
        description: 'Add your house or flat at checkout.',
      });
    } else if (getLocateSnapshot().pending) {
      onNeedsTyping();
    }
  };

  if (status === 'blocked') {
    return (
      <View className="bg-surface mt-8 rounded-3xl p-5">
        <Text className="text-foreground text-sm font-semibold">Location is off for eDawr</Text>
        <Text className="text-muted-foreground mt-1 text-sm">
          Turn it on in Settings and we will fill in your address when you come back. Or add one
          by hand.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={openLocationSettings}
          className="border-border mt-4 h-11 flex-row items-center gap-2 self-start rounded-full border px-5"
        >
          <Settings size={16} color={colors.foreground} />
          <Text className="text-foreground text-sm font-semibold">Open settings</Text>
        </Pressable>
      </View>
    );
  }

  const locating = status === 'locating';
  const note =
    status === 'denied'
      ? 'Location was not allowed. You can try again, or add an address by hand.'
      : status === 'failed'
        ? pending
          ? 'We found you, but could not read the street name. Type it below and we will save your position with it.'
          : 'We could not get a fix just now. Try again, or add an address by hand.'
        : '';

  return (
    <View className="bg-surface mt-8 rounded-3xl p-5">
      <Pressable
        accessibilityRole="button"
        onPress={() => void locate()}
        disabled={locating}
        className={
          'bg-amber h-11 flex-row items-center gap-2 self-start rounded-full px-5 ' +
          (locating ? 'opacity-60' : '')
        }
      >
        {locating ? (
          <ActivityIndicator size="small" color={colors.amberForeground} />
        ) : (
          <LocateFixed size={16} color={colors.amberForeground} />
        )}
        <Text className="text-amber-foreground text-sm font-semibold">
          {locating
            ? 'Finding you…'
            : hasLocated
              ? 'Update my current location'
              : 'Use my current location'}
        </Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" className="text-muted-foreground mt-2 text-xs">
        {note || 'Fills in the street you are on. You can add your house or flat at checkout.'}
      </Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View>
      <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={label}
        className="border-border bg-surface mt-2 h-12 w-full rounded-2xl border px-4 text-sm"
        style={{ color: colors.foreground }}
      />
    </View>
  );
}
