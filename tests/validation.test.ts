import { describe, expect, it } from 'vitest';
import { hashValue, validateCheckout, validateContact } from '../src/server/validation';
import { DEFAULT_PRODUCT_ID } from '../src/shared/catalog';

const address = { line1: '123 Main Street', line2: '', city: 'Baltimore', state: 'MD', postalCode: '21201', country: 'US' };
const checkout = { name: 'Ada Example', email: 'ada@example.com', quantity: 1, address, idempotencyKey: '5ca90e42-9b6f-4d2d-bb0f-e23fb60422fe' };

describe('checkout validation', () => {
  it('normalizes legacy requests to the historical product and accepts explicit identity', () => {
    expect(validateCheckout(checkout)).toMatchObject({ ok: true, value: { productId: DEFAULT_PRODUCT_ID } });
    expect(validateCheckout({ ...checkout, productId: 'another-product' })).toMatchObject({ ok: true, value: { productId: 'another-product' } });
  });
  it.each(['', 'Unknown Product', '../secret', null, 123])('rejects malformed product identity %s', productId => {
    expect(validateCheckout({ ...checkout, productId }).ok).toBe(false);
  });
  it('normalizes an eligible delivery snapshot and removes empty optional fields', () => {
    const result = validateCheckout({ ...checkout, name: '  Ada  Example ', email: ' ADA@EXAMPLE.COM ', address: { ...address, state: 'md' } });
    expect(result).toMatchObject({ ok: true, value: { name: 'Ada Example', email: 'ada@example.com', address: { state: 'MD' } } });
    if (result.ok) expect(result.value.address).not.toHaveProperty('line2');
  });
  it.each(['priceCents', 'sku', 'currency', 'coupon'])('rejects client-controlled %s', key => {
    expect(validateCheckout({ ...checkout, [key]: 'tampered' })).toMatchObject({ ok: false, fields: { [key]: expect.any(String) } });
  });
  it.each([0, 11, -1, 1.5, '1', NaN])('rejects invalid quantity %s', quantity => {
    expect(validateCheckout({ ...checkout, quantity }).ok).toBe(false);
  });
  it.each(['AK', 'HI', 'PR', 'GU', 'AA', 'AE', 'AP', ''])('rejects unsupported state %s', state => {
    expect(validateCheckout({ ...checkout, address: { ...address, state } }).ok).toBe(false);
  });
  it.each(['99501', '96813', '96910', '00901', '09012', '34001'])('rejects unsupported ZIP %s even with an eligible state', postalCode => {
    expect(validateCheckout({ ...checkout, address: { ...address, postalCode } }).ok).toBe(false);
  });
  it.each([['DC', '20001'], ['OR', '97201'], ['WA', '98101'], ['ME', '04101']])('accepts %s shipping', (state, postalCode) => {
    expect(validateCheckout({ ...checkout, address: { ...address, state, postalCode } }).ok).toBe(true);
  });
  it('allows a PO box and ZIP+4 within the supported region', () => {
    expect(validateCheckout({ ...checkout, address: { ...address, line1: 'PO Box 123', postalCode: '21201-1234' } }).ok).toBe(true);
  });
  it.each([null, [], 'checkout', {}, { ...checkout, idempotencyKey: 'predictable' }, { ...checkout, website: 'https://spam.test' }])('rejects malformed or bot requests', value => {
    expect(validateCheckout(value).ok).toBe(false);
  });
  it('rejects unknown nested fields and header-injection characters', () => {
    expect(validateCheckout({ ...checkout, address: { ...address, price: 1 } }).ok).toBe(false);
    expect(validateCheckout({ ...checkout, name: 'Ada\r\nBcc: attacker@example.com' }).ok).toBe(false);
  });
});

describe('contact validation and request hashing', () => {
  const contact = { name: checkout.name, email: checkout.email, idempotencyKey: checkout.idempotencyKey, subject: 'Order question', message: 'Hello, I have a question about this dinnerware set.' };
  it('preserves message newlines while normalizing carriage returns', () => {
    expect(validateContact({ ...contact, message: 'Hello there,\r\nI have a question.' })).toMatchObject({ ok: true, value: { message: 'Hello there,\nI have a question.' } });
  });
  it('rejects unknown recipient fields, short messages, invalid email and control characters', () => {
    expect(validateContact({ ...contact, recipient: 'attacker@example.com' }).ok).toBe(false);
    expect(validateContact({ ...contact, message: 'Hi' }).ok).toBe(false);
    expect(validateContact({ ...contact, email: 'invalid' }).ok).toBe(false);
    expect(validateContact({ ...contact, message: 'A valid length\u0000message' }).ok).toBe(false);
  });
  it('hashes content consistently independent of object key order', async () => {
    expect(await hashValue({ b: 2, a: { d: 4, c: 3 } })).toBe(await hashValue({ a: { c: 3, d: 4 }, b: 2 }));
    expect(await hashValue({ a: 1 })).not.toBe(await hashValue({ a: 2 }));
  });
});
