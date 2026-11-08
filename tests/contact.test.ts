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
function emailAt(index: number) {
  const [url, request] = vi.mocked(fetch).mock.calls[index];
  expect(url).toBe('https://api.resend.com/emails');
  return { request, message: JSON.parse(String(request?.body)) };
}

describe('contact notifications and acknowledgment', () => {
  it('awaits the internal message before sending the acknowledgment, then awaits both acceptances', async () => {
    let acceptInternal!: (response: Response) => void;
    let acceptAcknowledgment!: (response: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise(resolve => { acceptInternal = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { acceptAcknowledgment = resolve; }));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const value = { ...valid(), name: 'Jamie <Example>', email: ' JAMIE@EXAMPLE.COM ', subject: 'Care <script>alert(2)</script>', message: 'Please help with <script>alert(1)</script> care.' };
    let finished = false;
    const pending = post(value).then(response => { finished = true; return response; });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(finished).toBe(false);
    const internal = emailAt(0);
    expect(internal.request?.headers).toMatchObject({ Authorization: 'Bearer re_example', 'Idempotency-Key': `eitaware/contact/internal/${value.idempotencyKey}` });
    expect(internal.message).toMatchObject({
      from: 'EITAWARE <support@eitaware.com>', to: ['support@eitaware.com', 'msqware.official@gmail.com'],
      reply_to: 'jamie@example.com', subject: `EITAWARE contact: ${value.subject}`,
    });
    expect(internal.message.html).toContain('&lt;script&gt;');
    expect(internal.message.html).not.toContain('<script>');
    expect(internal.message.text).toContain(value.message);
    expect(internal.message.text).toContain(`Message reference: ${value.idempotencyKey}`);
    acceptInternal(Response.json({ id: 'internal-1' }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(finished).toBe(false);
    const acknowledgment = emailAt(1);
    expect(acknowledgment.request?.headers).toMatchObject({ Authorization: 'Bearer re_example', 'Idempotency-Key': `eitaware/contact/acknowledgment/${value.idempotencyKey}` });
    expect(acknowledgment.message).toMatchObject({
      from: 'EITAWARE <support@eitaware.com>', to: ['jamie@example.com'], reply_to: 'support@eitaware.com',
      subject: 'We’ve received your message — EITAWARE',
    });
    for (const content of [acknowledgment.message.text, acknowledgment.message.html]) {
      expect(content).toContain('Your contact request is confirmed');
      expect(content).toContain(value.idempotencyKey);
      expect(content).toContain('Our team will reply by email.');
      expect(content).not.toContain(value.message);
      expect(content).not.toMatch(/within|business days|24 hours|48 hours/);
    }
    expect(acknowledgment.message.text).toContain(value.subject);
    expect(acknowledgment.message.html).toContain('Jamie &lt;Example&gt;');
    expect(acknowledgment.message.html).toContain('Care &lt;script&gt;');
    expect(acknowledgment.message.html).not.toContain('<script>');
    expect(timeout.mock.calls).toEqual([[10_000], [10_000]]);
    acceptAcknowledgment(Response.json({ id: 'acknowledgment-1' }));
    const response = await pending;
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, reference: value.idempotencyKey, acknowledgmentSent: true });
  });

  it('keeps separate stable provider keys and bodies for concurrent retries', async () => {
    const value = valid();
    const responses = await Promise.all([post(value), post(value)]);
    expect(await responses[0].json()).toEqual(await responses[1].json());
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(4);
    for (const kind of ['internal', 'acknowledgment']) {
      const matching = calls.filter(([, request]) => new Headers(request?.headers).get('Idempotency-Key') === `eitaware/contact/${kind}/${value.idempotencyKey}`);
      expect(matching).toHaveLength(2);
      expect(matching[0][1]?.body).toBe(matching[1][1]?.body);
    }
  });

  it('reuses the internal notification key after an ambiguous failure, then attempts acknowledgment', async () => {
    const value = valid();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network unavailable'));
    expect((await post(value)).status).toBe(503);
    const response = await post(value);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ acknowledgmentSent: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(emailAt(0).request?.headers).toEqual(emailAt(1).request?.headers);
    expect(emailAt(0).request?.body).toBe(emailAt(1).request?.body);
  });

  it('returns a conflict for changed internal content without sending acknowledgment', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ name: 'invalid_idempotent_request' }, { status: 409 }));
    expect((await post(valid())).status).toBe(409);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([400, 401, 409, 429, 500])('reports internal HTTP %i as an error and skips acknowledgment', async status => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ name: 'provider_error' }, { status }));
    const response = await post(valid());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(env.RESEND_API_KEY);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([null, {}, { id: '' }, { id: 123 }])('does not acknowledge an ambiguous internal response %j', async body => {
    vi.mocked(fetch).mockResolvedValue(Response.json(body));
    expect((await post(valid())).status).toBe(503);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('handles malformed internal provider JSON without attempting acknowledgment', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('invalid JSON'));
    expect((await post(valid())).status).toBe(503);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('returns a retryable error after an internal timeout', async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));
    expect((await post(valid())).status).toBe(503);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([400, 401, 409, 429, 500])('confirms receipt with a notice flag when acknowledgment gets HTTP %i', async status => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ id: 'internal-1' })).mockResolvedValueOnce(Response.json({ name: 'provider_error' }, { status }));
    const value = valid();
    const response = await post(value);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, reference: value.idempotencyKey, acknowledgmentSent: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([null, {}, { id: '' }, { id: 123 }])('confirms receipt when acknowledgment acceptance is ambiguous: %j', async body => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ id: 'internal-1' })).mockResolvedValueOnce(Response.json(body));
    expect(await (await post(valid())).json()).toMatchObject({ accepted: true, acknowledgmentSent: false });
  });
  it('confirms receipt when acknowledgment times out without retrying in the background', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ id: 'internal-1' })).mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'));
    const response = await post(valid());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: true, acknowledgmentSent: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not lose the accepted message when acknowledgment has conflicting content', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ id: 'internal-1' })).mockResolvedValueOnce(Response.json({ name: 'invalid_idempotent_request' }, { status: 409 }));
    expect(await (await post(valid())).json()).toMatchObject({ accepted: true, acknowledgmentSent: false });
  });

  it('does not send when the secret is missing', async () => {
    expect((await post(valid(), { ...env, RESEND_API_KEY: undefined })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects invalid fields, sender/recipient overrides, and header injection before sending', async () => {
    const response = await post({ ...valid(), email: 'invalid', message: 'short' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ fields: { email: expect.any(String), message: expect.any(String) } });
    for (const overrides of [{ recipient: 'attacker@example.com' }, { from: 'attacker@example.com' }, { to: ['attacker@example.com'] }, { reply_to: 'attacker@example.com' }]) {
      expect((await post({ ...valid(), ...overrides })).status).toBe(400);
    }
    expect((await post({ ...valid(), subject: 'Help\r\nBCC: attacker@example.com' })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and oversized UTF-8 requests', async () => {
    expect((await app.fetch(new Request('http://localhost/api/contact', { method: 'POST', body: '{' }), env)).status).toBe(400);
    expect((await post({ ...valid(), message: 'a'.repeat(17_000) })).status).toBe(413);
    expect((await post({ ...valid(), message: '食'.repeat(6000) })).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('drops honeypot submissions and applies the edge rate limit without either email', async () => {
    const honey = await post({ ...valid(), website: 'spam.example.com' });
    expect(honey.status).toBe(202);
    expect(await honey.json()).toEqual({ accepted: true, reference: 'received' });
    const limit = vi.fn(async () => ({ success: false }));
    expect((await post(valid(), { ...env, RATE_LIMITER: { limit } })).status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: 'contact:192.0.2.1' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
