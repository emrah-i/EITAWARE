import type { Hono } from 'hono';
import type { Env } from './env';
import { escapeHtml, flushOutbox, prepareOutboxInsert } from './notifications';
import { hashValue, validateContact } from './validation';

interface ContactRecord { id: string; request_hash: string; }

export function registerContactRoutes(app: Hono<{ Bindings: Env }>): void {
  app.post('/api/contact', async (context) => {
    const env = context.env;
    const ip = context.req.header('CF-Connecting-IP') || 'unknown';
    if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: `contact:${ip}` })).success) {
      return context.json({ error: 'Please wait a moment before trying again.' }, 429);
    }
    const raw = await context.req.text();
    if (new TextEncoder().encode(raw).byteLength > 16_384) {
      return context.json({ error: 'Your message is too long.' }, 413);
    }
    let input: unknown;
    try { input = JSON.parse(raw); } catch {
      return context.json({ error: 'Please submit a valid contact form.' }, 400);
    }
    if (input && typeof input === 'object' && 'website' in input && typeof input.website === 'string' && input.website.trim()) {
      return context.json({ accepted: true, reference: 'received' }, 202);
    }
    const validation = validateContact(input);
    if (!validation.ok) return context.json({ error: validation.error, fields: validation.fields }, 400);
    const data = validation.value;
    const requestHash = await hashValue({ name: data.name, email: data.email, subject: data.subject, message: data.message });
    const existing = await env.DB.prepare('SELECT id, request_hash FROM contact_messages WHERE idempotency_key = ?')
      .bind(data.idempotencyKey).first<ContactRecord>();
    if (existing) {
      if (existing.request_hash !== requestHash) return context.json({ error: 'This submission changed. Refresh the page and try again.' }, 409);
      context.executionCtx.waitUntil(flushOutbox(env, `contact:${existing.id}`));
      return context.json({ accepted: true, reference: existing.id }, 202);
    }
    if (env.EMAIL_READY !== 'true' || !env.RESEND_API_KEY || !env.EMAIL_FROM || !env.SUPPORT_EMAIL) {
      return context.json({ error: 'The contact form is temporarily unavailable. Please email support@eitaware.com.' }, 503);
    }
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const subject = `EITAWARE contact: ${data.subject}`;
    const text = `Message reference: ${id}\nName: ${data.name}\nEmail: ${data.email}\nSubject: ${data.subject}\n\n${data.message}`;
    const html = `<h1>Website contact message</h1><p><strong>Reference:</strong> ${id}</p><p><strong>Name:</strong> ${escapeHtml(data.name)}<br><strong>Email:</strong> ${escapeHtml(data.email)}<br><strong>Subject:</strong> ${escapeHtml(data.subject)}</p><p style="white-space:pre-wrap">${escapeHtml(data.message)}</p>`;
    try {
      // D1 batches are transactional: acceptance guarantees both the message
      // and its notification survived, even if sending must be retried later.
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO contact_messages
          (id, idempotency_key, request_hash, name, email, subject, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, data.idempotencyKey, requestHash, data.name, data.email, data.subject, data.message, now),
        prepareOutboxInsert(env, { id: `contact:${id}`, kind: 'contact', recipient: env.SUPPORT_EMAIL, subject, html, text, replyTo: data.email }, now),
      ]);
    } catch {
      // Two identical requests may race on the unique idempotency key.
      const raced = await env.DB.prepare('SELECT id, request_hash FROM contact_messages WHERE idempotency_key = ?')
        .bind(data.idempotencyKey).first<ContactRecord>();
      if (raced?.request_hash === requestHash) {
        context.executionCtx.waitUntil(flushOutbox(env, `contact:${raced.id}`));
        return context.json({ accepted: true, reference: raced.id }, 202);
      }
      if (raced) return context.json({ error: 'This submission changed. Refresh the page and try again.' }, 409);
      return context.json({ error: 'We could not save your message. Please try again or email support@eitaware.com.' }, 503);
    }
    context.executionCtx.waitUntil(flushOutbox(env, `contact:${id}`));
    return context.json({ accepted: true, reference: id }, 202);
  });
}
