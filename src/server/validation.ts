import { DEFAULT_PRODUCT_ID, findProduct, SHIPPING_STATES } from '../shared/catalog';
import type { CheckoutRequest, ContactRequest, DeliveryAddress } from '../shared/types';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string; fields: Record<string, string> };
type RecordValue = Record<string, unknown>;
const states = new Set<string>(SHIPPING_STATES);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const controls = /[\u0000-\u001f\u007f]/;
const emailPattern = /^[^\s@<>"(),;:\\[\]]+@[^\s@<>"(),;:\\[\]]+\.[^\s@<>"(),;:\\[\]]+$/;

function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function clean(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
}
export function normalizeEmail(value: string): string { return value.trim().normalize('NFC').toLowerCase(); }
function unknownFields(value: RecordValue, allowed: string[], fields: Record<string, string>, prefix = ''): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fields[`${prefix}${key}`] = 'This field is not accepted.';
}
function textField(value: unknown, key: string, fields: Record<string, string>, min: number, max: number): string {
  const result = clean(value);
  if (typeof value !== 'string' || controls.test(value) || result.length < min || result.length > max) {
    fields[key] = `Enter between ${min} and ${max} characters.`;
  }
  return result;
}
function common(value: RecordValue, fields: Record<string, string>) {
  const name = textField(value.name, 'name', fields, 2, 100);
  const email = typeof value.email === 'string' ? normalizeEmail(value.email) : '';
  if (email.length > 254 || !emailPattern.test(email) || controls.test(email)) fields.email = 'Enter a valid email address.';
  const idempotencyKey = typeof value.idempotencyKey === 'string' ? value.idempotencyKey.toLowerCase() : '';
  if (!uuidPattern.test(idempotencyKey)) fields.idempotencyKey = 'Refresh the page and try again.';
  if (value.website !== undefined && (typeof value.website !== 'string' || value.website.trim() !== '')) fields.website = 'Unable to process this request.';
  return { name, email, idempotencyKey };
}
function failure<T>(fields: Record<string, string>): ValidationResult<T> {
  return { ok: false, error: 'Please check the highlighted fields.', fields };
}

export function validateCheckout(value: unknown): ValidationResult<CheckoutRequest> {
  const fields: Record<string, string> = {};
  if (!record(value)) return failure({ form: 'Send a valid checkout form.' });
  unknownFields(value, ['productId', 'quantity', 'email', 'name', 'address', 'idempotencyKey', 'website'], fields);
  const base = common(value, fields);
  const productId = value.productId === undefined ? DEFAULT_PRODUCT_ID : typeof value.productId === 'string' ? value.productId : '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productId) || productId.length > 120) fields.productId = 'Choose a valid product.';
  const maxQuantity = findProduct(productId)?.maxQuantity ?? 10;
  if (!Number.isInteger(value.quantity) || (value.quantity as number) < 1 || (value.quantity as number) > maxQuantity) {
    fields.quantity = `Choose between 1 and ${maxQuantity} items.`;
  }
  const address: DeliveryAddress = { line1: '', city: '', state: '', postalCode: '', country: 'US' };
  if (!record(value.address)) {
    fields.address = 'Enter your complete delivery address.';
  } else {
    const source = value.address;
    unknownFields(source, ['line1', 'line2', 'city', 'state', 'postalCode', 'country'], fields, 'address.');
    address.line1 = textField(source.line1, 'address.line1', fields, 3, 200);
    if (source.line2 !== undefined) {
      address.line2 = textField(source.line2, 'address.line2', fields, 0, 200);
      if (!address.line2) delete address.line2;
    }
    address.city = textField(source.city, 'address.city', fields, 1, 100);
    address.state = typeof source.state === 'string' ? source.state.trim().toUpperCase() : '';
    if (!states.has(address.state)) fields['address.state'] = 'We deliver to the lower 48 states and Washington, D.C.';
    if (source.country !== 'US') fields['address.country'] = 'Delivery is available within the lower 48 states and Washington, D.C.';
    address.postalCode = typeof source.postalCode === 'string' ? source.postalCode.trim() : '';
    if (!/^\d{5}(?:-\d{4})?$/.test(address.postalCode)) {
      fields['address.postalCode'] = 'Enter a five-digit ZIP code, with an optional four-digit extension.';
    } else {
      // Reject out-of-area ZIPs even when the submitted state is disguised as an eligible state.
      const zip = Number(address.postalCode.slice(0, 5));
      if ((zip < 1000 && zip !== 501 && zip !== 544) || (zip >= 9000 && zip <= 9999) || (zip >= 34000 && zip <= 34099) || (zip >= 96200 && zip <= 96999) || zip >= 99500) {
        fields['address.postalCode'] = 'Enter a delivery ZIP code in the lower 48 states or Washington, D.C.';
      }
    }
  }
  if (Object.keys(fields).length) return failure(fields);
  return { ok: true, value: { ...base, productId, quantity: value.quantity as number, address } };
}

export function validateContact(value: unknown): ValidationResult<ContactRequest> {
  const fields: Record<string, string> = {};
  if (!record(value)) return failure({ form: 'Send a valid contact form.' });
  unknownFields(value, ['name', 'email', 'subject', 'message', 'idempotencyKey', 'website'], fields);
  const base = common(value, fields);
  const subject = textField(value.subject, 'subject', fields, 2, 150);
  const message = typeof value.message === 'string' ? value.message.normalize('NFC').replace(/\r\n?/g, '\n').trim() : '';
  if (typeof value.message !== 'string' || message.length < 10 || message.length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) {
    fields.message = 'Enter a message between 10 and 5,000 characters.';
  }
  if (Object.keys(fields).length) return failure(fields);
  return { ok: true, value: { ...base, subject, message } };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export async function hashValue(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stable(value))));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
