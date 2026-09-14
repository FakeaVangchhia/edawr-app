/**
 * The delivery-promise chip.
 *
 * **Why this is its own file.** Run after the `AddControl` suite, in the same
 * file, these two assertions fail: past roughly the seventh `render` in a file,
 * `@testing-library/react-native` 14 starts returning null trees and every
 * query then fails with "unable to find an element" — nowhere near the test
 * that caused it. Isolating renders down to one test reproduced nothing;
 * explicit `cleanup`, `unmount` between renders, and `concurrentRoot: false`
 * each changed nothing. Jest gives each file its own renderer, and that is a
 * boundary that does hold.
 *
 * So this is a workaround for a library quirk, not a design decision, and it is
 * written down so the next person does not spend the afternoon on it again.
 */
import { render } from '@testing-library/react-native';

import { EtaChip } from './ProductCard';

describe('EtaChip', () => {
  it('renders the promise it was handed', async () => {
    const { getByText } = await render(<EtaChip minutes={15} />);

    // A regex, because `{minutes} min` is two text children in React Native
    // and an exact-string match is a hostage to how they are joined.
    expect(getByText(/15\s*min/)).toBeTruthy();
  });

  it('shows nothing at all before the store config lands', async () => {
    // Null rather than a guess. A chip reading "15 min" from a hardcoded default
    // is a promise the store has not made.
    const { toJSON } = await render(<EtaChip minutes={null} />);

    expect(toJSON()).toBeNull();
  });
});
