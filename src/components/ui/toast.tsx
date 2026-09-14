/**
 * Toasts — the storefront's `sonner`, reimplemented.
 *
 * `sonner-native` exists and would have been a closer match, but it requires
 * `react-native-worklets >= 0.6.1` and Expo SDK 54 pins 0.5.1. Deviating from
 * the SDK's tested native version set to gain a toast library is a bad trade:
 * the failure mode is a build that compiles and crashes on a device.
 *
 * So this is the same public API — `toast.success(...)`, `toast.error(...)`,
 * and a single `action` — which is what the call sites ported from the
 * storefront actually use. Anything sonner does beyond that (promise toasts,
 * custom JSX, more than one action) is not used there and is not implemented
 * here.
 *
 * An external store rather than context, matching every other shared value in
 * this app: `toast.success` is called from event handlers and from `.then`
 * blocks in files that are not components, and threading a provider's dispatch
 * into those is exactly the prop-drilling the cart store exists to avoid.
 */
import { useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { colors, TOAST_OFFSET } from '@/theme';

export interface ToastOptions {
  description?: string;
  /**
   * One recovery action, rendered as a button on the toast.
   *
   * Added for the basket's "Clear all", which is destructive, one tap and was
   * previously final — the storefront answers that with sonner's `action`, and
   * without an equivalent here the two apps would differ on whether emptying a
   * basket by accident can be taken back.
   *
   * Deliberately one action, not a list: a toast is a transient strip at the
   * bottom of a phone, and the moment it carries a choice it needs to be a
   * dialog instead. Pressing it dismisses the toast — the undo has happened,
   * so leaving the offer up invites a second press that would undo nothing.
   */
  action?: { label: string; onPress: () => void };
}

interface ToastRecord {
  id: number;
  tone: 'success' | 'error';
  message: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}

/** How long a toast stays up. sonner's own default, kept so timing feels the same. */
const DURATION_MS = 4000;
/** Older toasts are dropped rather than stacked past this. */
const MAX_VISIBLE = 3;

let queue: ToastRecord[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function push(tone: ToastRecord['tone'], message: string, options?: ToastOptions) {
  const record: ToastRecord = {
    id: nextId++,
    tone,
    message,
    description: options?.description,
    action: options?.action,
  };
  queue = [...queue, record].slice(-MAX_VISIBLE);
  emit();

  setTimeout(() => dismiss(record.id), DURATION_MS);
}

function dismiss(id: number) {
  const next = queue.filter((entry) => entry.id !== id);
  // Guard the no-op: a toast dismissed by hand also has a timer that will fire
  // later, and re-emitting an identical array re-renders every subscriber.
  if (next.length === queue.length) return;
  queue = next;
  emit();
}

export const toast = {
  success: (message: string, options?: ToastOptions) => push('success', message, options),
  error: (message: string, options?: ToastOptions) => push('error', message, options),
};

function useToasts(): ToastRecord[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => queue,
    () => queue,
  );
}

/**
 * Mounted once, in the root layout, above everything else.
 *
 * Positioned `TOAST_OFFSET` from the bottom — 88, the same figure the
 * storefront passes sonner as `mobileOffset`, plus the home-indicator inset.
 *
 * This one really does have to clear the tab bar: the `Toaster` is absolute
 * against the whole window, outside the header/content/nav column. The sticky
 * CTAs on cart and checkout are *inside* that column and therefore sit at
 * `bottom-0` — see the note there before assuming the two should match.
 */
export function Toaster() {
  const toasts = useToasts();
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 z-50 gap-2 px-5"
      style={{ paddingBottom: TOAST_OFFSET + insets.bottom }}
    >
      {toasts.map((entry) => (
        <ToastRow key={entry.id} toast={entry} />
      ))}
    </View>
  );
}

/**
 * `accessibilityLiveRegion` is not decoration here: a toast is often the only
 * confirmation that an item reached the basket, and without it a screen-reader
 * user gets no feedback from the Add button at all.
 */
function ToastRow({ toast: entry }: { toast: ToastRecord }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(160)}
      accessibilityLiveRegion="polite"
      className="border-border bg-background flex-row items-start gap-3 rounded-2xl border px-4 py-3"
      style={{
        shadowColor: '#030819',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 8,
      }}
    >
      <View className="flex-1">
        <Text
          className={
            entry.tone === 'error'
              ? 'text-destructive text-sm font-semibold'
              : 'text-foreground text-sm font-semibold'
          }
        >
          {entry.message}
        </Text>
        {entry.description ? (
          <Text className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {entry.description}
          </Text>
        ) : null}
      </View>

      {entry.action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={entry.action.label}
          hitSlop={8}
          onPress={() => {
            entry.action?.onPress();
            dismiss(entry.id);
          }}
          className="bg-secondary self-center rounded-full px-3 py-1.5"
        >
          <Text className="text-foreground text-xs font-semibold">{entry.action.label}</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
        onPress={() => dismiss(entry.id)}
        className="-mr-1 p-1"
      >
        <X size={16} color={colors.mutedForeground} />
      </Pressable>
    </Animated.View>
  );
}
