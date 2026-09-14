/**
 * Sign in.
 *
 * Ported from `edawr-frontend/src/app/signin/SignInPage.tsx`.
 *
 * There is deliberately **no "forgot password" link**. The backend has no SMS
 * provider and no reset flow, so a link would lead nowhere; the footnote says
 * so plainly instead. An honest dead end beats a button that does nothing.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthError, AuthField, AuthShell, AuthSubmit, AuthSwitchLink } from '@/components/auth/AuthShell';
import { toast } from '@/components/ui/toast';
import { ApiError, NetworkError } from '@/lib/api';
import { signIn } from '@/lib/customer-api';
import { saveProfile } from '@/lib/profile';
import { safeNext } from '@/lib/redirect';
import { saveSession } from '@/lib/session';
import { registerForPushNotifications } from '@/push';
import { isValidIndianMobile } from '@/lib/validation';

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const next = safeNext(params.next);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [failure, setFailure] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setFailure('');

    if (!isValidIndianMobile(phone)) {
      setPhoneError('Enter a 10-digit mobile number.');
      return;
    }
    setPhoneError('');

    setSubmitting(true);
    try {
      const session = await signIn(phone.trim(), password);
      saveSession(session);
      // Mirrored into the device-local profile so checkout prefills the same
      // way whether or not this session survives.
      saveProfile({ name: session.name, phone: session.phone });
      // Registered here as well as on launch, because this is the first moment
      // there is an account to attach the handset to.
      void registerForPushNotifications();
      toast.success('Signed in');
      router.replace(next);
    } catch (error) {
      if (error instanceof NetworkError || error instanceof ApiError) {
        setFailure(error.message);
      } else {
        setFailure('Could not sign you in. Try again in a moment.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Your orders follow your account, on any phone."
      footer={
        <AuthSwitchLink
          href={'/signup?next=' + encodeURIComponent(next)}
          prompt="No account yet?"
          action="Create one"
        />
      }
    >
      <View className="gap-4">
        <AuthField
          label="Mobile number"
          value={phone}
          onChange={setPhone}
          type="tel"
          autoComplete="tel"
          placeholder="98123 45678"
          error={phoneError}
          disabled={submitting}
        />
        <AuthField
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="password"
          disabled={submitting}
          onSubmitEditing={() => void submit()}
        />
      </View>

      <AuthError message={failure} />

      <AuthSubmit
        label="Sign in"
        busyLabel="Signing in…"
        busy={submitting}
        onPress={() => void submit()}
      />

      <Text className="text-muted-foreground mt-4 text-xs leading-relaxed">
        Forgotten your password? We cannot reset it by SMS yet — ask at the shop and we will sort
        it out.
      </Text>
    </AuthShell>
  );
}
