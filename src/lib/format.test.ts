import { formatMoney, formatMoneyExact, formatCountdown, formatPhone } from './format';

/**
 * These render money the customer is charged. The values themselves come from
 * the server — what is under test is only that they are displayed faithfully,
 * and in particular that a value arriving as a string is not concatenated.
 */
describe('formatMoney', () => {
  it('drops the decimals on whole rupees', () => {
    expect(formatMoney(62)).toBe('₹62');
  });

  it('keeps two decimals when there are paise', () => {
    expect(formatMoney(62.5)).toBe('₹62.50');
  });

  it('accepts a numeric string without concatenating it', () => {
    // The failure this guards against is "62" + "35" = "6235".
    expect(formatMoney('62')).toBe('₹62');
    expect(formatMoney('62.50')).toBe('₹62.50');
  });

  it('renders null, undefined and nonsense as zero rather than NaN', () => {
    expect(formatMoney(null)).toBe('₹0');
    expect(formatMoney(undefined)).toBe('₹0');
    expect(formatMoney('not a number')).toBe('₹0');
    expect(formatMoney(Number.NaN)).toBe('₹0');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('₹0');
  });

  it('always shows two decimals on a total', () => {
    expect(formatMoneyExact(105)).toBe('₹105.00');
  });
});

describe('formatCountdown', () => {
  it('counts minutes down', () => {
    expect(formatCountdown(8)).toBe('8 min');
    expect(formatCountdown(1)).toBe('1 min');
  });

  it('never shows a zero or negative countdown', () => {
    // A timer sitting on "0 min" while the rider is still coming reads as a
    // broken app.
    expect(formatCountdown(0)).toBe('Any moment now');
    expect(formatCountdown(-5)).toBe('Any moment now');
  });
});

describe('formatPhone', () => {
  it('spaces out an E.164 Indian number', () => {
    expect(formatPhone('+919812345678')).toBe('+91 98123 45678');
  });

  it('spaces out a bare ten-digit number', () => {
    expect(formatPhone('9812345678')).toBe('98123 45678');
  });

  it('returns anything unexpected untouched rather than mangling it', () => {
    expect(formatPhone('extension 4')).toBe('extension 4');
    expect(formatPhone('')).toBe('');
    expect(formatPhone(null)).toBe('');
  });
});
