import { Navigation } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import MapView, { Marker, type LatLng } from 'react-native-maps';

import { hasLocationPermission } from '@/lib/geolocation';
import { colors } from '@/theme';
import type { RiderPosition } from '@/types';

/**
 * The rider on a map, above the distance-and-direction card.
 *
 * Two things only: the rider's marker, turned to their heading, and the
 * phone's own "you are here" dot. **There is no pin for the delivery
 * address.** The tracking endpoint leaves the order's coordinates out on
 * purpose, because anyone holding the link can open it (see
 * `test_internal_fields_are_not_exposed` in the backend). The phone's own dot
 * shows the same thing without the server sending it.
 *
 * That dot appears only when location is already allowed. The map never asks
 * for permission: "Share my location" below asks, and this rechecks once
 * `sharedAt` changes.
 *
 * `react-native-maps` because it is bundled in Expo Go. A release Android build
 * needs `GOOGLE_MAPS_ANDROID_API_KEY` at build time — see app.config.js.
 */

const EDGE_PADDING = { top: 56, right: 56, bottom: 56, left: 56 };
const DELTA = 0.012;

export function LiveRiderMap({
  position,
  stale,
  sharedAt,
}: {
  position: RiderPosition;
  stale: boolean;
  /** Changes when the customer shares their location, so permission is re-read. */
  sharedAt: unknown;
}) {
  const mapRef = useRef<MapView>(null);
  const ready = useRef(false);
  const me = useRef<LatLng | null>(null);
  // Once the customer pans or zooms, the map is theirs. Recentring on every
  // five-second poll would pull it back out from under their finger.
  const touched = useRef(false);
  const [showMe, setShowMe] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hasLocationPermission().then((granted) => {
      if (!cancelled) setShowMe(granted);
    });
    return () => {
      cancelled = true;
    };
  }, [sharedAt]);

  const { latitude, longitude } = position;

  const frame = () => {
    const map = mapRef.current;
    if (!map || !ready.current || touched.current) return;
    const rider = { latitude, longitude };
    if (me.current) {
      map.fitToCoordinates([rider, me.current], { edgePadding: EDGE_PADDING, animated: true });
    } else {
      map.animateCamera({ center: rider }, { duration: 400 });
    }
  };

  // Refit on each new fix, not each render.
  useEffect(frame, [latitude, longitude]);

  return (
    <View className="overflow-hidden rounded-3xl" style={{ height: 220, opacity: stale ? 0.6 : 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{ latitude, longitude, latitudeDelta: DELTA, longitudeDelta: DELTA }}
        showsUserLocation={showMe}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onMapReady={() => {
          ready.current = true;
          frame();
        }}
        onPanDrag={() => {
          touched.current = true;
        }}
        onUserLocationChange={(event) => {
          const coordinate = event.nativeEvent.coordinate;
          if (me.current || !coordinate) return;
          me.current = { latitude: coordinate.latitude, longitude: coordinate.longitude };
          frame();
        }}
      >
        <Marker
          coordinate={{ latitude, longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          // lucide's Navigation arrow points north-east, so 45° brings it to
          // north before the heading turns it.
          rotation={position.heading !== null ? position.heading - 45 : -45}
          title="Your rider"
          accessibilityLabel="Your rider"
        >
          <View
            className="bg-amber items-center justify-center rounded-full border-2 border-white"
            style={{ width: 36, height: 36 }}
          >
            <Navigation size={18} color={colors.amberForeground} fill={colors.amberForeground} />
          </View>
        </Marker>
      </MapView>
    </View>
  );
}
