import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildOrderEmail, flushOutbox, prepareOutboxInsert } from '../src/server/notifications';
import type { OutboxRow } from '../src/server/env';
import { createTestEnv } from './support/d1';

describe('durable notification outbox', () => {
  let fixture: ReturnType<typeof createTestEnv>;
  let now: number;
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fixture = createTestEnv(); now = 1_800_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now * 1000);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }));
  });
  afterEach(() => { fixture.db.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function insert(id = 'contact:test') {
    await prepareOutboxInsert(fixture.env, {
      id, kind: 'contact', recipient: fixture.env.SUPPORT_EMAIL, subject: 'Question',
      text: 'Question about my dinnerware', html: '<p>Question about my dinnerware</p>', replyTo: 'buyer@example.com',
    }, now).run();
  }
  const row = (id = 'contact:test') => fixture.db.prepare('SELECT * FROM email_outbox WHERE id = ?').bind(id).first<OutboxRow>();

  it('claims a message once across concurrent dispatchers and fixes the recipient', async () => {
    await insert();
    let release!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const first = flushOutbox(fixture.env);
    const second = flushOutbox(fixture.env);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    release(new Response(JSON.stringify({ id: 'email-claimed' }), { status: 200 }));
    await Promise.all([first, second]);
    expect(await row()).toMatchObject({ status: 'sent', attempts: 1, provider_id: 'email-claimed', lease_token: null });
    const request = fetchMock.mock.calls[0][1]!;
    const body = JSON.parse(request.body as string);
    expect(body.to).toEqual([fixture.env.SUPPORT_EMAIL]);
    expect(body.from).toBe(fixture.env.EMAIL_FROM);
    expect(body.reply_to).toBe('buyer@example.com');
    await flushOutbox(fixture.env);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries ambiguous delivery with backoff and the same provider idempotency key', async () => {
    await insert();
    fetchMock.mockRejectedValueOnce(new Error('connection lost'));
    await flushOutbox(fixture.env);
    expect(await row()).toMatchObject({ status: 'pending', attempts: 1, next_attempt_at: now + 60, first_attempt_at: now });
    await flushOutbox(fixture.env);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 60;
    await flushOutbox(fixture.env);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>)['Idempotency-Key'])
      .toBe((fetchMock.mock.calls[1][1]!.headers as Record<string, string>)['Idempotency-Key']);
    expect(await row()).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('recovers an expired lease after a Worker stops', async () => {
    await insert();
    await fixture.db.prepare("UPDATE email_outbox SET status = 'sending', attempts = 1, first_attempt_at = ?, lease_until = ?, lease_token = 'terminated' WHERE id = ?")
      .bind(now - 200, now - 1, 'contact:test').run();
    await flushOutbox(fixture.env);
    expect(await row()).toMatchObject({ status: 'sent', attempts: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops before provider idempotency protection expires', async () => {
    await insert();
    await fixture.db.prepare('UPDATE email_outbox SET attempts = 1, first_attempt_at = ? WHERE id = ?')
      .bind(now - 23 * 60 * 60, 'contact:test').run();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await flushOutbox(fixture.env);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await row()).toMatchObject({ status: 'needs_review', last_error: 'retry_limit_reached' });
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain('buyer@example.com');
  });

  it('bounds repeated temporary failures and preserves messages for review', async () => {
    await insert();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
    for (let attempt = 0; attempt < 8; attempt++) {
      await flushOutbox(fixture.env);
      const current = (await row())!;
      now = current.next_attempt_at;
    }
    expect(await row()).toMatchObject({ status: 'needs_review', attempts: 8, last_error: 'provider_http_503' });
    await flushOutbox(fixture.env);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('does not send when email is unconfigured or to a non-owner recipient', async () => {
    await insert();
    await flushOutbox({ ...fixture.env, EMAIL_READY: 'false' });
    expect(await row()).toMatchObject({ status: 'pending', attempts: 0 });
    await fixture.db.prepare('UPDATE email_outbox SET recipient = ?').bind('attacker@example.com').run();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await flushOutbox(fixture.env);
    expect(await row()).toMatchObject({ status: 'needs_review', last_error: 'recipient_not_allowed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only inserts a fulfillment message while its source order is paid', async () => {
    await fixture.db.exec(`INSERT INTO orders
      (id, reference, idempotency_key, request_hash, quantity, unit_price_cents, currency,
       email, name, address_json, mcf_sku, status, created_at)
      VALUES ('order-1', 'EITA-001', 'order-key', 'hash', 1, 7999, 'usd',
       'buyer@example.com', 'Buyer', '{}', 'blue-12', 'pending', 1800000000)`);
    const message = {
      id: 'order:order-1', kind: 'order' as const, recipient: fixture.env.ORDER_EMAIL,
      subject: 'Order', html: '<p>Order</p>', text: 'Order', onlyIfPaidOrderId: 'order-1',
    };
    await prepareOutboxInsert(fixture.env, message, now).run();
    expect(await row(message.id)).toBeNull();
    await fixture.db.prepare("UPDATE orders SET status = 'paid' WHERE id = 'order-1'").run();
    await prepareOutboxInsert(fixture.env, message, now).run();
    expect(await row(message.id)).toMatchObject({ status: 'pending', kind: 'order' });
    await fixture.db.prepare("UPDATE orders SET status = 'refunded' WHERE id = 'order-1'").run();
    await prepareOutboxInsert(fixture.env, { ...message, id: 'order:late-duplicate' }, now).run();
    expect(await row('order:late-duplicate')).toBeNull();
  });

  it.each(['refunded', 'partially_refunded'])('suppresses a retry when an order becomes %s during an ambiguous send', async (refundStatus) => {
    await fixture.db.exec(`INSERT INTO orders
      (id, reference, idempotency_key, request_hash, quantity, unit_price_cents, currency,
       email, name, address_json, mcf_sku, status, created_at)
      VALUES ('order-1', 'EITA-001', 'order-key', 'hash', 1, 7999, 'usd',
       'buyer@example.com', 'Buyer', '{}', 'blue-12', 'paid', 1800000000)`);
    await prepareOutboxInsert(fixture.env, {
      id: 'order:order-1', kind: 'order', recipient: fixture.env.ORDER_EMAIL,
      subject: 'Order', html: '<p>Order</p>', text: 'Order', onlyIfPaidOrderId: 'order-1',
    }, now).run();
    fetchMock.mockImplementationOnce(async () => {
      expect(await row('order:order-1')).toMatchObject({ status: 'sending' });
      await fixture.db.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(refundStatus, 'order-1').run();
      // The refund handler cannot suppress this actively leased message.
      await fixture.db.prepare("UPDATE email_outbox SET status = 'suppressed' WHERE id = ? AND status = 'pending'")
        .bind('order:order-1').run();
      throw new Error('provider result unknown');
    });
    await flushOutbox(fixture.env);
    expect(await row('order:order-1')).toMatchObject({ status: 'pending', attempts: 1 });
    now += 60;
    await flushOutbox(fixture.env);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await row('order:order-1')).toMatchObject({ status: 'suppressed', last_error: 'payment_refunded', lease_token: null });
  });

  it('requires operator review for an order alert without its source order', async () => {
    await prepareOutboxInsert(fixture.env, {
      id: 'order:missing', kind: 'order', recipient: fixture.env.ORDER_EMAIL,
      subject: 'Order', html: '<p>Order</p>', text: 'Order',
    }, now).run();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await flushOutbox(fixture.env);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await row('order:missing')).toMatchObject({ status: 'needs_review', last_error: 'order_association_missing', lease_token: null });
  });

  it('escapes buyer content in the manual fulfillment message', () => {
    const email = buildOrderEmail({
      id: 'order-1', reference: 'EITA-001', quantity: 2, unit_price_cents: 7999, total_cents: 16998,
      product_id: 'test-plates', product_title: 'Snapshot <Plates>', product_subtitle: 'Two places', product_image: '/images/snapshot.webp', product_asin: 'B0TEST12345',
      tax_cents: 1000, currency: 'usd', email: 'buyer@example.com', name: '<script>alert(1)</script>',
      mcf_sku: 'blue-12', stripe_payment_intent_id: 'pi_123', stripe_session_id: 'cs_test_123',
      address_json: JSON.stringify({ line1: '1 Main St', line2: 'Apt <2>', city: 'Baltimore', state: 'MD', postalCode: '21201', country: 'US' }),
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('Apt &lt;2&gt;');
    expect(email.text).toContain('MCF seller SKU: blue-12');
    expect(email.text).toContain('Total paid: $169.98');
    expect(email.text).toContain('fulfill this order only once');
    expect(email.text).toContain('Product: EITAWARE Snapshot <Plates>');
    expect(email.html).toContain('Snapshot &lt;Plates&gt;');
    expect(email.text).toContain('ASIN: B0TEST12345');
  });
});
