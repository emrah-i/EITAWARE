import type { ContactRequest } from '../shared/types';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string; fields: Record<string, string> };
type RecordValue = Record<string, unknown>;
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
