import { describe, expect, it } from 'vitest';
import { validateContact } from '../src/server/validation';

const contact = { name: 'Ada Example', email: 'ada@example.com', idempotencyKey: '5ca90e42-9b6f-4d2d-bb0f-e23fb60422fe', subject: 'Order question', message: 'Hello, I have a question about this dinnerware set.' };
describe('contact validation', () => {
  it('normalizes name and email and preserves message newlines', () => {
    expect(validateContact({ ...contact, name: '  Ada  Example ', email: ' ADA@EXAMPLE.COM ', message: 'Hello there,\r\nI have a question.' })).toMatchObject({ ok: true, value: { name: 'Ada Example', email: 'ada@example.com', message: 'Hello there,\nI have a question.' } });
  });
  it.each([null, [], 'contact', {}, { ...contact, idempotencyKey: 'predictable' }, { ...contact, website: 'spam.example.com' }])('rejects malformed requests %j', value => {
    expect(validateContact(value).ok).toBe(false);
  });
  it('rejects unknown recipients, short messages, invalid email and control characters', () => {
    expect(validateContact({ ...contact, recipient: 'attacker@example.com' }).ok).toBe(false);
    expect(validateContact({ ...contact, message: 'Hi' }).ok).toBe(false);
    expect(validateContact({ ...contact, email: 'invalid' }).ok).toBe(false);
    expect(validateContact({ ...contact, message: 'A valid length\u0000message' }).ok).toBe(false);
    expect(validateContact({ ...contact, name: 'Ada\r\nBcc: attacker@example.com' }).ok).toBe(false);
  });
});
