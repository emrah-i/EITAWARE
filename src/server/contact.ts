import type { Hono } from 'hono';
import type { Env } from './env';
import { validateContact } from './validation';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

export function registerContactRoutes(app: Hono<{ Bindings: Env }>): void {
  app.post('/api/contact', async c => {
    const env = c.env;
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: `contact:${ip}` })).success) {
      return c.json({ error: 'Please wait a moment before trying again.' }, 429);
    }
    const raw = await c.req.text();
    if (new TextEncoder().encode(raw).byteLength > 16_384) {
      return c.json({ error: 'Your message is too long.' }, 413);
    }
    let input: unknown;
    try { input = JSON.parse(raw); } catch {
      return c.json({ error: 'Please submit a valid contact form.' }, 400);
    }
    if (input && typeof input === 'object' && 'website' in input && typeof input.website === 'string' && input.website.trim()) {
      return c.json({ accepted: true, reference: 'received' }, 202);
    }
    const validation = validateContact(input);
    if (!validation.ok) return c.json({ error: validation.error, fields: validation.fields }, 400);
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.SUPPORT_EMAIL) {
      return c.json({ error: 'The contact form is temporarily unavailable. Please email support@eitaware.com.' }, 503);
    }
    const data = validation.value;
    // The same form retry must produce the same reference, body, and provider key.
    const reference = data.idempotencyKey;
    const text = `Message reference: ${reference}\nName: ${data.name}\nEmail: ${data.email}\nSubject: ${data.subject}\n\n${data.message}`;
    const html = `<h1>Website contact message</h1><p><strong>Reference:</strong> ${reference}</p><p><strong>Name:</strong> ${escapeHtml(data.name)}<br><strong>Email:</strong> ${escapeHtml(data.email)}<br><strong>Subject:</strong> ${escapeHtml(data.subject)}</p><p style="white-space:pre-wrap">${escapeHtml(data.message)}</p>`;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `eitaware/contact/${reference}`,
        },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [env.SUPPORT_EMAIL], reply_to: data.email, subject: `EITAWARE contact: ${data.subject}`, text, html }),
      });
      if (response.status === 409) {
        const error = await response.json() as { name?: unknown };
        if (error.name === 'invalid_idempotent_request') {
          return c.json({ error: 'This submission changed. Please try submitting your message again.' }, 409);
        }
      }
      if (!response.ok) throw new Error('Email was not accepted.');
      const result = await response.json() as { id?: unknown };
      if (typeof result.id !== 'string' || !result.id) throw new Error('Email acceptance could not be verified.');
      return c.json({ accepted: true, reference }, 202);
    } catch {
      return c.json({ error: 'We could not confirm your message was sent. Please retry or email support@eitaware.com.' }, 503);
    }
  });
}
