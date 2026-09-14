/**
 * Create an account.
 *
 * Ported from `edawr-frontend/src/app/signup/SignUpPage.tsx`.
 *
 * The two paragraphs at the bottom are not filler. Nothing writes
 * `phone_verified_at` yet — there is no SMS provider and no DLT registration —
 * so an account proves someone *knows* a number, not that they hold the SIM.
 * The consequences of that fall on the customer (older guest orders do not
 * appear; a forgotten password cannot be reset), and telling them up front is
 * cheaper than a support call afterwards.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthError, AuthField, AuthShell, AuthSubmit, AuthSwitchLink } from '@/components/auth/AuthShell';
import { toast } from '@/components/ui/toast';
import { ApiError, NetworkError } from '@/lib/api';
import { signUp } from '@/lib/customer-api';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';
import { saveProfile } from '@/lib/profile';
import { safeNext } from '@/lib/redirect';
import { saveSession } from '@/lib/session';
import { registerForPushNotifications } from '@/push';
import { isValidIndianMobile, isValidName } from '@/lib/validation';

export default function SignUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const next = safeNext(params.next);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string; password?: string }>({});
  const [failure, setFailure] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setFailure('');

    const found: typeof errors = {};
    if (!isValidName(name)) found.name = 'Tell us what to call you.';
    if (!isValidIndianMobile(phone)) found.phone = 'Enter a 10-digit mobile number.';
    const passwordIssue = passwordProblem(password, phone);
    if (passwordIssue) found.password = passwordIssue;

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const session = await signUp({ phone: phone.trim(), password, name: name.trim() });
      saveSession(session);
      saveProfile({ name: session.name, phone: session.phone });
      // Registered here as well as on launch, because this is the first moment
      // there is an account to attach the handset to.
      void registerForPushNotifications();
      toast.success('Account created');
      router.replace(next);
    } catch (error) {
      if (error instanceof ApiError && error.isConflict) {
        // The server tells us the number is taken, which is the one thing it is
        // willing to reveal here — and the only answer that lets someone do the
        // right thing next.
        setErrors({ phone: 'This number already has an account. Sign in instead.' });
      } else if (error instanceof NetworkError || error instanceof ApiError) {
        setFailure(error.message);
      } else {
        setFailure('Could not create your account. Try again in a moment.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create an account"
      subtitle="So your orders are not tied to one phone."
      footer={
        <AuthSwitchLink
          href={'/signin?next=' + encodeURIComponent(next)}
          prompt="Already have one?"
          action="Sign in"
        />
      }
    >
      <View className="gap-4">
        <AuthField
          label="Your name"
          value={name}
          onChange={setName}
          autoComplete="name"
          placeholder="Lalringa"
          error={errors.name}
          disabled={submitting}
        />
        <AuthField
          label="Mobile number"
          value={phone}
          onChange={setPhone}
          type="tel"
          autoComplete="tel"
          placeholder="98123 45678"
          hint="The number a rider would call."
          error={errors.phone}
          disabled={submitting}
        />
        <AuthField
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="password-new"
          hint={PASSWORD_HINT}
          error={errors.password}
          disabled={submitting}
          onSubmitEditing={() => void submit()}
        />
      </View>

      <AuthError message={failure} />

      <AuthSubmit
        label="Create account"
        busyLabel="Creating…"
        busy={submitting}
        onPress={() => void submit()}
      />

      <View className="mt-5 gap-2">
        <Text className="text-muted-foreground text-xs leading-relaxed">
          Orders you place while signed in are saved to your account. Orders placed before this
          stay on the device that placed them — we cannot yet send a code to confirm the number is
          yours.
        </Text>
        <Text className="text-muted-foreground text-xs leading-relaxed">
          Keep the password somewhere safe: we have no way to reset it by SMS, so a forgotten one
          means asking at the shop.
        </Text>
      </View>
    </AuthShell>
  );
}
