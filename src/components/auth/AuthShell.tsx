/**
 * The furniture both auth screens share: a card, a field and an error region.
 *
 * Ported from `edawr-frontend/src/components/auth/AuthShell.tsx`.
 *
 * Kept here rather than in either screen because the two forms have to look and
 * behave identically — a sign-up that styles its inputs differently from
 * sign-in reads as a different app, which is exactly the moment someone is
 * deciding whether to trust it with a password.
 */
import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { GUTTER, colors } from '@/theme';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      // iOS only, matching the rider app: Android's own adjustResize already
      // does this, and doubling up pushes the form off the top of the screen.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="bg-background flex-1"
    >
      <ScrollView
        contentContainerClassName="py-10"
        contentContainerStyle={{ paddingHorizontal: GUTTER }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-md self-center">
          <Text className="text-foreground text-2xl font-semibold">{title}</Text>
          <Text className="text-muted-foreground mt-2 text-sm">{subtitle}</Text>

          <View className="border-border bg-surface mt-6 rounded-3xl border p-6">{children}</View>

          <View className="mt-6 flex-row flex-wrap items-center justify-center gap-1">
            {footer}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  error,
  keyboardType,
  autoComplete,
  disabled,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'tel' | 'password';
  placeholder?: string;
  hint?: string;
  error?: string;
  keyboardType?: 'phone-pad' | 'default';
  autoComplete?: 'name' | 'tel' | 'password' | 'password-new';
  disabled?: boolean;
  onSubmitEditing?: () => void;
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
        secureTextEntry={type === 'password'}
        keyboardType={keyboardType ?? (type === 'tel' ? 'phone-pad' : 'default')}
        autoComplete={autoComplete}
        // A name or a phone number should never be capitalised or corrected by
        // the keyboard, and neither should a password.
        autoCapitalize={autoComplete === 'name' ? 'words' : 'none'}
        autoCorrect={false}
        editable={!disabled}
        onSubmitEditing={onSubmitEditing}
        // The label alone announced an unexplained field. A red border says
        // nothing to a screen reader, so the message — or the hint, when there
        // is no error — rides along with the name. The storefront wires the same
        // two strings with `aria-describedby`.
        accessibilityLabel={error ? label + '. ' + error : hint ? label + '. ' + hint : label}
        className={
          'bg-background mt-2 h-12 w-full rounded-2xl border px-4 text-sm ' +
          (error ? 'border-destructive' : 'border-border') +
          (disabled ? ' opacity-60' : '')
        }
        style={{ color: colors.foreground }}
      />
      {error ? (
        <Text accessibilityLiveRegion="assertive" className="text-destructive mt-1.5 text-xs">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-muted-foreground mt-1.5 text-xs">{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * The form-level failure.
 *
 * **Announced when it appears**, so a screen reader reports a rejected password
 * instead of leaving someone staring at a form that did nothing.
 */
export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      className="border-destructive/30 bg-destructive/5 mt-4 rounded-2xl border px-4 py-3"
    >
      <Text className="text-destructive text-sm">{message}</Text>
    </View>
  );
}

export function AuthSwitchLink({
  href,
  prompt,
  action,
}: {
  href: string;
  prompt: string;
  action: string;
}) {
  return (
    <>
      <Text className="text-muted-foreground text-sm">{prompt}</Text>
      <Link href={href} asChild>
        <Pressable accessibilityRole="link" hitSlop={6}>
          <Text className="text-foreground text-sm font-medium underline">{action}</Text>
        </Pressable>
      </Link>
    </>
  );
}

/** The primary submit button both forms use. `rounded-2xl`, not a pill — the
 *  one place the storefront departs from its own button idiom, and the app
 *  matches it so the two do not drift. */
export function AuthSubmit({
  label,
  busyLabel,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || disabled }}
      disabled={busy || disabled}
      onPress={onPress}
      className={
        'bg-primary mt-6 h-12 w-full items-center justify-center rounded-2xl ' +
        (busy || disabled ? 'opacity-60' : '')
      }
    >
      <Text className="text-primary-foreground text-sm font-medium">
        {busy ? busyLabel : label}
      </Text>
    </Pressable>
  );
}
