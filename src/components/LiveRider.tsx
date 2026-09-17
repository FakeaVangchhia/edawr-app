import { LocateFixed, Navigation } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';

import { PulseSoft } from '@/components/ui/motion';
import { toast } from '@/components/ui/toast';
import { useRiderPosition } from '@/hooks/useRiderPosition';
import { ApiError } from '@/lib/api';
import { GEOLOCATION_MESSAGES, requestPosition, type Coordinates } from '@/lib/geolocation';
import { describeRider } from '@/lib/live-rider';
import { shareCustomerPosition } from '@/lib/store-api';
import { colors } from '@/theme';

/**
 * Where the rider is, while they are carrying this order.
 *
 * A port of the storefront's `LiveRider`, without its radar: on a phone the
 * distance and the direction are the sentence the customer reads, and a
 * picture of two dots adds a dependency the sentence does not need. Same
 * contract otherwise — the API's narrow view of a rider's position (distance,
 * direction, freshness; never an ETA), and an opt-in "share my location" that
 * tells the rider where the customer is actually standing and re-sends every
 * minute while the app is in front.
 */

const RESHARE_MS = 60_000;

function useNow(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

export function LiveRider({ token, active }: { token: string; active: boolean }) {
  const { position, loaded, refresh } = useRiderPosition(token, active);
  const [me, setMe] = useState<Coordinates | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const now = useNow(active && position !== null);

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    setShareNote('');
    try {
      const { coords, failure, accuracyM } = await requestPosition();
      if (!coords) {
        setShareNote(failure ? GEOLOCATION_MESSAGES[failure] : '');
        return;
      }
      await shareCustomerPosition(token, { ...coords, accuracy_m: accuracyM ?? null });
      setMe(coords);
      refresh();
      toast.success('Location shared', {
        description: 'Your rider can now see where you are waiting.',
      });
    } catch (caught: unknown) {
      if (caught instanceof ApiError && caught.status === 409) {
        setShareNote('This order has already been completed.');
        return;
      }
      setShareNote('We could not share your location just now. Your address is enough.');
    } finally {
      setSharing(false);
    }
  };

  /** Keep the rider's copy fresh once the customer has opted in. */
  useEffect(() => {
    if (!active || me === null) return;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      requestPosition()
        .then(({ coords, accuracyM }) => {
          if (!coords) return;
          return shareCustomerPosition(token, {
            ...coords,
            accuracy_m: accuracyM ?? null,
          }).then(() => setMe(coords));
        })
        .catch(() => {
          /* the previous share stands */
        });
    }, RESHARE_MS);
    return () => clearInterval(timer);
  }, [active, me, token]);

  if (!active) return null;

  const described = position ? describeRider(position, me, now) : null;
  const live = described !== null && !described.stale;

  return (
    <View className="mt-4 gap-4">
      <View className="bg-primary rounded-3xl p-5">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row items-center gap-2">
            {live ? (
              <PulseSoft>
                <View className="bg-success h-2 w-2 rounded-full" />
              </PulseSoft>
            ) : (
              <View className="bg-primary-foreground/40 h-2 w-2 rounded-full" />
            )}
            <Text className="text-primary-foreground text-xs font-semibold uppercase tracking-wide">
              {live ? 'Live' : 'Waiting for signal'}
            </Text>
          </View>
          {described ? (
            <Text className="text-primary-foreground/70 num text-xs">{described.freshness}</Text>
          ) : null}
        </View>

        {described ? (
          <View className="mt-4">
            <Text className="text-primary-foreground num text-2xl font-semibold">
              {described.distance}
            </Text>
            {described.direction ? (
              <View className="mt-1 flex-row items-center gap-1.5">
                <Navigation size={14} color="rgba(255,255,255,0.7)" />
                <Text className="text-primary-foreground/70 text-sm">{described.direction}</Text>
              </View>
            ) : null}
            {described.stale ? (
              <Text className="text-primary-foreground/70 mt-2 text-xs">
                Their phone has not reported for a while — probably a dead spot on the hill.
              </Text>
            ) : null}
          </View>
        ) : (
          <Text className="text-primary-foreground/70 mt-3 text-sm">
            {loaded
              ? 'Your rider is on the way. Their position appears here as soon as their phone reports it.'
              : 'Looking for your rider…'}
          </Text>
        )}
      </View>

      <View className="gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={me ? 'Update my location' : 'Share my location'}
          onPress={() => void share()}
          disabled={sharing}
          className={
            'h-11 flex-row items-center justify-center gap-2 self-start rounded-full px-5 ' +
            (me ? 'border-border bg-background border' : 'bg-amber') +
            (sharing ? ' opacity-60' : '')
          }
        >
          {sharing ? (
            <ActivityIndicator size="small" color={me ? colors.foreground : colors.amberForeground} />
          ) : (
            <LocateFixed size={16} color={me ? colors.foreground : colors.amberForeground} />
          )}
          <Text
            className={
              'text-sm font-semibold ' + (me ? 'text-foreground' : 'text-amber-foreground')
            }
          >
            {sharing ? 'Finding you…' : me ? 'Update my location' : 'Share my location'}
          </Text>
        </Pressable>
        <Text className="text-muted-foreground text-xs">
          {me
            ? 'Your rider can see where you are waiting. It refreshes while the app is open.'
            : 'Optional — helps the rider find you if the address is hard to spot.'}
        </Text>
        {shareNote ? (
          <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-sm">
            {shareNote}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
