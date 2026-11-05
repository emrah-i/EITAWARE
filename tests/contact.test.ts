import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerContactRoutes } from '../src/server/contact';
import type { Env, OutboxRow } from '../src/server/env';
import { createTestEnv } from './support/d1';

describe('contact submissions', () => {
  let fixture: ReturnType<typeof createTestEnv>;
  let app: Hono<{ Bindings: Env }>;
  let background: Promise<unknown>[];
  const valid = () => ({
    name: 'Jamie Example', email: 'jamie@example.com', subject: 'Product care',
    message: 'Could you help with care instructions?', website: '', idempotencyKey: crypto.randomUUID(),
  });
  beforeEach(() => {
    fixture = createTestEnv(); background = [];
    app = new Hono<{ Bindings: Env }>(); registerContactRoutes(app);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'email-1' }), { status: 200 })));
  });
  afterEach(async () => {
    await Promise.allSettled(background); fixture.db.close(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  function post(payload: unknown, env = fixture.env): Promise<Response> {
    return app.fetch(new Request('http://localhost/api/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(payload),
    }), env, { waitUntil: (promise: Promise<unknown>) => background.push(promise), passThroughOnException() {} } as unknown as ExecutionContext) as Promise<Response>;
  }
  async function count(table: string): Promise<number> {
    return (await fixture.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())!.count;
  }

  it('durably stores a message with one escaped fixed-recipient notification', async () => {
    const response = await post({ ...valid(), name: 'Jamie <Example>', message: 'Please help with <script>alert(1)</script> care.' });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: true });
    await Promise.all(background);
    expect(await count('contact_messages')).toBe(1);
    const message = await fixture.db.prepare('SELECT * FROM email_outbox').first<OutboxRow>();
    expect(message).toMatchObject({ recipient: fixture.env.SUPPORT_EMAIL, reply_to: 'jamie@example.com', kind: 'contact', status: 'sent' });
    expect(message!.html).toContain('&lt;script&gt;');
    expect(message!.html).not.toContain('<script>');
  });

  it('deduplicates concurrent retries and rejects changed content for the same key', async () => {
    const value = valid();
    const responses = await Promise.all([post(value), post(value)]);
    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    const accepted = await Promise.all(responses.map((response) => response.json()));
    expect(accepted[0]).toEqual(accepted[1]);
    expect(await count('contact_messages')).toBe(1);
    expect(await count('email_outbox')).toBe(1);
    const changed = await post({ ...value, message: 'This is a different request now.' });
    expect(changed.status).toBe(409);
    expect(await count('contact_messages')).toBe(1);
  });

  it('rejects invalid and unexpected fields without storing a message', async () => {
    const invalid = await post({ ...valid(), email: 'not-email', message: 'short' });
    expect(invalid.status).toBe(400);
    const body = await invalid.json() as { fields: Record<string, string> };
    expect(Object.keys(body.fields)).toEqual(expect.arrayContaining(['email', 'message']));
    expect((await post({ ...valid(), recipient: 'attacker@example.com' })).status).toBe(400);
    expect((await post({ ...valid(), subject: 'Help\r\nBCC: attacker@example.com' })).status).toBe(400);
    expect(await count('contact_messages')).toBe(0);
  });

  it('does not accept new messages when email is unconfigured', async () => {
    const response = await post(valid(), { ...fixture.env, EMAIL_READY: 'false' });
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('support@eitaware.com');
    expect(await count('contact_messages')).toBe(0);
  });

  it('rolls back the message when the notification cannot be persisted', async () => {
    await fixture.db.exec("CREATE TRIGGER reject_mail BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;");
    const response = await post(valid());
    expect(response.status).toBe(503);
    expect(await count('contact_messages')).toBe(0);
    expect(await count('email_outbox')).toBe(0);
  });

  it('accepts persisted messages even if delivery needs a later retry', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network unavailable'));
    const response = await post(valid());
    expect(response.status).toBe(202);
    await Promise.all(background);
    expect(await count('contact_messages')).toBe(1);
    const message = await fixture.db.prepare('SELECT * FROM email_outbox').first<OutboxRow>();
    expect(message).toMatchObject({ status: 'pending', attempts: 1 });
  });

  it('drops honeypot submissions and limits requests using the trusted edge IP', async () => {
    expect((await post({ ...valid(), website: 'spam.example.com' })).status).toBe(202);
    expect(await count('contact_messages')).toBe(0);
    const limit = vi.fn(async () => ({ success: false }));
    expect((await post(valid(), { ...fixture.env, RATE_LIMITER: { limit } })).status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: 'contact:192.0.2.1' });
    expect(await count('contact_messages')).toBe(0);
  });

  it('rejects oversized requests before message storage', async () => {
    expect((await post({ ...valid(), message: 'a'.repeat(17_000) })).status).toBe(413);
    expect(await count('contact_messages')).toBe(0);
  });
});
