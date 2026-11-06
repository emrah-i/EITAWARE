import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkoutAvailable, FULFILLMENT_SKUS, registerCheckoutRoutes, type OrderRow } from '../src/server/checkout';
import type { Env } from '../src/server/env';
import { CATALOG, DEFAULT_PRODUCT_ID, findProduct, type CatalogProduct } from '../src/shared/catalog';
import { hashValue } from '../src/server/validation';
import { createTestEnv, TestD1 } from './support/d1';

const webhookSecret = 'whsec_test_checkout_secret';
const checkout = { productId: DEFAULT_PRODUCT_ID, name: 'Ada Example', email: 'ada@example.com', quantity: 2, address: { line1: '123 Main Street', city: 'Baltimore', state: 'MD', postalCode: '21201', country: 'US' }, idempotencyKey: '5ca90e42-9b6f-4d2d-bb0f-e23fb60422fe' };
const defaultTemplate = structuredClone(findProduct(DEFAULT_PRODUCT_ID)!);
const defaultPrice = defaultTemplate.priceCents!;
const originalProducts = [...CATALOG.products];
const originalSnapshots = originalProducts.map(product => structuredClone(product));
const originalFulfillment = { ...FULFILLMENT_SKUS };
function addProduct(id: string, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  const product = { ...structuredClone(defaultTemplate), id, slug: id, title: 'Green Dinnerware', subtitle: 'Two green place settings', priceCents: 12999, maxQuantity: 2, ...overrides };
  CATALOG.products.push(product);
  return product;
}
let env: Env;
let db: TestD1;
let app: Hono<{ Bindings: Env }>;
let remoteCalls: { url: string; method: string; body: URLSearchParams; idempotencyKey: string | null }[];
let sessionOverride: Record<string, unknown>;
let refunded: boolean;
let waitUntil: Promise<unknown>[];
const ctx = { waitUntil(promise: Promise<unknown>) { waitUntil.push(promise); }, passThroughOnException() {} };

async function paymentIntent() {
  const order = await db.prepare('SELECT * FROM orders LIMIT 1').first<OrderRow>();
  if (!order) throw new Error('Test expected an order');
  return { id: 'pi_order123', object: 'payment_intent', status: 'succeeded', amount: order.unit_price_cents * order.quantity, currency: 'usd', customer: 'cus_order123', metadata: { order_id: order.id }, latest_charge: { id: 'ch_order123', refunded, amount_refunded: refunded ? order.unit_price_cents * order.quantity : 0 } };
}

async function paidSession() {
  const order = await db.prepare('SELECT * FROM orders LIMIT 1').first<OrderRow>();
  if (!order) throw new Error('Test expected a pending order');
  const subtotal = order.unit_price_cents * order.quantity;
  return {
    id: 'cs_test_session123', object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid', livemode: false,
    customer: 'cus_order123', payment_intent: await paymentIntent(), client_reference_id: order.id,
    metadata: { order_id: order.id, product_id: order.product_id }, currency: 'usd', amount_subtotal: subtotal, amount_total: subtotal,
    total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 },
    line_items: { has_more: false, data: [{ quantity: order.quantity, amount_subtotal: subtotal, price: { unit_amount: order.unit_price_cents, currency: 'usd', product: { id: 'prod_order123', metadata: { product_id: order.product_id } } } }] },
    ...sessionOverride,
  };
}
function jsonResponse(body: unknown) { return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }); }
function request(path: string, body?: unknown) {
  return app.fetch(new Request(`https://eitaware.com${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, ctx as ExecutionContext);
}
async function start() {
  const response = await request('/api/checkout/session', checkout);
  expect(response.status).toBe(200);
  return response;
}
async function webhook(type = 'checkout.session.completed', overrides: Record<string, unknown> = {}, eventId = 'evt_paid123') {
  const payload = JSON.stringify({ id: eventId, object: 'event', created: Math.floor(Date.now() / 1000), livemode: false, type,
    data: { object: { id: 'cs_test_session123', payment_status: 'paid', ...overrides } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const signature = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return app.fetch(new Request('https://eitaware.com/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: payload }), env, ctx as ExecutionContext);
}

beforeEach(() => {
  ({ env, db } = createTestEnv({ SITE_URL: 'https://eitaware.com', STRIPE_SECRET_KEY: 'sk_test_checkout_key', STRIPE_WEBHOOK_SECRET: webhookSecret, EMAIL_READY: 'false', TAX_READY: 'false' }));
  app = new Hono<{ Bindings: Env }>();
  registerCheckoutRoutes(app);
  remoteCalls = []; sessionOverride = {}; waitUntil = []; refunded = false;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : String(init?.body ?? ''));
    remoteCalls.push({ url, method: init?.method ?? 'GET', body, idempotencyKey: new Headers(init?.headers).get('Idempotency-Key') });
    if (url.endsWith('/v1/customers')) return jsonResponse({ id: 'cus_order123', object: 'customer' });
    if (url.endsWith('/v1/checkout/sessions')) return jsonResponse({ id: 'cs_test_session123', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_test_session123', livemode: false, expires_at: Math.floor(Date.now() / 1000) + 86400 });
    if (url.includes('/v1/checkout/sessions/cs_test_session123')) return jsonResponse(await paidSession());
    if (url.includes('/v1/payment_intents/pi_order123')) return jsonResponse(await paymentIntent());
    throw new Error(`Unexpected network request: ${url}`);
  }));
});
afterEach(async () => {
  await Promise.all(waitUntil); db.close(); vi.unstubAllGlobals();
  CATALOG.products.splice(0, CATALOG.products.length, ...originalProducts);
  originalProducts.forEach((product, index) => Object.assign(product, structuredClone(originalSnapshots[index])));
  for (const key of Object.keys(FULFILLMENT_SKUS)) delete FULFILLMENT_SKUS[key];
  Object.assign(FULFILLMENT_SKUS, originalFulfillment);
});

describe('checkout sessions', () => {
  it.each([1, 2])('charges exactly $79.99 per current-product unit for a fresh quantity-%s checkout', async quantity => {
    const response = await request('/api/checkout/session', { ...checkout, quantity, idempotencyKey: crypto.randomUUID() });
    expect(response.status).toBe(200);
    const session = remoteCalls.find(call => call.url.endsWith('/checkout/sessions'))!;
    expect(session.body.get('line_items[0][price_data][unit_amount]')).toBe('7999');
    expect(session.body.get('line_items[0][price_data][currency]')).toBe('usd');
    expect(session.body.get('line_items[0][quantity]')).toBe(String(quantity));
    expect(Number(session.body.get('line_items[0][price_data][unit_amount]')) * Number(session.body.get('line_items[0][quantity]'))).toBe(quantity === 1 ? 7999 : 15998);
    expect((await db.prepare('SELECT * FROM orders LIMIT 1').first<OrderRow>())?.unit_price_cents).toBe(7999);
  });
  it('creates server-priced hosted checkout with immutable customer and payment shipping', async () => {
    const response = await start();
    expect(await response.json()).toEqual({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_session123' });
    const customer = remoteCalls.find(call => call.url.endsWith('/customers'))!;
    const session = remoteCalls.find(call => call.url.endsWith('/checkout/sessions'))!;
    expect(customer.body.get('shipping[address][state]')).toBe('MD');
    expect(session.body.get('line_items[0][price_data][unit_amount]')).toBe(String(defaultPrice));
    expect(session.body.get('line_items[0][quantity]')).toBe('2');
    expect(session.body.get('payment_intent_data[shipping][address][postal_code]')).toBe('21201');
    expect(session.body.get('allowed_payment_method_types[0]')).toBe('card');
    expect(session.body.get('success_url')).toBe('https://eitaware.com/order-confirmation?session_id={CHECKOUT_SESSION_ID}');
    expect([...session.body.keys()].some(key => key.startsWith('shipping_address_collection') || key.startsWith('allow_promotion_codes'))).toBe(false);
  });
  it('returns the same stored session for a network retry and rejects changed details', async () => {
    await start(); await start();
    expect(remoteCalls.filter(call => call.url.endsWith('/checkout/sessions'))).toHaveLength(1);
    const changed = await request('/api/checkout/session', { ...checkout, quantity: 3 });
    expect(changed.status).toBe(409);
    expect((await db.prepare('SELECT COUNT(*) AS count FROM orders').first<{ count: number }>())?.count).toBe(1);
  });
  it.each([{ price: 9999, hasStoredUrl: true }, { price: 9999, hasStoredUrl: false }, { price: 9900, hasStoredUrl: true }, { price: 9900, hasStoredUrl: false }])('rejects an old-price $price-cent pending order with stored URL=$hasStoredUrl before making any Stripe call', async ({ price, hasStoredUrl }) => {
    await start();
    await db.prepare(`UPDATE orders SET unit_price_cents = ${price}${hasStoredUrl ? '' : ', stripe_session_id = NULL, stripe_session_url = NULL, stripe_customer_id = NULL, expires_at = NULL'}`).run();
    remoteCalls.length = 0;
    const response = await request('/api/checkout/session', checkout);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'checkout_expired' });
    expect(remoteCalls).toHaveLength(0);
    expect(await db.prepare('SELECT unit_price_cents, status FROM orders LIMIT 1').first()).toMatchObject({ unit_price_cents: price, status: 'pending' });
  });
  it('rejects a pending order whose snapshot currency differs from the current product', async () => {
    await start();
    await db.prepare("UPDATE orders SET currency = 'eur'").run();
    remoteCalls.length = 0;
    const response = await request('/api/checkout/session', checkout);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'checkout_expired' });
    expect(remoteCalls).toHaveLength(0);
  });
  it('creates a new $79.99 order with a fresh key after rejecting a stale price', async () => {
    await start(); await db.prepare('UPDATE orders SET unit_price_cents = 9999').run();
    expect((await request('/api/checkout/session', checkout)).status).toBe(409);
    // Give the mock a distinct Stripe identity for this second independent order.
    const fetchMock = vi.mocked(fetch);
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const response = await originalFetch(input, init);
      if (String(input).endsWith('/v1/checkout/sessions')) return jsonResponse({ ...(await response.json() as Record<string, unknown>), id: 'cs_test_fresh7999', url: 'https://checkout.stripe.com/c/pay/cs_test_fresh7999' });
      return response;
    });
    const freshKey = crypto.randomUUID();
    expect((await request('/api/checkout/session', { ...checkout, idempotencyKey: freshKey })).status).toBe(200);
    expect(await db.prepare('SELECT unit_price_cents FROM orders WHERE idempotency_key = ?').bind(freshKey).first()).toMatchObject({ unit_price_cents: 7999 });
    expect((await db.prepare('SELECT COUNT(*) AS count FROM orders').first<{ count: number }>())?.count).toBe(2);
  });
  it.each(['paid', 'refunded', 'partially_refunded'].flatMap(status => [9999, 9900].map(price => ({ status, price }))))('preserves historical $price-cent $status orders on checkout reuse', async ({ status, price }) => {
    await start();
    await db.prepare('UPDATE orders SET status = ?, unit_price_cents = ?, total_cents = ?').bind(status, price, price * 2).run();
    remoteCalls.length = 0;
    const response = await request('/api/checkout/session', checkout);
    expect(await response.json()).toMatchObject({ code: 'checkout_paid' });
    expect(await db.prepare('SELECT status, unit_price_cents, total_cents FROM orders LIMIT 1').first()).toMatchObject({ status, unit_price_cents: price, total_cents: price * 2 });
    expect(remoteCalls).toHaveLength(0);
  });
  it('uses the same Stripe idempotency keys for racing checkout submissions', async () => {
    const responses = await Promise.all([request('/api/checkout/session', checkout), request('/api/checkout/session', checkout)]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect((await db.prepare('SELECT COUNT(*) AS count FROM orders').first<{ count: number }>())?.count).toBe(1);
    const customerKeys = remoteCalls.filter(call => call.url.endsWith('/customers')).map(call => call.idempotencyKey);
    const sessionKeys = remoteCalls.filter(call => call.url.endsWith('/checkout/sessions')).map(call => call.idempotencyKey);
    expect(new Set(customerKeys).size).toBe(1); expect(customerKeys[0]).toMatch(/^eitaware:customer:/);
    expect(new Set(sessionKeys).size).toBe(1); expect(sessionKeys[0]).toMatch(/^eitaware:session:/);
  });
  it('rejects client prices before calling Stripe', async () => {
    expect((await request('/api/checkout/session', { ...checkout, priceCents: 1 })).status).toBe(400);
    expect(remoteCalls).toHaveLength(0);
  });
  it('returns distinct recoverable error codes for expired and already-paid keys', async () => {
    await start();
    await db.prepare("UPDATE orders SET status = 'expired'").run();
    expect(await (await request('/api/checkout/session', checkout)).json()).toMatchObject({ code: 'checkout_expired' });
    await db.prepare("UPDATE orders SET status = 'paid'").run();
    expect(await (await request('/api/checkout/session', checkout)).json()).toMatchObject({ code: 'checkout_paid' });
  });
  it('fails closed when paused, unconfigured or production readiness is incomplete', async () => {
    env.CHECKOUT_ENABLED = 'false';
    expect((await request('/api/checkout/session', checkout)).status).toBe(503);
    env.CHECKOUT_ENABLED = 'true';
    await db.prepare("UPDATE store_settings SET value = 'false' WHERE key = 'sales_enabled'").run();
    expect((await request('/api/checkout/session', checkout)).status).toBe(503);
    await db.prepare("UPDATE store_settings SET value = 'true' WHERE key = 'sales_enabled'").run();
    env.ENVIRONMENT = 'production'; env.STRIPE_MODE = 'live'; env.STRIPE_SECRET_KEY = 'sk_live_ready';
    expect((await request('/api/checkout/session', checkout)).status).toBe(503);
    expect(remoteCalls).toHaveLength(0);
  });
  it('uses the native rate-limit binding before checkout work', async () => {
    env.RATE_LIMITER = { limit: vi.fn(async () => ({ success: false })) };
    expect((await request('/api/checkout/session', checkout)).status).toBe(429);
    expect(remoteCalls).toHaveLength(0);
  });
});

describe('catalog-aware checkout and migration', () => {
  it('defaults the product API and legacy requests to the historical product', async () => {
    expect(await (await request('/api/product')).json()).toMatchObject({ id: DEFAULT_PRODUCT_ID, status: 'available', priceCents: defaultPrice, available: true });
    const { productId: _productId, ...legacy } = checkout;
    expect((await request('/api/checkout/session', legacy)).status).toBe(200);
    const order = await db.prepare('SELECT * FROM orders LIMIT 1').first<OrderRow>();
    expect(order).toMatchObject({ product_id: DEFAULT_PRODUCT_ID, product_title: defaultTemplate.title, mcf_sku: 'test-sku' });
    expect((await request('/api/checkout/session', checkout)).status).toBe(200);
    expect(remoteCalls.filter(call => call.url.endsWith('/checkout/sessions'))).toHaveLength(1);
  });
  it('keeps a coming-soon product visible without permitting a charge', async () => {
    addProduct('future-set', { status: 'coming-soon', priceCents: undefined, whatToExpect: 'A new finish.' });
    FULFILLMENT_SKUS['future-set'] = 'future-sku';
    const response = await request('/api/product?id=future-set');
    expect(await response.json()).toMatchObject({ id: 'future-set', status: 'coming-soon', priceCents: null, available: false, checkoutMode: 'unavailable' });
    expect((await request('/api/checkout/session', { ...checkout, productId: 'future-set' })).status).toBe(409);
    expect(remoteCalls).toHaveLength(0);
    expect((await db.prepare('SELECT COUNT(*) AS count FROM orders').first<{ count: number }>())?.count).toBe(0);
  });
  it.each(['missing-set', 'draft-set'])('hides %s and prevents checkout', async id => {
    if (id === 'draft-set') addProduct(id, { status: 'draft' });
    expect((await request(`/api/product?id=${id}`)).status).toBe(404);
    expect((await request('/api/checkout/session', { ...checkout, productId: id })).status).toBe(404);
    expect(remoteCalls).toHaveLength(0);
  });
  it('requires a per-product SKU and never borrows the default product fallback', async () => {
    const product = addProduct('green-set');
    expect(await checkoutAvailable(env, product)).toBe(false);
    expect((await request('/api/checkout/session', { ...checkout, productId: product.id })).status).toBe(503);
    FULFILLMENT_SKUS[product.id] = 'green-mcf';
    expect(await checkoutAvailable(env, product)).toBe(true);
    expect((await request('/api/checkout/session', { ...checkout, productId: product.id })).status).toBe(200);
    const order = await db.prepare('SELECT * FROM orders LIMIT 1').first<OrderRow>();
    expect(order).toMatchObject({ product_id: product.id, product_title: product.title, unit_price_cents: 12999, mcf_sku: 'green-mcf' });
    const session = remoteCalls.find(call => call.url.endsWith('/checkout/sessions'))!;
    expect(session.body.get('metadata[product_id]')).toBe('green-set');
    expect(session.body.get('line_items[0][price_data][product_data][name]')).toBe('Green Dinnerware');
    expect(session.body.get('cancel_url')).toBe('https://eitaware.com/checkout?product=green-set&cancelled=1');
    await db.prepare("UPDATE store_settings SET value = 'false' WHERE key = 'sales_enabled'").run();
    expect(await checkoutAvailable(env, product)).toBe(false);
  });
  it('includes product identity in request idempotency and enforces its quantity cap', async () => {
    const product = addProduct('green-set', { maxQuantity: 1 });
    FULFILLMENT_SKUS[product.id] = 'green-mcf';
    expect((await request('/api/checkout/session', { ...checkout, productId: product.id })).status).toBe(400);
    await start();
    expect(await (await request('/api/checkout/session', { ...checkout, quantity: 1, productId: product.id })).json()).toMatchObject({ code: 'checkout_changed' });
    expect((await db.prepare('SELECT COUNT(*) AS count FROM orders').first<{ count: number }>())?.count).toBe(1);
  });
  it('verifies and notifies from the order snapshot after catalog and SKU edits', async () => {
    const product = addProduct('green-set', { asin: undefined });
    FULFILLMENT_SKUS[product.id] = 'original-green-sku';
    expect((await request('/api/checkout/session', { ...checkout, productId: product.id })).status).toBe(200);
    product.title = 'Renamed Dinnerware'; product.subtitle = 'Changed description'; product.priceCents = 25999; product.status = 'draft';
    product.image = '/images/changed.webp'; FULFILLMENT_SKUS[product.id] = 'new-green-sku';
    expect((await webhook()).status).toBe(200);
    const order = await db.prepare('SELECT * FROM orders LIMIT 1').first<OrderRow>();
    expect(order).toMatchObject({ status: 'paid', product_title: 'Green Dinnerware', product_subtitle: 'Two green place settings', unit_price_cents: 12999, total_cents: 25998, mcf_sku: 'original-green-sku', product_asin: null });
    const email = await db.prepare('SELECT text FROM email_outbox LIMIT 1').first<{ text: string }>();
    expect(email?.text).toContain('Green Dinnerware'); expect(email?.text).toContain('original-green-sku');
    expect(email?.text).not.toContain('Renamed Dinnerware'); expect(email?.text).not.toContain('new-green-sku');
  });
  it('accepts the historical default-product request hash on an existing pending order', async () => {
    await start();
    const { productId: _productId, idempotencyKey: _key, ...legacySnapshot } = checkout;
    await db.prepare('UPDATE orders SET request_hash = ?').bind(await hashValue(legacySnapshot)).run();
    expect((await request('/api/checkout/session', checkout)).status).toBe(200);
    expect(remoteCalls.filter(call => call.url.endsWith('/checkout/sessions'))).toHaveLength(1);
  });
  it('additively backfills a pre-catalog order while preserving its price, payment and fulfillment data', async () => {
    const legacyDb = new TestD1({ migrationsThrough: '0001_initial.sql' });
    try {
      await legacyDb.exec(`INSERT INTO orders (id,reference,idempotency_key,request_hash,quantity,unit_price_cents,currency,email,name,address_json,mcf_sku,status,stripe_session_id,created_at)
        VALUES ('old-order','EITA-OLD','old-key','old-hash',1,6999,'usd','old@example.com','Old Buyer','{}','old-sku','paid','cs_test_old',1)`);
      await legacyDb.exec(readFileSync(new URL('../migrations/0002_product_snapshots.sql', import.meta.url), 'utf8'));
      expect(await legacyDb.prepare('SELECT * FROM orders').first<OrderRow>()).toMatchObject({ product_id: DEFAULT_PRODUCT_ID, product_title: 'Dark Blue Dinnerware Set', product_subtitle: '12-piece stoneware dinnerware set', product_image: '/images/product-set.webp', product_asin: 'B0H8X1MSP5', unit_price_cents: 6999, mcf_sku: 'old-sku', status: 'paid', stripe_session_id: 'cs_test_old', request_hash: 'old-hash' });
    } finally { legacyDb.close(); }
  });
});

describe('signed webhook fulfillment', () => {
  it.each([9999, 9900])('still verifies a signed delayed %s-cent payment against its immutable order snapshot', async price => {
    await start();
    await db.prepare('UPDATE orders SET unit_price_cents = ?').bind(price).run();
    expect((await request('/api/checkout/session', checkout)).status).toBe(409);
    expect((await webhook()).status).toBe(200);
    expect(await db.prepare('SELECT status, unit_price_cents, total_cents FROM orders LIMIT 1').first()).toMatchObject({ status: 'paid', unit_price_cents: price, total_cents: price * 2 });
    const confirmation = await (await request('/api/checkout/status?session_id=cs_test_session123')).json();
    expect(confirmation).toMatchObject({ status: 'paid', totalCents: price * 2 });
  });
  it('records one paid order and one outbox message across duplicate and concurrent events', async () => {
    await start();
    const responses = await Promise.all([webhook(), webhook(), webhook('checkout.session.completed', {}, 'evt_paid456')]);
    expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
    const order = await db.prepare('SELECT * FROM orders LIMIT 1').first<OrderRow>();
    expect(order?.status).toBe('paid'); expect(order?.total_cents).toBe(defaultPrice * 2);
    expect((await db.prepare('SELECT COUNT(*) AS count FROM email_outbox').first<{ count: number }>())?.count).toBe(1);
    const email = await db.prepare('SELECT * FROM email_outbox LIMIT 1').first<{ text: string; recipient: string }>();
    expect(email?.recipient).toBe('orders@eitaware.com');
    expect(email?.text).toContain('123 Main Street'); expect(email?.text).toContain('test-sku'); expect(email?.text).toContain('pi_order123');
  });
  it.each([
    { amount_subtotal: 1 }, { currency: 'eur' }, { customer: 'cus_wrong' }, { client_reference_id: 'another-order' }, { livemode: true },
    { total_details: { amount_discount: 100, amount_tax: 0, amount_shipping: 0 } },
    { line_items: { has_more: false, data: [] } },
  ])('does not fulfill a paid session whose authoritative snapshot is inconsistent: %j', async override => {
    await start(); sessionOverride = override;
    expect((await webhook()).status).toBe(500);
    expect((await db.prepare('SELECT status FROM orders LIMIT 1').first<{ status: string }>())?.status).toBe('pending');
    expect((await db.prepare('SELECT COUNT(*) AS count FROM email_outbox').first<{ count: number }>())?.count).toBe(0);
  });
  it('rejects an invalid signature before processing any order', async () => {
    await start();
    const response = await app.fetch(new Request('https://eitaware.com/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=invalid' }, body: '{}' }), env, ctx as ExecutionContext);
    expect(response.status).toBe(400);
    expect((await db.prepare('SELECT status FROM orders LIMIT 1').first<{ status: string }>())?.status).toBe('pending');
  });
  it('does not mark an unpaid completed checkout as paid', async () => {
    await start(); expect((await webhook('checkout.session.completed', { payment_status: 'unpaid' })).status).toBe(200);
    expect((await db.prepare('SELECT status FROM orders LIMIT 1').first<{ status: string }>())?.status).toBe('pending');
  });
  it('keeps a paid order paid when an expiration event arrives later', async () => {
    await start(); await webhook();
    const order = await db.prepare('SELECT * FROM orders LIMIT 1').first<OrderRow>();
    await webhook('checkout.session.expired', { client_reference_id: order!.id, metadata: { order_id: order!.id } }, 'evt_expired123');
    expect((await db.prepare('SELECT status FROM orders LIMIT 1').first<{ status: string }>())?.status).toBe('paid');
  });
  it('handles a refund before completion without creating a fulfillment notification', async () => {
    await start(); refunded = true;
    expect((await webhook('charge.refunded', { id: 'ch_order123', payment_intent: 'pi_order123' }, 'evt_refund123')).status).toBe(200);
    expect((await webhook()).status).toBe(200);
    expect((await db.prepare('SELECT status FROM orders LIMIT 1').first<{ status: string }>())?.status).toBe('refunded');
    expect((await db.prepare('SELECT COUNT(*) AS count FROM email_outbox').first<{ count: number }>())?.count).toBe(0);
  });
  it('handles a concurrent refund and completion without leaving an active notification', async () => {
    await start(); refunded = true;
    await Promise.all([webhook(), webhook('charge.refunded', { id: 'ch_order123', payment_intent: 'pi_order123' }, 'evt_refund123')]);
    expect((await db.prepare('SELECT status FROM orders LIMIT 1').first<{ status: string }>())?.status).toBe('refunded');
    expect((await db.prepare("SELECT COUNT(*) AS count FROM email_outbox WHERE status IN ('pending','sending')").first<{ count: number }>())?.count).toBe(0);
  });
  it('suppresses an unsent notification when the order is refunded later', async () => {
    await start(); await webhook(); refunded = true;
    await webhook('charge.refunded', { id: 'ch_order123', payment_intent: 'pi_order123' }, 'evt_refund123');
    expect((await db.prepare('SELECT status FROM email_outbox LIMIT 1').first<{ status: string }>())?.status).toBe('suppressed');
    await webhook('checkout.session.completed', {}, 'evt_paid456');
    expect((await db.prepare('SELECT status FROM email_outbox LIMIT 1').first<{ status: string }>())?.status).toBe('suppressed');
  });
  it('exposes confirmation status without delivery PII and keeps it available after sales pause', async () => {
    await start(); await webhook(); env.CHECKOUT_ENABLED = 'false';
    const response = await request('/api/checkout/status?session_id=cs_test_session123');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({ status: 'paid', totalCents: defaultPrice * 2 });
    expect(JSON.stringify(body)).not.toContain('ada@example.com'); expect(JSON.stringify(body)).not.toContain('Main Street');
    expect((await request('/api/checkout/status?session_id=cs_live_wrong')).status).toBe(404);
  });
  it('keeps confirmation pending after the former expiry timestamp until Stripe confirms its outcome', async () => {
    await start();
    await db.prepare('UPDATE orders SET expires_at = 1').run();
    const response = await request('/api/checkout/status?session_id=cs_test_session123');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'pending' });
  });
  it.each(['refunded', 'partially_refunded'])('reports precise %s status without implying a new paid order', async status => {
    await start(); await webhook();
    await db.prepare('UPDATE orders SET status = ?').bind(status).run();
    const response = await request('/api/checkout/status?session_id=cs_test_session123');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status, totalCents: defaultPrice * 2, currency: 'usd', orderReference: expect.stringMatching(/^EITA-/) });
    expect(JSON.stringify(body)).not.toContain('ada@example.com');
    expect(JSON.stringify(body)).not.toContain('Main Street');
  });
});
