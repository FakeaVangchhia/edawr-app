/**
 * The only thing standing between a render error and a blank phone.
 *
 * React Native has no default fallback worth the name: an uncaught render throw
 * unmounts the whole tree, which in a release build is a crash to the home
 * screen with no message. On the web the equivalent is `app/error.tsx`, which
 * Next.js mounts for you; here it has to be built.
 *
 * A class component because that is the only way — `componentDidCatch` and
 * `getDerivedStateFromError` have no hook equivalents.
 *
 * **It offers Try again rather than only reporting.** Clearing the error state
 * re-renders the subtree, which recovers from a transient bad render — a stale
 * order shape from a poll that raced a status change, say — without the
 * customer losing their basket. If it throws again they see this screen again,
 * which is the honest outcome.
 *
 * The copy is the storefront's, including the line about the basket being safe.
 * That is not reassurance for its own sake: the basket really is in device
 * storage and really does survive this, and a customer who believes they have
 * lost a full trolley abandons the order.
 */
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Reports the crash. Injected so this file needs no import of the API layer. */
  onError?: (error: Error, componentStack: string) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Logged as well as reported: in development nobody is reading the Django
    // log while tapping around the app.
    console.error('eDawr crashed', error);
    this.props.onError?.(error, info.componentStack ?? '');
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View className="bg-background flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center gap-3 p-6">
          <Text className="text-foreground text-2xl font-semibold">This screen didn&apos;t load</Text>
          <Text className="text-muted-foreground text-sm leading-relaxed">
            Something went wrong on our end. Your basket is safe — try again, or head back home.
          </Text>

          {/* The message, not the stack. Someone reading it out to the shop over
              the phone is the realistic support path, and a stack trace is
              unreadable that way. The full component stack goes to the backend. */}
          <Text className="text-muted-foreground mt-1 font-mono text-xs leading-relaxed">
            {error.message}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={this.reset}
            className="bg-primary mt-4 h-12 items-center justify-center self-start rounded-full px-7"
          >
            <Text className="text-primary-foreground text-sm font-semibold">Try again</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

/**
 * The build has no usable backend URL.
 *
 * Separate from the boundary above because it is not a crash — it is a build
 * that was assembled wrong, and it will fail identically every launch. See
 * `config.ts` for why this is a screen rather than a throw during import.
 */
export function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <View className="bg-background flex-1">
      <ScrollView contentContainerClassName="flex-grow justify-center gap-3 p-6">
        <Text className="text-foreground text-2xl font-semibold">This build is misconfigured</Text>
        <Text className="text-muted-foreground text-sm leading-relaxed">
          The app does not know which server to talk to, so nothing it does would work. This is not
          something signing in again will fix — the build itself needs replacing.
        </Text>
        <Text className="text-muted-foreground mt-1 font-mono text-xs leading-relaxed">
          {message}
        </Text>
      </ScrollView>
    </View>
  );
}
