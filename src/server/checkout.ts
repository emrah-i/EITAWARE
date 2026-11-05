import Stripe from 'stripe';
import type { Context, Hono } from 'hono';
import { DEFAULT_PRODUCT_ID, findProduct, type CatalogProduct } from '../shared/catalog';
import fulfillmentJson from './fulfillment.json';
import type { CheckoutStatusResponse, DeliveryAddress } from '../shared/types';
import type { Env } from './env';
import { buildOrderEmail, flushOutbox, prepareOutboxInsert } from './notifications';
import { hashValue, validateCheckout } from './validation';

type AppEnv = { Bindings: Env };
export interface OrderRow {
  id: string; reference: string; idempotency_key: string; request_hash: string;
  quantity: number; unit_price_cents: number; currency: string; email: string; name: string;
  address_json: string; mcf_sku: string; status: string; stripe_customer_id: string | null;
  stripe_session_id: string | null; stripe_session_url: string | null; stripe_payment_intent_id: string | null;
  total_cents: number | null; tax_cents: number | null; created_at: number; paid_at: number | null; expires_at: number | null;
  product_id: string; product_title: string; product_subtitle: string; product_image: string; product_asin: string | null;
}
class CheckoutError extends Error {
  constructor(message: string, readonly status: 400 | 409 | 503 = 503, readonly code?: 'checkout_expired' | 'checkout_paid' | 'checkout_changed' | 'checkout_busy') { super(message); }
}
const nowSeconds = () => Math.floor(Date.now() / 1000);
const cryptoProvider = Stripe.createSubtleCryptoProvider();
export const FULFILLMENT_SKUS: Record<string, string> = fulfillmentJson;
export function fulfillmentSku(env: Env, productId: string): string | undefined {
  const configured = Object.prototype.hasOwnProperty.call(FULFILLMENT_SKUS, productId) ? FULFILLMENT_SKUS[productId]?.trim() : undefined;
  return configured || (productId === DEFAULT_PRODUCT_ID ? env.MCF_SELLER_SKU?.trim() : undefined);
}

export function stripeModeReady(env: Env): boolean {
  const live = env.ENVIRONMENT === 'production';
  return env.STRIPE_MODE === (live ? 'live' : 'test') && Boolean(env.STRIPE_SECRET_KEY?.startsWith(live ? 'sk_live_' : 'sk_test_'));
}
function stripeClient(env: Env): Stripe {
  if (!stripeModeReady(env)) throw new CheckoutError('Checkout is not available yet. You can shop on Amazon.');
  return new Stripe(env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2 });
}
export async function checkoutAvailable(env: Env, product = findProduct(DEFAULT_PRODUCT_ID)): Promise<boolean> {
  if (!product || product.status !== 'available' || !Number.isSafeInteger(product.priceCents) || !fulfillmentSku(env, product.id)) return false;
  if (env.CHECKOUT_ENABLED !== 'true' || !stripeModeReady(env) || !env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) return false;
  if (env.ENVIRONMENT === 'production' && (env.TAX_READY !== 'true' || env.EMAIL_READY !== 'true' || !env.RESEND_API_KEY)) return false;
  const setting = await env.DB.prepare("SELECT value FROM store_settings WHERE key = 'sales_enabled'").first<{ value: string }>();
  return setting?.value === 'true';
}
function objectId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id ?? null;
}
async function loadOrder(env: Env, sessionId: string): Promise<OrderRow | null> {
  return env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id = ?').bind(sessionId).first<OrderRow>();
}
function correctSessionMode(env: Env, id: string): boolean {
  return id.startsWith(env.STRIPE_MODE === 'live' ? 'cs_live_' : 'cs_test_') && /^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(id) && id.length < 256;
}
function shipping(order: OrderRow): Stripe.Checkout.SessionCreateParams.PaymentIntentData.Shipping {
  const address = JSON.parse(order.address_json) as DeliveryAddress;
  return { name: order.name, address: { line1: address.line1, ...(address.line2 ? { line2: address.line2 } : {}), city: address.city, state: address.state, postal_code: address.postalCode, country: 'US' } };
}
function statusOf(order: OrderRow): CheckoutStatusResponse {
  if (order.status === 'paid' || order.status === 'partially_refunded' || order.status === 'refunded') {
    return { status: order.status, orderReference: order.reference, totalCents: order.total_cents ?? order.quantity * order.unit_price_cents, currency: order.currency };
  }
  // Only Stripe's expiration event establishes expiration. A paid session may
  // return after its former expiry timestamp while its completion event retries.
  return { status: order.status === 'expired' ? 'expired' : 'pending' };
}
async function notify(c: Context<AppEnv>, id: string): Promise<void> {
  const delivery = flushOutbox(c.env, id).catch(() => { console.error('Order notification remains in the outbox for retry.'); });
  try { c.executionCtx.waitUntil(delivery); } catch { await delivery; }
}
function apiFailure(c: Context<AppEnv>, error: unknown) {
  if (error instanceof CheckoutError) return c.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
  if (error instanceof Stripe.errors.StripeError && (error.statusCode === 409 || error.type === 'StripeIdempotencyError')) {
    return c.json({ error: 'Checkout is already being prepared. Please try again in a moment.', code: 'checkout_busy' }, 409);
  }
  console.error('Checkout operation failed.', error instanceof Stripe.errors.StripeError ? error.type : 'internal_error');
  return c.json({ error: 'We could not prepare checkout. Please try again shortly or shop on Amazon.' }, 503);
}

async function createSession(env: Env, value: ReturnType<typeof validateCheckout> & { ok: true }, product: CatalogProduct): Promise<string> {
  const request = value.value;
  const { idempotencyKey, website: _website, ...snapshot } = request;
  const requestHash = await hashValue(snapshot);
  const id = crypto.randomUUID();
  const now = nowSeconds();
  const reference = `EITA-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${id.slice(0, 8).toUpperCase()}`;
  await env.DB.prepare(`INSERT OR IGNORE INTO orders
    (id, reference, idempotency_key, request_hash, quantity, unit_price_cents, currency, email, name, address_json, mcf_sku, created_at,
      product_id, product_title, product_subtitle, product_image, product_asin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, reference, idempotencyKey, requestHash, request.quantity, product.priceCents!, product.currency, request.email, request.name, JSON.stringify(request.address), fulfillmentSku(env, product.id)!, now, product.id, product.title, product.subtitle, product.image, product.asin ?? null).run();
  const order = await env.DB.prepare('SELECT * FROM orders WHERE idempotency_key = ?').bind(idempotencyKey).first<OrderRow>();
  if (!order) throw new CheckoutError('We could not save your order. Please try again.');
  // Pre-catalog orders hashed these same details without productId. Only the
  // historical product can match that older hash; new requests include identity.
  const { productId: _productId, ...legacySnapshot } = snapshot;
  const legacyMatch = request.productId === DEFAULT_PRODUCT_ID && order.product_id === DEFAULT_PRODUCT_ID && order.request_hash === await hashValue(legacySnapshot);
  if (order.product_id !== request.productId || (order.request_hash !== requestHash && !legacyMatch)) throw new CheckoutError('Your checkout details changed. Refresh checkout and try again.', 409, 'checkout_changed');
  if (order.status === 'paid' || order.status === 'refunded' || order.status === 'partially_refunded') throw new CheckoutError('Payment was already received for this checkout. Check your receipt or contact support before placing another order.', 409, 'checkout_paid');
  if (order.status !== 'pending') throw new CheckoutError('This checkout expired. Start a new checkout.', 409, 'checkout_expired');
  // Stripe retains idempotency results for at least 24 hours. Never reuse an old key after that window.
  if (order.created_at < now - 23 * 60 * 60 || (order.expires_at !== null && order.expires_at <= now)) throw new CheckoutError('This checkout expired. Start a new checkout.', 409, 'checkout_expired');
  if (order.stripe_session_url) return order.stripe_session_url;

  const stripe = stripeClient(env);
  const recipient = shipping(order);
  const customer = await stripe.customers.create({ email: order.email, name: order.name, shipping: recipient, metadata: { order_id: order.id, order_reference: order.reference } }, { idempotencyKey: `eitaware:customer:${order.id}` });
  const site = new URL(env.SITE_URL).origin;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', customer: customer.id,
    client_reference_id: order.id,
    metadata: { order_id: order.id, order_reference: order.reference, product_id: order.product_id },
    allowed_payment_method_types: ['card'],
    line_items: [{ price_data: { currency: order.currency, unit_amount: order.unit_price_cents, product_data: { name: order.product_title, description: order.product_subtitle, images: [new URL(order.product_image, site).toString()], metadata: { product_id: order.product_id, ...(order.product_asin ? { asin: order.product_asin } : {}) } }, tax_behavior: 'exclusive' }, quantity: order.quantity }],
    automatic_tax: { enabled: env.TAX_READY === 'true' },
    payment_intent_data: { shipping: recipient, receipt_email: order.email, metadata: { order_id: order.id, order_reference: order.reference, product_id: order.product_id, mcf_sku: order.mcf_sku } },
    success_url: `${site}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/checkout?product=${encodeURIComponent(order.product_id)}&cancelled=1`,
    custom_text: { submit: { message: `Delivery to ${recipient.name}, ${recipient.address.line1}, ${recipient.address.city}, ${recipient.address.state} ${recipient.address.postal_code}. Return to EITAWARE to change this address.` } },
  }, { idempotencyKey: `eitaware:session:${order.id}` });
  if (!session.url || session.livemode !== (env.STRIPE_MODE === 'live')) throw new CheckoutError('Checkout could not be verified. Please try again.');
  await env.DB.prepare(`UPDATE orders SET stripe_customer_id = ?, stripe_session_id = ?, stripe_session_url = ?, expires_at = ?
    WHERE id = ? AND status = 'pending' AND (stripe_session_id IS NULL OR stripe_session_id = ?)`)
    .bind(customer.id, session.id, session.url, session.expires_at, order.id, session.id).run();
  return session.url;
}

async function verifiedPaidSession(env: Env, stripe: Stripe, sessionId: string): Promise<{ order: OrderRow; session: Stripe.Checkout.Session; paymentState: string }> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items.data.price.product', 'payment_intent.latest_charge'] });
  const order = await loadOrder(env, session.id);
  if (!order) throw new Error('Checkout order association is missing.');
  const items = session.line_items;
  const item = items?.data[0];
  const price = item?.price;
  const product = price?.product;
  const productId = typeof product === 'object' && product !== null && !('deleted' in product) ? product.metadata.product_id : null;
  const expectedSubtotal = order.quantity * order.unit_price_cents;
  if (session.livemode !== (env.STRIPE_MODE === 'live') || session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid' || session.client_reference_id !== order.id || session.metadata?.order_id !== order.id || session.metadata.product_id !== order.product_id || objectId(session.customer) !== order.stripe_customer_id || !objectId(session.payment_intent) || session.currency !== order.currency || session.amount_subtotal !== expectedSubtotal || !items || items.has_more || items.data.length !== 1 || item?.quantity !== order.quantity || item.amount_subtotal !== expectedSubtotal || price?.unit_amount !== order.unit_price_cents || price.currency !== order.currency || productId !== order.product_id || (session.total_details?.amount_discount ?? 0) !== 0 || (session.total_details?.amount_shipping ?? 0) !== 0 || session.amount_total !== expectedSubtotal + (session.total_details?.amount_tax ?? 0)) {
    throw new Error('Paid checkout verification failed.');
  }
  const intent = session.payment_intent;
  if (typeof intent !== 'object' || !intent || intent.status !== 'succeeded' || intent.currency !== order.currency || intent.amount !== session.amount_total || intent.metadata.order_id !== order.id || objectId(intent.customer) !== order.stripe_customer_id || typeof intent.latest_charge !== 'object' || !intent.latest_charge) throw new Error('Payment association verification failed.');
  const charge = intent.latest_charge;
  const paymentState = charge.refunded ? 'refunded' : charge.amount_refunded > 0 ? 'partially_refunded' : 'paid';
  return { order, session, paymentState };
}

async function processPaid(c: Context<AppEnv>, stripe: Stripe, event: Stripe.Event, sessionId: string): Promise<void> {
  const { order, session, paymentState } = await verifiedPaidSession(c.env, stripe, sessionId);
  const now = nowSeconds();
  const paidOrder = { ...order, total_cents: session.amount_total, tax_cents: session.total_details?.amount_tax ?? 0, stripe_payment_intent_id: objectId(session.payment_intent), paid_at: now };
  const email = buildOrderEmail(paidOrder);
  // The unique outbox ID and INSERT OR IGNORE make distinct/concurrent payment events converge on one notification.
  const outboxId = `order:${order.id}`;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)').bind(event.id, event.type, now),
    c.env.DB.prepare(`UPDATE orders SET status = CASE WHEN status = 'refunded' OR ? = 'refunded' THEN 'refunded'
      WHEN status = 'partially_refunded' OR ? = 'partially_refunded' THEN 'partially_refunded' ELSE 'paid' END,
      total_cents = ?, tax_cents = ?, stripe_payment_intent_id = ?, paid_at = COALESCE(paid_at, ?)
      WHERE id = ? AND stripe_session_id = ?`).bind(paymentState, paymentState, paidOrder.total_cents, paidOrder.tax_cents, paidOrder.stripe_payment_intent_id, now, order.id, session.id),
    prepareOutboxInsert(c.env, { id: outboxId, kind: 'order', recipient: c.env.ORDER_EMAIL, onlyIfPaidOrderId: order.id, ...email }, now),
  ]);
  await notify(c, outboxId);
}

export function registerCheckoutRoutes(app: Hono<AppEnv>): void {
  app.get('/api/product', async c => {
    c.header('Cache-Control', 'no-store');
    try {
      const product = findProduct(c.req.query('id') ?? DEFAULT_PRODUCT_ID);
      if (!product || product.status === 'draft') return c.json({ error: 'This product could not be found.' }, 404);
      const available = await checkoutAvailable(c.env, product);
      return c.json({ id: product.id, status: product.status, priceCents: product.priceCents ?? null, currency: product.currency, maxQuantity: product.maxQuantity, available, checkoutMode: available ? c.env.STRIPE_MODE : 'unavailable' });
    } catch { return c.json({ error: 'Product availability could not be checked. Please try again.' }, 503); }
  });
  app.post('/api/checkout/session', async c => {
    c.header('Cache-Control', 'no-store');
    try {
      if (c.env.RATE_LIMITER) {
        const result = await c.env.RATE_LIMITER.limit({ key: `checkout:${c.req.header('CF-Connecting-IP') ?? 'local'}` });
        if (!result.success) return c.json({ error: 'Please wait a moment before trying checkout again.' }, 429);
      }
      let body: unknown;
      try { body = await c.req.json(); } catch { return c.json({ error: 'Send a valid checkout form.' }, 400); }
      const validated = validateCheckout(body);
      if (!validated.ok) return c.json({ error: validated.error, fields: validated.fields }, 400);
      const product = findProduct(validated.value.productId);
      if (!product || product.status === 'draft') return c.json({ error: 'This product could not be found.' }, 404);
      if (product.status === 'coming-soon') return c.json({ error: 'This product is coming soon and is not available for checkout.' }, 409);
      if (!await checkoutAvailable(c.env, product)) throw new CheckoutError('Direct checkout is not available yet.');
      return c.json({ checkoutUrl: await createSession(c.env, validated, product) });
    } catch (error) { return apiFailure(c, error); }
  });
  app.get('/api/checkout/status', async c => {
    c.header('Cache-Control', 'no-store');
    const id = c.req.query('session_id') ?? '';
    if (!stripeModeReady(c.env) || !correctSessionMode(c.env, id)) return c.json({ error: 'This checkout could not be found.' }, 404);
    try {
      const order = await loadOrder(c.env, id);
      if (!order) return c.json({ error: 'This checkout could not be found.' }, 404);
      return c.json(statusOf(order));
    } catch { return c.json({ error: 'Order confirmation is temporarily unavailable. Please check your email.' }, 503); }
  });
  app.post('/api/stripe/webhook', async c => {
    c.header('Cache-Control', 'no-store');
    if (!stripeModeReady(c.env) || !c.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) return c.json({ error: 'Webhook is not configured.' }, 503);
    const signature = c.req.header('stripe-signature');
    if (!signature) return c.json({ error: 'Missing webhook signature.' }, 400);
    const stripe = stripeClient(c.env);
    let event: Stripe.Event;
    try { event = await stripe.webhooks.constructEventAsync(await c.req.text(), signature, c.env.STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider); }
    catch { return c.json({ error: 'Invalid webhook signature.' }, 400); }
    if (event.livemode !== (c.env.STRIPE_MODE === 'live')) return c.json({ error: 'Webhook mode does not match this store.' }, 400);
    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === 'paid') await processPaid(c, stripe, event, session.id);
      } else if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;
        const order = await loadOrder(c.env, session.id);
        if (order && session.client_reference_id === order.id && session.metadata?.order_id === order.id) {
          await c.env.DB.batch([
            c.env.DB.prepare('INSERT OR IGNORE INTO stripe_events (id,type,created_at) VALUES (?,?,?)').bind(event.id, event.type, nowSeconds()),
            c.env.DB.prepare("UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(order.id),
          ]);
        }
      } else if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntent = objectId(charge.payment_intent);
        if (paymentIntent) {
          // Retrieve current state: refund events may be delivered before completion or out of order.
          const intent = await stripe.paymentIntents.retrieve(paymentIntent, { expand: ['latest_charge'] });
          const currentCharge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
          const orderId = intent.metadata.order_id;
          if (currentCharge && orderId && currentCharge.amount_refunded > 0) await c.env.DB.batch([
            c.env.DB.prepare('INSERT OR IGNORE INTO stripe_events (id,type,created_at) VALUES (?,?,?)').bind(event.id, event.type, nowSeconds()),
            c.env.DB.prepare(`UPDATE orders SET status = ?, stripe_payment_intent_id = ?
              WHERE id = ? AND stripe_customer_id = ? AND stripe_session_id IS NOT NULL
              AND (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id = ?)`)
              .bind(currentCharge.refunded ? 'refunded' : 'partially_refunded', intent.id, orderId, objectId(intent.customer), intent.id),
            c.env.DB.prepare(`UPDATE email_outbox SET status = 'suppressed', last_error = 'payment_refunded'
              WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status IN ('refunded','partially_refunded'))`)
              .bind(`order:${orderId}`, orderId),
          ]);
        }
      }
      return c.json({ received: true });
    } catch {
      // A non-2xx response asks Stripe to retry; never acknowledge a missing durable order or failed verification.
      console.error('Stripe event processing failed.', event.type);
      return c.json({ error: 'Event processing failed. Please retry.' }, 500);
    }
  });
}
