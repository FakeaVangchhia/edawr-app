import { isValidIndianMobile } from './validation';

/**
 * Client-side validation is a courtesy — the server validates the same field
 * and is the only thing that decides. But a client rule that is *stricter* than
 * the server's is worse than none at all: it rejects a customer the store would
 * happily have served, and there is no way for them to argue with it.
 */
describe('isValidIndianMobile', () => {
  it('accepts a plain ten-digit number', () => {
    expect(isValidIndianMobile('9812345678')).toBe(true);
  });

  it('accepts a number that itself starts with 91', () => {
    // The regression this exists for: stripping a leading "91" unconditionally
    // turned 9123456789 into 23456789 and locked the customer out of checkout.
    expect(isValidIndianMobile('9123456789')).toBe(true);
    expect(isValidIndianMobile('9198765432')).toBe(true);
  });

  it('accepts the country code, with and without punctuation', () => {
    expect(isValidIndianMobile('+919812345678')).toBe(true);
    expect(isValidIndianMobile('+91 98123 45678')).toBe(true);
    expect(isValidIndianMobile('919812345678')).toBe(true);
  });

  it('accepts a trunk-dialling zero', () => {
    expect(isValidIndianMobile('098123-45678')).toBe(true);
  });

  it('rejects numbers that are not Indian mobiles', () => {
    expect(isValidIndianMobile('1234567890')).toBe(false); // must start 6-9
    expect(isValidIndianMobile('5812345678')).toBe(false);
    expect(isValidIndianMobile('98123')).toBe(false);
    expect(isValidIndianMobile('98123456789')).toBe(false); // 11 digits, no 0
    expect(isValidIndianMobile('')).toBe(false);
    expect(isValidIndianMobile('not a number')).toBe(false);
  });
});
