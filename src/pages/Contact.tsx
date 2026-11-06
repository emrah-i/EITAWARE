import EmailText from '../components/EmailText';
import { createSignal, Show } from 'solid-js';
import { amazonUrl } from '../shared/amazon';
import { BRAND } from '../shared/catalog';
import type { ApiError, ContactRequest, ContactResponse } from '../shared/types';

const STORAGE_KEY = 'eitaware:contact-submission';

export default function Contact() {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const [fields, setFields] = createSignal<Record<string, string>>({});
  const [reference, setReference] = createSignal('');
  let remembered: { hash: string; key: string } | undefined;

  async function submissionKey(value: Omit<ContactRequest, 'idempotencyKey'>): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
    const hash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) remembered = JSON.parse(saved);
    } catch { /* Browser storage may be disabled. The in-memory key still covers retries. */ }
    if (remembered?.hash !== hash || typeof remembered?.key !== 'string') remembered = { hash, key: crypto.randomUUID() };
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(remembered)); } catch { /* Optional persistence. */ }
    return remembered!.key;
  }

  async function submit(event: SubmitEvent & { currentTarget: HTMLFormElement }): Promise<void> {
    event.preventDefault();
    if (busy()) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const value = {
      name: String(values.get('name') || '').trim(), email: String(values.get('email') || '').trim(),
      subject: String(values.get('subject') || '').trim(), message: String(values.get('message') || '').trim(),
      website: String(values.get('website') || ''),
    };
    setBusy(true); setError(''); setFields({});
    try {
      const idempotencyKey = await submissionKey(value);
      const response = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...value, idempotencyKey }),
        signal: AbortSignal.timeout(25_000),
      });
      const result = await response.json() as ContactResponse & ApiError;
      if (response.ok && result.accepted === true && result.reference) {
        setReference(result.reference);
        remembered = undefined;
        try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Optional persistence. */ }
        form.reset();
      } else {
        setError(result.error || 'We could not save your message. Please try again or email our team.');
        setFields(result.fields || {});
        if (response.status === 409) {
          remembered = undefined;
          try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Optional persistence. */ }
        }
      }
    } catch {
      setError('We could not confirm that your message was received. Please retry this form, or email our team for help.');
    } finally { setBusy(false); }
  }

  return (
    <main id="main-content" tabIndex={-1} class="page-shell contact-page">
      <header class="page-intro" data-reveal-group="">
        <p class="eyebrow">Customer care</p>
        <h1>We’re here to help</h1>
        <p>Questions about your dinnerware, an order, or something else? Send us a note.</p>
      </header>
      <div class="contact-layout">
        <aside class="contact-details" data-reveal-group="">
          <h2>Get in touch</h2>
          <p><a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a></p>
          <p>For an existing order, include your order reference so we can find the details.</p>
          <p>For Amazon purchases, you can also find order support in your Amazon account.</p>
          <a class="button-secondary amazon-cta" href={amazonUrl('contactPage')} target="_blank" rel="noopener">Visit us on Amazon <span aria-hidden="true">↗</span></a>
        </aside>
        <section aria-label="Contact form">
          <Show when={reference()} fallback={
            <form onSubmit={submit} aria-busy={busy()}>
              <div class="contact-fields" data-reveal-group=""><div class="form-grid">
                <div class="field">
                  <label for="contact-name">Name <span aria-hidden="true">*</span></label>
                  <input id="contact-name" name="name" autocomplete="name" required minlength="2" maxlength="100" aria-invalid={!!fields().name} aria-describedby={fields().name ? 'contact-name-error' : undefined} />
                  <Show when={fields().name}><p class="field-error" id="contact-name-error">{fields().name}</p></Show>
                </div>
                <div class="field">
                  <label for="contact-email">Email <span aria-hidden="true">*</span></label>
                  <input id="contact-email" name="email" type="email" autocomplete="email" required maxlength="254" aria-invalid={!!fields().email} aria-describedby={fields().email ? 'contact-email-error' : undefined} />
                  <Show when={fields().email}><p class="field-error" id="contact-email-error">{fields().email}</p></Show>
                </div>
              </div>
              <div class="field">
                <label for="contact-subject">Subject <span aria-hidden="true">*</span></label>
                <input id="contact-subject" name="subject" required minlength="2" maxlength="150" aria-invalid={!!fields().subject} aria-describedby={fields().subject ? 'contact-subject-error' : undefined} />
                <Show when={fields().subject}><p class="field-error" id="contact-subject-error">{fields().subject}</p></Show>
              </div>
              <div class="field">
                <label for="contact-message">Message <span aria-hidden="true">*</span></label>
                <textarea id="contact-message" name="message" required minlength="10" maxlength="5000" rows="7" aria-invalid={!!fields().message} aria-describedby={fields().message ? 'contact-message-error' : 'contact-message-note'} />
                <Show when={fields().message}><p class="field-error" id="contact-message-error">{fields().message}</p></Show>
                <p class="form-note" id="contact-message-note">Please leave out card numbers and other sensitive payment details.</p>
              </div>
              <div class="form-honeypot" aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}>
                <label for="contact-website">Leave this field empty</label>
                <input id="contact-website" aria-hidden="true" name="website" tabindex="-1" autocomplete="off" />
              </div>
              </div>
              <Show when={error()}><p class="notice" role="alert"><EmailText text={error()} /></p></Show>
              <div class="contact-actions" data-reveal-group=""><p class="form-note">We use your details to respond to your message. Read our <a href="/privacy">privacy policy</a>.</p>
              <button type="submit" class="button" disabled={busy()}>{busy() ? 'Sending…' : 'Send message'}</button>
              </div>
            </form>
          }>
            <div class="notice" role="status" aria-live="polite">
              <h2>Thank you for your note</h2>
              <p>Your message has been received. Our team will reply by email.</p>
              <p class="form-note">Reference: {reference()}</p>
              <button type="button" class="button-secondary" onClick={() => setReference('')}>Send another message</button>
            </div>
          </Show>
        </section>
      </div>
    </main>
  );
}
