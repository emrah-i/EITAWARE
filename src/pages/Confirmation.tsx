import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { BRAND, money } from '../shared/catalog';
import type { CheckoutStatusResponse } from '../shared/types';

export default function Confirmation() {
  const [order, setOrder] = createSignal<CheckoutStatusResponse | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const controller = new AbortController();
  async function check(attempt = 0) {
    const sessionId = new URLSearchParams(location.search).get('session_id');
    if (!sessionId || !/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) { setError('We couldn’t find a checkout session. Please check your payment receipt or contact us.'); setLoading(false); return; }
    try {
      const response = await fetch(`/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('We couldn’t confirm the payment status here. Please check your Stripe receipt before trying another payment, or contact us.');
      const value = await response.json() as CheckoutStatusResponse;
      if (stopped) return;
      setOrder(value); setError('');
      if (['paid', 'refunded', 'partially_refunded'].includes(value.status)) { try { sessionStorage.removeItem('eitaware.checkout'); } catch { /* Storage may be disabled. */ } }
      else if (value.status === 'pending' && attempt < 12) timer = setTimeout(() => check(attempt + 1), 2_500);
    } catch (cause) { if (!stopped) setError(cause instanceof Error ? cause.message : 'Please contact us to confirm your order.'); }
    finally { if (!stopped) setLoading(false); }
  }
  onMount(() => check());
  onCleanup(() => { stopped = true; clearTimeout(timer); controller.abort(); });
  return <main id="main-content" tabIndex={-1} class="page-shell confirmation-page">
    <div class="confirmation-mark" aria-hidden="true">{order()?.status === 'paid' ? '✓' : '—'}</div>
    <p class="eyebrow">EITAWARE · Your order</p>
    <h1 class="page-title">{order()?.status === 'paid' ? 'A place at your table.' : order()?.status === 'refunded' ? 'Your payment was refunded.' : order()?.status === 'partially_refunded' ? 'Your payment was updated.' : order()?.status === 'expired' ? 'Your checkout has expired.' : 'Confirming your order.'}</h1>
    <Show when={loading()}><p role="status">We’re checking your payment securely.</p></Show>
    <Show when={order()?.status === 'paid'}><div class="confirmation-content"><p class="page-intro">Thank you for bringing EITAWARE home. Your payment is confirmed.</p><dl class="confirmation-details"><div><dt>Order reference</dt><dd>{order()?.orderReference}</dd></div><Show when={order()?.totalCents !== undefined}><div><dt>Paid</dt><dd>{money(order()!.totalCents!, order()?.currency?.toUpperCase())}</dd></div></Show></dl><p>We’ll process your order within 1–2 business days. Your payment receipt will arrive by email, followed by tracking when your set ships.</p></div></Show>
    <Show when={order()?.status === 'refunded' || order()?.status === 'partially_refunded'}><div class="confirmation-content"><p class="page-intro">{order()?.status === 'refunded' ? 'A full refund has been recorded for this order. Your payment provider determines when the credit appears.' : 'A partial refund has been recorded for this order. Please contact our team if you need an update on the remaining order.'}</p><dl class="confirmation-details"><div><dt>Order reference</dt><dd>{order()?.orderReference}</dd></div><Show when={order()?.totalCents !== undefined}><div><dt>Original payment</dt><dd>{money(order()!.totalCents!, order()?.currency?.toUpperCase())}</dd></div></Show></dl><p>Check your Stripe receipt for refund details, or email us with your order reference.</p></div></Show>
    <Show when={order()?.status === 'pending'}><div class="notice" role="status">Payment confirmation is still on its way. Please check your payment receipt before paying again. You can refresh the status below or contact us with your receipt.</div><button class="button-secondary" type="button" onClick={() => check()}>Check status again</button></Show>
    <Show when={order()?.status === 'expired'}><p>No confirmed payment was recorded for this session. Return to checkout to start again.</p><a class="button" href="/checkout">Return to checkout →</a></Show>
    <Show when={error()}><p class="notice" role="alert">{error()}</p><button class="button-secondary" type="button" onClick={() => check()}>Check status again</button></Show>
    <p class="form-note">Need a hand? <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a></p><a class="text-link" href="/products">Back to the collection →</a>
  </main>;
}
