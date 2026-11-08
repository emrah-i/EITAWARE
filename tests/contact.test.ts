import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerContactRoutes } from '../src/server/contact';
import type { Env } from '../src/server/env';
import { createTestEnv } from './support/env';

const valid = () => ({
  name: 'Jamie Example', email: 'jamie@example.com', subject: 'Product care',
  message: 'Could you help with care instructions?', website: '', idempotencyKey: crypto.randomUUID(),
});
let app: Hono<{ Bindings: Env }>;
let env: Env;
beforeEach(() => {
  env = createTestEnv(); app = new Hono<{ Bindings: Env }>(); registerContactRoutes(app);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'email-1' })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function post(payload: unknown, bindings = env) {
  return app.fetch(new Request('http://localhost/api/contact', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(payload),
  }), bindings);
}

describe('direct contact emails', () => {
  it('awaits provider acceptance and sends escaped content to a fixed recipient without storage', async () => {
    let accept!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { accept = resolve; }));
    const value = { ...valid(), name: 'Jamie <Example>', message: 'Please help with <script>alert(1)</script> care.' };
    let finished = false;
    const pending = post(value).then(response => { finished = true; return response; });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    accept(Response.json({ id: 'email-1' }));
    const response = await pending;
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, reference: value.idempotencyKey });
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer re_example', 'Idempotency-Key': `eitaware/contact/${value.idempotencyKey}` });
    const email = JSON.parse(String(request?.body));
    expect(email).toMatchObject({ from: env.EMAIL_FROM, to: [env.SUPPORT_EMAIL], reply_to: value.email });
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<script>');
    expect(email.text).toContain(`Message reference: ${value.idempotencyKey}`);
  });

  it('reuses an identical provider key and body for concurrent retries', async () => {
    const value = valid();
    const responses = await Promise.all([post(value), post(value)]);
    expect(await responses[0].json()).toEqual(await responses[1].json());
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]?.headers).toEqual(calls[1][1]?.headers);
    expect(calls[0][1]?.body).toBe(calls[1][1]?.body);
  });

  it('returns a conflict for changed content reported by Resend', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ name: 'invalid_idempotent_request' }, { status: 409 }));
    expect((await post(valid())).status).toBe(409);
  });
  it.each([400, 401, 409, 429, 500])('reports a send failure for provider HTTP %i', async status => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ name: 'provider_error' }, { status }));
    const response = await post(valid());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(env.RESEND_API_KEY);
  });
  it.each([{}, { id: '' }, { id: 123 }])('does not claim success for ambiguous provider response %j', async body => {
    vi.mocked(fetch).mockResolvedValue(Response.json(body));
    expect((await post(valid())).status).toBe(503);
  });
  it('returns a retryable error after a timeout or network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));
    expect((await post(valid())).status).toBe(503);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not send when the secret is missing', async () => {
    expect((await post(valid(), { ...env, RESEND_API_KEY: undefined })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects invalid fields, recipient overrides, and header injection before sending', async () => {
    const response = await post({ ...valid(), email: 'invalid', message: 'short' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ fields: { email: expect.any(String), message: expect.any(String) } });
    expect((await post({ ...valid(), recipient: 'attacker@example.com' })).status).toBe(400);
    expect((await post({ ...valid(), subject: 'Help\r\nBCC: attacker@example.com' })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and oversized UTF-8 requests', async () => {
    expect((await app.fetch(new Request('http://localhost/api/contact', { method: 'POST', body: '{' }), env)).status).toBe(400);
    expect((await post({ ...valid(), message: 'a'.repeat(17_000) })).status).toBe(413);
    expect((await post({ ...valid(), message: '食'.repeat(6000) })).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('drops honeypot submissions and applies the edge rate limit without sending', async () => {
    expect((await post({ ...valid(), website: 'spam.example.com' })).status).toBe(202);
    const limit = vi.fn(async () => ({ success: false }));
    expect((await post(valid(), { ...env, RATE_LIMITER: { limit } })).status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: 'contact:192.0.2.1' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
