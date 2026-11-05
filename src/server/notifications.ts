import { BRAND, money } from '../shared/catalog';
import type { DeliveryAddress } from '../shared/types';
import type { Env, OutboxRow } from './env';

const LEASE_SECONDS = 120;
const MAX_ATTEMPTS = 8;
// Resend retains idempotency keys for 24 hours. Stop earlier so an ambiguous
// request is never resent after that protection could have expired.
const RETRY_WINDOW_SECONDS = 23 * 60 * 60;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

export interface EmailContent { subject: string; html: string; text: string; }

interface OrderEmailInput {
  id: string; reference: string; quantity: number; unit_price_cents: number;
  currency: string; email: string; name: string; address_json: string; mcf_sku: string;
  total_cents?: number | null; tax_cents?: number | null;
  stripe_session_id?: string | null; stripe_payment_intent_id?: string | null;
  paid_at?: number | null;
  product_id: string; product_title: string; product_subtitle: string;
  product_image: string; product_asin: string | null;
}

export function buildOrderEmail(order: OrderEmailInput): EmailContent {
  const address = JSON.parse(order.address_json) as DeliveryAddress;
  const rows: [string, string][] = [
    ['Order', order.reference], ['Order ID', order.id],
    ['Product', `EITAWARE ${order.product_title}`], ['Product ID', order.product_id],
    ['Description', order.product_subtitle], ['Product image', new URL(order.product_image, BRAND.url).toString()],
    ['MCF seller SKU', order.mcf_sku], ['Quantity', String(order.quantity)],
    ['Unit price', money(order.unit_price_cents, order.currency)],
    ['Tax', money(order.tax_cents ?? 0, order.currency)],
    ['Total paid', money(order.total_cents ?? order.quantity * order.unit_price_cents, order.currency)],
    ['Buyer email', order.email], ['Recipient', order.name],
    ['Address line 1', address.line1], ['Address line 2', address.line2 || '—'],
    ['City', address.city], ['State', address.state], ['ZIP', address.postalCode],
    ['Country', address.country], ['Stripe payment', order.stripe_payment_intent_id || 'See Checkout Session'],
    ['Stripe Checkout Session', order.stripe_session_id || 'See payment reference'],
  ];
  if (order.product_asin) rows.push(['ASIN', order.product_asin]);
  if (order.paid_at) rows.push(['Paid at (UTC)', new Date(order.paid_at * 1000).toISOString()]);
  const instructions = 'Payment received. Check the payment and refund status in Stripe before creating the MCF order. Use this order reference for MCF and fulfill this order only once, even if you receive a repeated notification. This email does not mean the order has shipped. Send tracking to the buyer after shipment.';
  return {
    subject: `Paid EITAWARE order ${order.reference}`,
    text: `${instructions}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}`,
    html: `<h1>New paid order</h1><p>${escapeHtml(instructions)}</p><table>${rows.map(([label, value]) => `<tr><th align="left" style="padding:6px 16px 6px 0;vertical-align:top">${escapeHtml(label)}</th><td style="padding:6px 0">${escapeHtml(value)}</td></tr>`).join('')}</table>`,
  };
}

interface OutboxInsert extends EmailContent {
  id: string; kind: 'order' | 'contact'; recipient: string; replyTo?: string;
  onlyIfPaidOrderId?: string;
}

/** Return a statement so the message can be inserted with its source record. */
export function prepareOutboxInsert(env: Env, message: OutboxInsert, now = Math.floor(Date.now() / 1000)): D1PreparedStatement {
  const values = [message.id, message.kind, message.recipient, message.subject, message.html,
    message.text, message.replyTo ?? null, now, now];
  return env.DB.prepare(`INSERT OR IGNORE INTO email_outbox
    (id, kind, recipient, subject, html, text, reply_to, created_at, next_attempt_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?${message.onlyIfPaidOrderId ? " WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'paid')" : ''}`)
    .bind(...values, ...(message.onlyIfPaidOrderId ? [message.onlyIfPaidOrderId] : []));
}

function logReview(id: string, reason: string): void {
  // No recipient, address, or message content belongs in application logs.
  console.error(JSON.stringify({ event: 'email_needs_review', outboxId: id, reason }));
}

async function markReview(env: Env, row: OutboxRow, reason: string): Promise<void> {
  await env.DB.prepare(`UPDATE email_outbox SET status = 'needs_review', last_error = ?,
    lease_until = NULL, lease_token = NULL WHERE id = ? AND lease_token = ?`)
    .bind(reason, row.id, row.lease_token).run();
  logReview(row.id, reason);
}

async function retry(env: Env, row: OutboxRow, reason: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (row.attempts >= MAX_ATTEMPTS || now - (row.first_attempt_at ?? now) >= RETRY_WINDOW_SECONDS) {
    await markReview(env, row, reason);
    return;
  }
  const delay = Math.min(3600, 60 * 2 ** (row.attempts - 1));
  await env.DB.prepare(`UPDATE email_outbox SET status = 'pending', next_attempt_at = ?,
    last_error = ?, lease_until = NULL, lease_token = NULL
    WHERE id = ? AND status = 'sending' AND lease_token = ?`)
    .bind(now + delay, reason, row.id, row.lease_token).run();
}

async function sendClaimed(env: Env, row: OutboxRow): Promise<void> {
  const allowedRecipient = row.kind === 'order' ? env.ORDER_EMAIL : row.kind === 'contact' ? env.SUPPORT_EMAIL : '';
  if (!allowedRecipient || row.recipient !== allowedRecipient) {
    await markReview(env, row, 'recipient_not_allowed');
    return;
  }
  if (row.kind === 'order') {
    const orderId = row.id.startsWith('order:') ? row.id.slice('order:'.length) : '';
    const order = orderId ? await env.DB.prepare('SELECT status FROM orders WHERE id = ?')
      .bind(orderId).first<{ status: string }>() : null;
    if (!order) {
      await markReview(env, row, 'order_association_missing');
      return;
    }
    if (order.status === 'refunded' || order.status === 'partially_refunded') {
      await env.DB.prepare(`UPDATE email_outbox SET status = 'suppressed', last_error = 'payment_refunded',
        lease_until = NULL, lease_token = NULL WHERE id = ? AND status = 'sending' AND lease_token = ?`)
        .bind(row.id, row.lease_token).run();
      return;
    }
    if (order.status !== 'paid') {
      await markReview(env, row, 'order_not_paid');
      return;
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `eitaware/outbox/${row.id}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM, to: [allowedRecipient], subject: row.subject,
        html: row.html, text: row.text, ...(row.reply_to ? { reply_to: row.reply_to } : {}),
      }),
    });
    if (!response.ok) {
      const reason = `provider_http_${response.status}`;
      if (response.status === 429 || response.status >= 500) await retry(env, row, reason);
      else await markReview(env, row, reason);
      return;
    }
    const value = await response.json() as { id?: unknown };
    if (typeof value.id !== 'string' || !value.id) {
      await retry(env, row, 'provider_response_ambiguous');
      return;
    }
    await env.DB.prepare(`UPDATE email_outbox SET status = 'sent', provider_id = ?,
      last_error = NULL, lease_until = NULL, lease_token = NULL
      WHERE id = ? AND status = 'sending' AND lease_token = ?`)
      .bind(value.id, row.id, row.lease_token).run();
  } catch {
    // The provider may have accepted an interrupted request. The stable key
    // ensures the retry uses its original result while still inside 24 hours.
    await retry(env, row, controller.signal.aborted ? 'provider_timeout' : 'provider_request_ambiguous');
  } finally {
    clearTimeout(timeout);
  }
}

/** Dispatch due messages. Safe for simultaneous request and Cron invocations. */
export async function flushOutbox(env: Env, id?: string): Promise<void> {
  if (env.EMAIL_READY !== 'true' || !env.RESEND_API_KEY || !env.EMAIL_FROM) return;
  const now = Math.floor(Date.now() / 1000);
  const due = `((status = 'pending' AND next_attempt_at <= ?) OR (status = 'sending' AND lease_until <= ?))`;
  const query = env.DB.prepare(`SELECT id FROM email_outbox WHERE ${due}${id ? ' AND id = ?' : ''}
    ORDER BY next_attempt_at, created_at LIMIT 20`);
  const result = await (id ? query.bind(now, now, id) : query.bind(now, now)).all<{ id: string }>();
  await Promise.all(result.results.map(async (candidate) => {
    const token = crypto.randomUUID();
    try {
      // UPDATE ... RETURNING claims one row atomically. An expired claim can be
      // recovered after a terminated Worker without losing the message.
      const row = await env.DB.prepare(`UPDATE email_outbox SET status = 'sending',
        attempts = attempts + 1, lease_until = ?, lease_token = ?,
        first_attempt_at = COALESCE(first_attempt_at, ?)
        WHERE id = ? AND ${due} RETURNING *`)
        .bind(now + LEASE_SECONDS, token, now, candidate.id, now, now).first<OutboxRow>();
      if (!row) return;
      if (row.attempts > MAX_ATTEMPTS || now - (row.first_attempt_at ?? now) >= RETRY_WINDOW_SECONDS) {
        await markReview(env, row, 'retry_limit_reached');
        return;
      }
      await sendClaimed(env, row);
    } catch {
      // A failed DB update leaves the lease recoverable; do not log PII/errors.
      console.error(JSON.stringify({ event: 'email_processing_failed', outboxId: candidate.id }));
    }
  }));
}
