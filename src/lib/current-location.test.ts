import { resetStorage } from './test-storage';
import { addAddress, readAddresses, removeAddress } from './addresses';
import {
  FIRST_LAUNCH_KEY,
  formatPlacemark,
  getLocateSnapshot,
  locateCurrentAddress,
  relocateIfAllowed,
  resetLocateState,
  runFirstLaunchLocate,
} from './current-location';
import { storage } from './storage';

jest.mock('expo-location', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

const Location = require('expo-location') as Record<string, jest.Mock>;

const granted = { granted: true, status: 'granted', canAskAgain: true };
const undetermined = { granted: false, status: 'undetermined', canAskAgain: true };
const deniedForever = { granted: false, status: 'denied', canAskAgain: false };
const here = { coords: { latitude: 23.74, longitude: 92.71 } };
const chanmari = {
  name: 'Chanmari West',
  streetNumber: null,
  street: 'Zarkawt Road',
  district: 'Chanmari',
  subregion: 'Aizawl',
  city: 'Aizawl',
};

// requestPosition races the fix against a ten-second timer; fake timers stop
// that timer outliving the test run.
jest.useFakeTimers();

beforeEach(() => {
  resetStorage();
  resetLocateState();
  for (const entry of readAddresses().entries) removeAddress(entry.id);
});

describe('formatPlacemark', () => {
  it('joins name, street and district, most specific first', () => {
    expect(formatPlacemark({ ...chanmari, district: 'Dawrpui' })).toEqual({
      line: 'Chanmari West, Zarkawt Road, Dawrpui',
      city: 'Aizawl',
    });
  });

  it('drops a district the name already says', () => {
    expect(formatPlacemark(chanmari)?.line).toBe('Chanmari West, Zarkawt Road');
  });

  it('drops repeats and the city itself', () => {
    expect(
      formatPlacemark({ ...chanmari, name: 'Zarkawt Road', district: 'Aizawl' }),
    ).toEqual({ line: 'Zarkawt Road', city: 'Aizawl' });
  });

  it('ignores a bare plus code or house number as the name', () => {
    expect(formatPlacemark({ ...chanmari, name: '7MQ6+2X' })?.line).toBe(
      'Zarkawt Road, Chanmari',
    );
  });

  it('is null when nothing a rider could read is left', () => {
    expect(
      formatPlacemark({ name: null, streetNumber: null, street: null, district: null, subregion: null, city: 'Aizawl' }),
    ).toBeNull();
  });
});

describe('locateCurrentAddress', () => {
  it('asks, locates and saves the current location', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue(undetermined);
    Location.requestForegroundPermissionsAsync.mockResolvedValue(granted);
    Location.getCurrentPositionAsync.mockResolvedValue(here);
    Location.reverseGeocodeAsync.mockResolvedValue([chanmari]);

    const saved = await locateCurrentAddress({ ask: true });

    expect(saved).toMatchObject({ label: 'Current location', latitude: 23.74, longitude: 92.71 });
    expect(readAddresses().selectedId).toBe(saved?.id);
    expect(getLocateSnapshot().status).toBe('located');
  });

  it('never prompts when not asked to', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue(undetermined);

    await locateCurrentAddress({ ask: false });

    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(getLocateSnapshot().status).toBe('denied');
  });

  it('reports blocked when only Settings can turn it on', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue(deniedForever);

    await locateCurrentAddress({ ask: true });

    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(getLocateSnapshot().status).toBe('blocked');
  });

  it('keeps the fix as pending when the street cannot be read', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue(granted);
    Location.getCurrentPositionAsync.mockResolvedValue(here);
    Location.reverseGeocodeAsync.mockRejectedValue(new Error('offline'));

    expect(await locateCurrentAddress({ ask: true })).toBeNull();
    expect(getLocateSnapshot()).toEqual({
      status: 'failed',
      pending: { latitude: 23.74, longitude: 92.71 },
    });
    expect(readAddresses().entries).toEqual([]);
  });
});

describe('relocateIfAllowed', () => {
  it('locates silently once location is switched on in Settings', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue(deniedForever);
    await locateCurrentAddress({ ask: true });

    Location.getForegroundPermissionsAsync.mockResolvedValue(granted);
    Location.getCurrentPositionAsync.mockResolvedValue(here);
    Location.reverseGeocodeAsync.mockResolvedValue([chanmari]);
    await relocateIfAllowed();

    expect(getLocateSnapshot().status).toBe('located');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('runFirstLaunchLocate', () => {
  it('runs once per install', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue(undetermined);
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ ...undetermined, status: 'denied' });

    await runFirstLaunchLocate();
    resetLocateState();
    await runFirstLaunchLocate();

    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(storage.getItem(FIRST_LAUNCH_KEY)).not.toBeNull();
  });

  it('does not prompt a customer who already has addresses', async () => {
    addAddress({ label: 'Home', line: 'Chaltlang Block C', city: 'Aizawl', landmark: '' });

    await runFirstLaunchLocate();

    expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});
