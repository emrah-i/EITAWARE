import type { Hono } from 'hono';
import type { Env } from './env';
import { validateContact } from './validation';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

const INTERNAL_RECIPIENTS = ['support@eitaware.com', 'msqware.official@gmail.com'];
interface EmailMessage { from: string; to: string[]; reply_to: string; subject: string; text: string; html: string; }
class IdempotencyConflict extends Error {}

async function sendEmail(env: Env, message: EmailMessage, key: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(message),
  });
  if (response.status === 409) {
    const error = await response.json() as { name?: unknown } | null;
    if (error?.name === 'invalid_idempotent_request') throw new IdempotencyConflict();
  }
  if (!response.ok) throw new Error('Email was not accepted.');
  const result = await response.json() as { id?: unknown } | null;
  if (typeof result?.id !== 'string' || !result.id) throw new Error('Email acceptance could not be verified.');
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
      await sendEmail(env, {
        from: env.EMAIL_FROM, to: INTERNAL_RECIPIENTS, reply_to: data.email,
        subject: `EITAWARE contact: ${data.subject}`, text, html,
      }, `eitaware/contact/internal/${reference}`);
    } catch (error) {
      if (error instanceof IdempotencyConflict) {
        return c.json({ error: 'This submission changed. Please try submitting your message again.' }, 409);
      }
      return c.json({ error: 'We could not confirm your message was sent. Please retry or email support@eitaware.com.' }, 503);
    }
    // Only acknowledge a contact request after the team's notification is accepted.
    const acknowledgmentText = `Hi ${data.name},\n\nYour contact request is confirmed. We’ve received your message about “${data.subject}”. Our team will reply by email.\n\nReference: ${reference}\n\nIf you need to add anything, reply to this email.\n\nEITAWARE`;
    const acknowledgmentHtml = `<h1>Your contact request is confirmed</h1><p>Hi ${escapeHtml(data.name)},</p><p>We’ve received your message about “${escapeHtml(data.subject)}”. Our team will reply by email.</p><p><strong>Reference:</strong> ${reference}</p><p>If you need to add anything, reply to this email.</p><p>EITAWARE</p>`;
    try {
      await sendEmail(env, {
        from: env.EMAIL_FROM, to: [data.email], reply_to: env.SUPPORT_EMAIL,
        subject: 'We’ve received your message — EITAWARE', text: acknowledgmentText, html: acknowledgmentHtml,
      }, `eitaware/contact/acknowledgment/${reference}`);
      return c.json({ accepted: true, reference, acknowledgmentSent: true }, 202);
    } catch {
      // The team has the message. Never ask the visitor to submit it again solely
      // because the courtesy acknowledgment failed; no background queue is used.
      return c.json({ accepted: true, reference, acknowledgmentSent: false }, 202);
    }
  });
}
