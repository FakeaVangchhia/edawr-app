/**
 * `vi.stubGlobal` / `vi.unstubAllGlobals`, for Jest.
 *
 * The storefront's `api.test.ts` and `customer-api.test.ts` replace `fetch`
 * wholesale and restore it afterwards. Jest has no equivalent — `jest.spyOn`
 * needs a property that already exists on an object it can reach, and
 * `globalThis.fetch` in React Native's test environment is not always
 * configurable — so this is the twelve lines that make those suites port
 * unchanged.
 *
 * Restoring is not optional: a leaked `fetch` stub makes the *next* file's
 * failures unreadable, since they are about a request the test never made.
 */
const originals = new Map<string, unknown>();

export function stubGlobal(name: string, value: unknown): void {
  if (!originals.has(name)) {
    originals.set(name, (globalThis as Record<string, unknown>)[name]);
  }
  (globalThis as Record<string, unknown>)[name] = value;
}

export function unstubAllGlobals(): void {
  for (const [name, value] of originals) {
    (globalThis as Record<string, unknown>)[name] = value;
  }
  originals.clear();
}
