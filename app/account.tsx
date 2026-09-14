/**
 * Your details — the account, and what this device remembers.
 *
 * Ported from `edawr-frontend/src/app/account/AccountPage.tsx`.
 *
 * Two independent things share this screen, and the split is deliberate. The
 * **account** is server-side and follows the customer to any device. The
 * **contact details and address book** are device-local and only exist to
 * prefill checkout. Someone who signs in on a new phone gets the first and not
 * the second, and the copy says so rather than letting them discover it.
 *
 * The unverified-number block is the honest surfacing of that: a password
 * proves you know a number, not that you hold the SIM, and nothing can prove
 * the second until there is an SMS provider.
 */
import { Link } from 'expo-router';
import { ChevronRight, Info, LogOut, MapPin, Package, Trash2, User } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { toast } from '@/components/ui/toast';
import { useDraft } from '@/hooks/useDraft';
import { useAddressBook, useProfile, useRecentOrders, useSession } from '@/hooks/useStoreData';
import { selectedAddress, toDeliveryAddress } from '@/lib/addresses';
import { changePassword, signOut, updateName } from '@/lib/customer-api';
import { formatMoneyExact } from '@/lib/format';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';
import { clearProfile, hasProfile, saveProfile } from '@/lib/profile';
import { clearSession, saveSession } from '@/lib/session';
import { unregisterForPushNotifications } from '@/push';
import { isValidIndianMobile, isValidName } from '@/lib/validation';
import { GUTTER, colors } from '@/theme';

/**
 * The account card: an invitation when signed out, the account when signed in.
 *
 * Kept in this file rather than extracted because it is the only thing that
 * reads the session here, and splitting it out would mean a component whose
 * whole job is to be imported once.
 */
function AccountPanel() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [accountName, setAccountName] = useDraft(session?.name ?? '');

  if (!session) {
    return (
      <View className="border-border/70 rounded-4xl border p-6">
        <Text className="text-foreground text-lg font-semibold">
          Save your details for next time
        </Text>
        <Text className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Create an account with the number you already order with, and the orders you place stay
          with you instead of with this phone.
        </Text>
        <View className="mt-5 flex-row flex-wrap gap-3">
          <Link href="/signup?next=/account" asChild>
            <Pressable
              accessibilityRole="link"
              className="bg-primary h-12 items-center justify-center rounded-full px-7"
            >
              <Text className="text-primary-foreground text-sm font-semibold">
                Create an account
              </Text>
            </Pressable>
          </Link>
          <Link href="/signin?next=/account" asChild>
            <Pressable
              accessibilityRole="link"
              className="border-border h-12 items-center justify-center rounded-full border px-7"
            >
              <Text className="text-foreground text-sm font-medium">Sign in</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }

  const saveName = async () => {
    setBusy(true);
    try {
      const updated = await updateName(accountName.trim());
      // Mirrored into the device-local profile so checkout prefills the same
      // whichever of the two it reads.
      saveSession({ ...session, name: updated.name });
      saveProfile({ name: updated.name, phone: session.phone });
      toast.success('Name updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update your name.');
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async () => {
    const problem = passwordProblem(newPassword);
    if (problem) {
      setPasswordError(problem);
      return;
    }
    setPasswordError('');
    setBusy(true);
    try {
      // The server retires every token, including this one, and hands back a
      // replacement — so this device stays signed in and every other is out.
      saveSession(await changePassword(currentPassword, newPassword));
      setCurrentPassword('');
      setNewPassword('');
      setChanging(false);
      toast.success('Password changed', {
        description: 'Any other device you were signed in on has been signed out.',
      });
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  const endSession = async () => {
    setBusy(true);
    // Order matters and is the rider app's: unregister the handset first, since
    // that call needs the bearer token; then tell the server; then clear
    // locally. A token left registered keeps buzzing about somebody else's
    // groceries on a shared phone.
    await unregisterForPushNotifications();
    // Cleared locally whatever the server says. Someone tapping sign-out on a
    // phone with no signal must still end up signed out of that phone — the
    // same precedent the console and the rider app set.
    await signOut();
    clearSession();
    toast.success('Signed out');
    setBusy(false);
  };

  const nameUnchanged = accountName.trim() === session.name;

  return (
    <View className="border-border/70 rounded-4xl border p-6">
      <View className="flex-row flex-wrap items-start justify-between gap-4">
        <View>
          <Text className="text-foreground text-lg font-semibold">Your account</Text>
          <Text className="text-muted-foreground num mt-0.5 text-sm">{session.phone}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void endSession()}
          disabled={busy}
          className={
            'h-10 flex-row items-center gap-2 rounded-full px-4 ' + (busy ? 'opacity-60' : '')
          }
        >
          <LogOut size={16} color={colors.mutedForeground} />
          <Text className="text-muted-foreground text-sm font-medium">Sign out</Text>
        </Pressable>
      </View>

      <View className="mt-5 gap-4">
        <View>
          <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Name on the account
          </Text>
          <View className="mt-2 flex-row gap-2">
            <TextInput
              value={accountName}
              onChangeText={setAccountName}
              autoComplete="name"
              accessibilityLabel="Name on the account"
              className="border-border bg-surface h-12 flex-1 rounded-2xl border px-4 text-sm"
              style={{ color: colors.foreground }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void saveName()}
              disabled={busy || nameUnchanged}
              className={
                'bg-secondary h-12 shrink-0 items-center justify-center rounded-2xl px-5 ' +
                (busy || nameUnchanged ? 'opacity-50' : '')
              }
            >
              <Text className="text-foreground text-sm font-medium">Save</Text>
            </Pressable>
          </View>
        </View>

        {/*
          A disabled control rather than a hidden one: a customer who signs in
          and sees no earlier orders needs to know why, and "we cannot send
          codes yet" is a better answer than a screen that silently omits them.
        */}
        {!session.phoneVerified ? (
          <View className="bg-surface rounded-2xl p-4">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-foreground text-sm font-medium">Number not verified</Text>
              <View className="border-border h-9 items-center justify-center rounded-full border px-4 opacity-50">
                <Text className="text-foreground text-xs font-medium">Verify</Text>
              </View>
            </View>
            <Text className="text-muted-foreground mt-2 text-xs leading-relaxed">
              We cannot send verification codes yet. Orders you place while signed in are saved to
              your account either way — but orders placed as a guest, before this account existed,
              stay on the device that placed them.
            </Text>
          </View>
        ) : null}

        {changing ? (
          <View className="bg-surface gap-3 rounded-2xl p-4">
            {/*
              Visible labels, not just placeholders.

              `accessibilityLabel` already covered the screen reader, but a
              placeholder is gone the moment there is a character in the field,
              and two stacked secure inputs are then both a row of dots with
              nothing saying which is the old one. The storefront carries the
              same labels.
            */}
            <View>
              <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                Current password
              </Text>
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoComplete="password"
                autoCapitalize="none"
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Current password"
                className="border-border bg-background mt-2 h-12 w-full rounded-2xl border px-4 text-sm"
                style={{ color: colors.foreground }}
              />
            </View>
            <View>
              <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                New password
              </Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoComplete="password-new"
                autoCapitalize="none"
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="New password"
                className="border-border bg-background mt-2 h-12 w-full rounded-2xl border px-4 text-sm"
                style={{ color: colors.foreground }}
              />
            </View>
            <Text className="text-muted-foreground text-xs">{PASSWORD_HINT}</Text>
            {passwordError ? (
              <Text accessibilityLiveRegion="polite" className="text-destructive text-xs">
                {passwordError}
              </Text>
            ) : null}
            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={() => void submitPassword()}
                disabled={busy}
                className={
                  'bg-primary h-11 items-center justify-center rounded-full px-6 ' +
                  (busy ? 'opacity-60' : '')
                }
              >
                <Text className="text-primary-foreground text-sm font-semibold">
                  Change password
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setChanging(false);
                  setPasswordError('');
                }}
                className="h-11 items-center justify-center rounded-full px-4"
              >
                <Text className="text-muted-foreground text-sm">Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setChanging(true)} className="self-start">
            <Text className="text-muted-foreground text-sm font-medium underline">
              Change password
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function AccountScreen() {
  const profile = useProfile();
  const book = useAddressBook();
  const orders = useRecentOrders();
  const session = useSession();
  const address = selectedAddress(book);

  // Derived from the store rather than seeded from it once: the profile can be
  // empty on the first render and arrive a tick later, so `useState(...)`
  // showed two blank boxes to a customer who had saved their details — and
  // `save()` then wrote those blanks back over what was stored.
  const [name, setName] = useDraft(profile.name);
  const [phone, setPhone] = useDraft(profile.phone);
  const [touched, setTouched] = useState(false);

  /**
   * Whether each field is wrong, and separately whether to *say so yet*.
   *
   * These used to be one value each, gated on `touched`. `save()` sets `touched`
   * and then read them — but they are derived from the render that is still on
   * screen, where `touched` is false, so on the first press both were false
   * whatever was in the boxes. Typing `123` as a mobile number and pressing Save
   * stored it and said "Saved on this device"; the field only turned red
   * afterwards, and only a *second* press was blocked. That number then prefills
   * checkout, so the rider gets a number that cannot be rung.
   *
   * `touched` now governs presentation only. The storefront carries the same
   * fix.
   */
  const nameInvalid = name.trim() !== '' && !isValidName(name);
  const phoneInvalid = phone.trim() !== '' && !isValidIndianMobile(phone);
  const nameError = touched && nameInvalid;
  const phoneError = touched && phoneInvalid;

  const save = () => {
    setTouched(true);
    if (nameInvalid || phoneInvalid) return;
    saveProfile({ name, phone });
    toast.success('Saved on this device');
  };

  const liveOrders = orders.length;
  // The one client-side sum in the app, and it is over locally remembered
  // totals — figures the server already produced — not over prices. Nothing
  // here is charged.
  const spent = orders.reduce((total, order) => total + order.total, 0);

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="py-10 pb-16"
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-foreground text-3xl font-semibold">Your details</Text>
      <Text className="text-muted-foreground mt-3 max-w-xl text-base">
        Your account, and the details this phone remembers to make checkout quick.
      </Text>

      <View className="mt-10 gap-6">
        <AccountPanel />

        <View className="border-border/70 rounded-4xl border p-6">
          <View className="flex-row items-center gap-2">
            <User size={16} color={colors.amber} />
            <Text className="text-foreground text-lg font-semibold">Contact</Text>
          </View>
          <Text className="text-muted-foreground mt-1 text-sm">
            The name a rider should ask for and a number they can call.
          </Text>

          <View className="mt-5 gap-4">
            <View>
              <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                Name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.mutedForeground}
                autoComplete="name"
                accessibilityLabel="Name"
                className={
                  'bg-surface mt-2 h-12 w-full rounded-2xl border px-4 text-sm ' +
                  (nameError ? 'border-destructive' : 'border-border')
                }
                style={{ color: colors.foreground }}
              />
              {nameError ? (
                <Text className="text-destructive mt-1.5 text-xs">
                  Enter at least two characters.
                </Text>
              ) : null}
            </View>

            <View>
              <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                Mobile number
              </Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="98123 45678"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                autoComplete="tel"
                accessibilityLabel="Mobile number"
                className={
                  'bg-surface mt-2 h-12 w-full rounded-2xl border px-4 text-sm ' +
                  (phoneError ? 'border-destructive' : 'border-border')
                }
                style={{ color: colors.foreground }}
              />
              {phoneError ? (
                <Text className="text-destructive mt-1.5 text-xs">
                  Enter a 10-digit mobile number.
                </Text>
              ) : null}
            </View>
          </View>

          <View className="mt-6 flex-row flex-wrap items-center gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={save}
              className="bg-primary h-12 items-center justify-center rounded-full px-7"
            >
              <Text className="text-primary-foreground text-sm font-semibold">Save</Text>
            </Pressable>

            {hasProfile(profile) ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  clearProfile();
                  setName('');
                  setPhone('');
                  setTouched(false);
                  toast.success('Details cleared from this device');
                }}
                className="h-12 flex-row items-center gap-2 rounded-full px-5"
              >
                <Trash2 size={16} color={colors.mutedForeground} />
                <Text className="text-muted-foreground text-sm font-medium">Clear</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <LinkRow
          href="/addresses"
          icon={<MapPin size={16} color={colors.amber} />}
          title="Addresses"
          body={
            address ? address.label + ' · ' + toDeliveryAddress(address) : 'No saved addresses yet'
          }
        />

        <LinkRow
          href="/orders"
          icon={<Package size={16} color={colors.amber} />}
          title="Your orders"
          body={
            liveOrders > 0
              ? liveOrders + ' remembered on this device'
              : 'Orders you place will appear here'
          }
        />

        {liveOrders > 0 ? (
          <View className="border-border/70 rounded-4xl border p-6">
            <Text className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
              On this device
            </Text>
            <View className="mt-4 gap-4">
              <View>
                <Text className="text-muted-foreground text-xs">Orders remembered</Text>
                <Text className="text-foreground num mt-0.5 text-2xl font-semibold">
                  {liveOrders}
                </Text>
              </View>
              <View>
                <Text className="text-muted-foreground text-xs">Their total</Text>
                <Text className="text-foreground num mt-0.5 text-2xl font-semibold">
                  {formatMoneyExact(spent)}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        <View className="bg-surface flex-row gap-3 rounded-4xl p-6">
          <View className="mt-0.5">
            <Info size={16} color={colors.amber} />
          </View>
          <Text className="text-muted-foreground flex-1 text-sm leading-relaxed">
            {session
              ? 'Orders you place while signed in are saved to your account and follow you to any device. Orders from before you signed in are still tracked by a private link saved on this phone only.'
              : 'Your orders are tracked by a private link saved on this phone, so reinstalling loses access to them. Create an account and new orders are kept on the server instead.'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function LinkRow({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        className="border-border/70 flex-row items-center gap-4 rounded-4xl border p-6"
      >
        <View className="bg-amber-soft h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
          {icon}
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-sm font-semibold">{title}</Text>
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {body}
          </Text>
        </View>
        <ChevronRight size={16} color={colors.mutedForeground} />
      </Pressable>
    </Link>
  );
}
