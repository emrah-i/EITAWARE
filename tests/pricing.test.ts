import { describe, expect, it } from 'vitest';
import { PRODUCT, money, storePrice } from '../src/shared/catalog';

describe('retail price presentation', () => {
  it('uses the approved $99.99 price from the actual featured product', () => {
    expect(PRODUCT.priceCents).toBe(9999);
    expect(PRODUCT.currency).toBe('usd');
    expect(storePrice(PRODUCT.priceCents!)).toBe('$99.99');
  });

  it('preserves the current price and selected quantity subtotal', () => {
    expect(storePrice(9999)).toBe('$99.99');
    expect(storePrice(9999 * 2)).toBe('$199.98');
  });

  it('omits zero cents for whole-dollar marketing prices', () => {
    expect(storePrice(9900)).toBe('$99');
    expect(storePrice(9900 * 2)).toBe('$198');
  });

  it.each([
    [9901, '$99.01'], [9990, '$99.90'], [9950, '$99.50'], [10025, '$100.25'],
  ])('preserves nonzero cents for a marketing price of %i cents', (cents, display) => {
    expect(storePrice(cents)).toBe(display);
  });

  it('retains two decimal places for receipts and order totals', () => {
    expect(money(9999)).toBe('$99.99');
    expect(money(9999 * 2)).toBe('$199.98');
    // Historical amounts retain their original presentation.
    expect(money(9900)).toBe('$99.00');
    expect(money(9900 * 2)).toBe('$198.00');
    expect(money(9990)).toBe('$99.90');
  });
});
