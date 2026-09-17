/**
 * The poll sticker.
 *
 * A question, a box and a button — and it is a real question: the answer goes
 * to `POST /api/store/suggestions` and lands in the console, where the store
 * reads every one. A sticker that thanked the customer and threw the text away
 * would be the decoration-dressed-as-data this codebase keeps refusing to ship.
 *
 * **Red on purpose, and its own red.** Everything else on this screen is navy,
 * white and amber. `rose` is a separate token rather than `destructive` so a
 * question does not borrow the colour that means "something failed" at
 * checkout.
 *
 * The thanks state is remembered per device (`lib/suggestion-sent.ts`), so a
 * regular customer is asked once rather than on every launch. "Send another" is
 * right there for anyone with a second idea; the server's throttle — 30 an hour
 * — is what stops a script from having two hundred.
 *
 * Ported from `edawr-frontend/src/components/SuggestionSticker.tsx`. Three
 * differences:
 *
 * **The corner ribbon is gone.** On the web it is a 160px band rotated 45°
 * whose ends are trimmed by the card's `overflow: hidden`. React Native clips
 * a transformed child unreliably across platforms, and a ribbon that is flush
 * on iOS and ragged on Android is worse than the plain "Tell us" eyebrow the
 * card already has.
 *
 * **There is no `<form>`**, so the submit is the button's `onPress` and the
 * keyboard's return key, wired through `onSubmitEditing`.
 *
 * **The throttle message can name the wait.** `ApiError` here carries
 * `retryAfterSeconds` from the `Retry-After` header, which the web's does not,
 * so "try again in a little while" becomes an actual number of minutes.
 */
import { Send, Sparkles } from 'lucide-react-native';
import { useState, useSyncExternalStore } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ApiError } from '@/lib/api';
import { submitSuggestion } from '@/lib/store-api';
import {
  forgetSuggestionSent,
  getSuggestionSentSnapshot,
  markSuggestionSent,
  subscribeToSuggestionSent,
} from '@/lib/suggestion-sent';
import { GUTTER, colors } from '@/theme';

/** The question, verbatim. It is also what the console page is titled after. */
const QUESTION = 'What would you want delivered in 15 minutes?';

/** Matches `SuggestionCreateSerializer.text.max_length`. */
const MAX_LENGTH = 280;

/** "in 3 minutes" reads better than "in 150 seconds" on every value above one. */
function waitFor(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return 'in a little while';
  if (seconds < 90) return 'in a moment';
  return `in about ${Math.ceil(seconds / 60)} minutes`;
}

export function SuggestionSticker() {
  const sent = useSyncExternalStore(subscribeToSuggestionSent, getSuggestionSentSnapshot);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError('');
    try {
      await submitSuggestion(trimmed);
      markSuggestionSent();
      setText('');
    } catch (caught) {
      // Inline, never a toast: a toast on an error path that a retry can hit
      // again is how a screen ends up shouting. 429 is the one status worth
      // translating — it is the throttle, and the honest thing to say is "not
      // now" rather than "something went wrong".
      setError(
        caught instanceof ApiError && caught.isRateLimited
          ? `That is plenty for now — try again ${waitFor(caught.retryAfterSeconds)}.`
          : 'Could not send that. Check your connection and try again.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="py-8" style={{ paddingHorizontal: GUTTER }}>
      <View className="border-rose/25 bg-rose-soft gap-2 rounded-4xl border p-6">
        <View className="flex-row items-center gap-1.5">
          <Sparkles size={14} color={colors.rose} />
          <Text className="text-rose text-xs font-semibold uppercase tracking-wider">Tell us</Text>
        </View>

        <Text className="text-foreground text-2xl font-semibold leading-tight">{QUESTION}</Text>

        {sent ? (
          <View className="mt-3 gap-2">
            <Text className="text-muted-foreground text-sm">
              Thanks — we read every one, and the shelves change because of them.
            </Text>
            <Pressable accessibilityRole="button" onPress={forgetSuggestionSent} hitSlop={8}>
              <Text className="text-rose text-sm font-medium">Send another</Text>
            </Pressable>
          </View>
        ) : (
          <View className="mt-3 gap-2">
            <TextInput
              value={text}
              onChangeText={setText}
              maxLength={MAX_LENGTH}
              placeholder="Hot momos, a birthday cake, Pepsi at midnight…"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={() => void submit()}
              accessibilityLabel="Your answer"
              className="border-rose/30 bg-background text-foreground h-12 rounded-full border px-5 text-sm"
            />

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: sending || !text.trim() }}
              disabled={sending || !text.trim()}
              onPress={() => void submit()}
              className={
                sending || !text.trim()
                  ? 'bg-rose h-12 flex-row items-center justify-center gap-2 rounded-full opacity-50'
                  : 'bg-rose h-12 flex-row items-center justify-center gap-2 rounded-full'
              }
            >
              <Text className="text-rose-foreground text-sm font-semibold">
                {sending ? 'Sending…' : 'Send'}
              </Text>
              <Send size={16} color={colors.roseForeground} />
            </Pressable>

            {error ? (
              <Text accessibilityLiveRegion="polite" className="text-destructive text-sm">
                {error}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
