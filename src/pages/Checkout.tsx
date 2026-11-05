import { Show, For, createSignal, onMount } from 'solid-js';
import { PRODUCT, DEFAULT_PRODUCT_ID, findProduct, type CatalogProduct, SHIPPING_STATES, STATE_NAMES, money } from '../shared/catalog';
import type { ApiError, CheckoutRequest, CheckoutResponse, ProductResponse } from '../shared/types';

const STORAGE_KEY = 'eitaware.checkout';
const emptyDraft: CheckoutRequest = { productId: DEFAULT_PRODUCT_ID, quantity: 1, email: '', name: '', address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: 'US' }, idempotencyKey: '' };

export default function Checkout() {
  const [selected, setSelected] = createSignal<CatalogProduct | undefined>(findProduct(DEFAULT_PRODUCT_ID));
  const product = () => selected() || PRODUCT;
  const [draft, setDraft] = createSignal<CheckoutRequest>({ ...emptyDraft, address: { ...emptyDraft.address } });
  const [reviewing, setReviewing] = createSignal(false);
  const [availability, setAvailability] = createSignal<ProductResponse | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const [fields, setFields] = createSignal<Record<string, string>>({});
  const [cancelled, setCancelled] = createSignal(false);
  let form: HTMLFormElement | undefined;

  function save(value: CheckoutRequest) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Private browsing may disable storage. */ }
  }
  function update(key: 'name' | 'email' | 'quantity', value: string | number) {
    const next = { ...draft(), [key]: value, idempotencyKey: '' };
    setDraft(next); save(next); setError('');
  }
  function address(key: keyof CheckoutRequest['address'], value: string) {
    const next = { ...draft(), address: { ...draft().address, [key]: value }, idempotencyKey: '' };
    setDraft(next); save(next); setError('');
  }
  onMount(async () => {
    let savedProductId: string | undefined;
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved.email === 'string' && saved.address && typeof saved.address.line1 === 'string') {
        savedProductId = saved.productId || DEFAULT_PRODUCT_ID;
        setDraft({ ...emptyDraft, ...saved, address: { ...emptyDraft.address, ...saved.address, country: 'US' } });
      }
    } catch { /* Ignore an invalid or unavailable session draft. */ }
    const params = new URLSearchParams(location.search);
    const requestedId = params.get('product') || (params.get('cancelled') === '1' ? savedProductId : undefined) || DEFAULT_PRODUCT_ID;
    const requested = findProduct(requestedId);
    if (!requested || requested.status !== 'available') { setSelected(undefined); setLoading(false); return; }
    setSelected(requested);
    const switched = draft().productId !== requested.id;
    const next = { ...draft(), productId: requested.id, quantity: switched ? 1 : draft().quantity, idempotencyKey: switched ? '' : draft().idempotencyKey };
    if (!Number.isInteger(next.quantity) || next.quantity < 1 || next.quantity > requested.maxQuantity) { next.quantity = 1; next.idempotencyKey = ''; }
    setDraft(next); save(next);
    const quantity = Number(params.get('quantity'));
    if (Number.isInteger(quantity) && quantity >= 1 && quantity <= product().maxQuantity && quantity !== draft().quantity) update('quantity', quantity);
    setCancelled(params.get('cancelled') === '1');
    try {
      const response = await fetch(`/api/product?id=${encodeURIComponent(requested.id)}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error('Unavailable');
      const current = await response.json() as ProductResponse;
      if (current.id !== requested.id || current.priceCents !== requested.priceCents || current.status !== 'available') throw new Error('Product changed');
      setAvailability(current);
    } catch { setAvailability(null); }
    finally { setLoading(false); }
  });

  function review(event: SubmitEvent) {
    event.preventDefault();
    if (!form?.reportValidity()) return;
    if (!Number.isInteger(draft().quantity) || draft().quantity < 1 || draft().quantity > product().maxQuantity) { setError(`Please choose between 1 and ${product().maxQuantity} ${product().quantityLabel.toLowerCase()}.`); return; }
    setError(''); setFields({}); setReviewing(true);
    document.getElementById('delivery-review')?.focus();
  }
  async function pay() {
    if (busy() || !availability()?.available) return;
    setBusy(true); setError(''); setFields({});
    const request = { ...draft(), idempotencyKey: draft().idempotencyKey || crypto.randomUUID() };
    setDraft(request); save(request);
    try {
      const response = await fetch('/api/checkout/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(35_000),
      });
      const body = await response.json() as CheckoutResponse & ApiError;
      if (!response.ok) {
        setFields(body.fields || {});
        if (body.code === 'checkout_expired') {
          const next = { ...request, idempotencyKey: '' };
          setDraft(next); save(next);
        }
        throw new Error(body.error || 'We couldn’t start checkout. Please try again.');
      }
      const checkoutUrl = new URL(body.checkoutUrl);
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') throw new Error('We couldn’t open secure checkout. Please contact us.');
      window.location.assign(checkoutUrl.href);
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'Checkout took a little longer than expected. Please try again; your order won’t be duplicated.');
      setBusy(false);
    }
  }

  return <main id="main-content" tabIndex={-1} class="page-shell checkout-page">
    <Show when={selected()} fallback={<div class="checkout-heading"><p class="eyebrow">The collection</p><h1 class="page-title">Something to look forward to.</h1><p class="page-intro">This item is not available for purchase. Explore our collection for current products and upcoming previews.</p><a class="button" href="/products">Explore the collection →</a></div>}><div class="checkout-heading"><p class="eyebrow">A little closer to your table</p><h1 class="page-title">Your order.</h1><p class="page-intro">Thoughtful pieces. Countless everyday moments.</p></div>
    <div class="checkout-layout">
      <div>
        <Show when={cancelled()}><p class="notice" role="status">Payment was cancelled. Your delivery details are saved here, so you can try again when you’re ready.</p></Show>
        <Show when={!loading() && !availability()?.available}><div class="notice"><p>Direct checkout is currently unavailable. Please contact us with any questions, or explore the collection.</p><Show when={product().amazonUrl}><a class="text-link" href={product().amazonUrl} target="_blank" rel="noopener noreferrer">Shop on Amazon ↗</a></Show></div></Show>
        <Show when={availability()?.checkoutMode === 'test'}><p class="notice" role="status">Test checkout — no real payment will be taken.</p></Show>
        <ol class="checkout-steps" aria-label="Checkout progress"><li classList={{ active: !reviewing() }}>01 · Delivery</li><li classList={{ active: reviewing() }}>02 · Review & pay</li></ol>
        <Show when={!reviewing()} fallback={<div class="delivery-review" id="delivery-review" tabIndex={-1}>
          <p class="eyebrow">Please check your delivery details</p><h2>Is everything in place?</h2>
          <div class="address-preview"><strong>{draft().name}</strong><span>{draft().address.line1}</span><Show when={draft().address.line2}><span>{draft().address.line2}</span></Show><span>{draft().address.city}, {draft().address.state} {draft().address.postalCode}</span><span>United States</span><span class="review-email">{draft().email}</span></div>
          <button class="text-link" type="button" onClick={() => { setReviewing(false); setError(''); }}>Edit delivery details</button>
          <p class="form-note">This is the address we’ll ship to. Your billing address can be different. Applicable sales tax will be calculated at secure checkout.</p>
          <button class="button checkout-pay" type="button" disabled={busy() || !availability()?.available} onClick={pay}>{busy() ? 'Opening secure checkout…' : 'Continue to secure payment'}<span aria-hidden="true">↗</span></button>
          <p class="form-note secure-note">Secure payment powered by Stripe. We never store your card details.</p>
        </div>}>
          <form ref={form} onSubmit={review} class="delivery-form">
            <h2>Where should we send it?</h2>
            <div class="form-grid">
              <div class="field"><label for="delivery-name">Full name</label><input id="delivery-name" name="name" autocomplete="shipping name" value={draft().name} onInput={e => update('name', e.currentTarget.value)} required maxLength={100} /></div>
              <div class="field"><label for="delivery-email">Email address</label><input id="delivery-email" name="email" type="email" autocomplete="email" value={draft().email} onInput={e => update('email', e.currentTarget.value)} required maxLength={254} /><small>Your payment receipt and order updates.</small></div>
              <div class="field form-full"><label for="delivery-line1">Street address</label><input id="delivery-line1" name="address-line1" autocomplete="shipping address-line1" value={draft().address.line1} onInput={e => address('line1', e.currentTarget.value)} required maxLength={150} /></div>
              <div class="field form-full"><label for="delivery-line2">Apartment, suite, etc. <span>(optional)</span></label><input id="delivery-line2" name="address-line2" autocomplete="shipping address-line2" value={draft().address.line2 || ''} onInput={e => address('line2', e.currentTarget.value)} maxLength={150} /></div>
              <div class="field"><label for="delivery-city">City</label><input id="delivery-city" name="city" autocomplete="shipping address-level2" value={draft().address.city} onInput={e => address('city', e.currentTarget.value)} required maxLength={100} /></div>
              <div class="field"><label for="delivery-state">State</label><select id="delivery-state" name="state" autocomplete="shipping address-level1" value={draft().address.state} onChange={e => address('state', e.currentTarget.value)} required><option value="">Select your state</option><For each={SHIPPING_STATES}>{state => <option value={state}>{STATE_NAMES[state]}</option>}</For></select></div>
              <div class="field"><label for="delivery-zip">ZIP code</label><input id="delivery-zip" name="postal-code" autocomplete="shipping postal-code" inputmode="numeric" pattern="[0-9]{5}(-[0-9]{4})?" value={draft().address.postalCode} onInput={e => address('postalCode', e.currentTarget.value)} required maxLength={10} /></div>
              <div class="field"><label for="delivery-country">Country</label><input id="delivery-country" value="United States" readOnly autocomplete="shipping country-name" /><small>Lower 48 states and Washington, D.C.</small></div>
            </div>
            <p class="form-note">By continuing, you agree to our <a href="/terms">terms of sale</a> and acknowledge our <a href="/privacy">privacy policy</a>.</p>
            <button class="button" type="submit" disabled={loading() || !availability()?.available}>{loading() ? 'Checking availability…' : 'Review delivery details'}<span aria-hidden="true">→</span></button>
          </form>
        </Show>
        <Show when={error()}><div class="field-error checkout-error" role="alert"><p>{error()}</p><For each={Object.entries(fields())}>{([name, message]) => <p>{name.replace('address.', '')}: {message}</p>}</For></div></Show>
      </div>
      <aside class="order-summary" aria-label="Order summary">
        <div class="summary-product-image"><img src={product().image} alt={product().name} width="1251" height="848" /></div>
        <p class="eyebrow">Your selection</p><h2>{product().name}</h2><p>{product().subtitle}</p>
        <div class="summary-quantity"><label for="order-quantity">{product().quantityLabel}</label><input id="order-quantity" type="number" min="1" max={product().maxQuantity} step="1" value={draft().quantity} disabled={busy()} onInput={e => { update('quantity', Number(e.currentTarget.value)); setReviewing(false); }} /></div>
        <dl class="summary-totals"><div><dt>Subtotal</dt><dd>{money((product().priceCents || 0) * draft().quantity)}</dd></div><div><dt>Standard shipping</dt><dd>Complimentary</dd></div><div><dt>Sales tax</dt><dd>At payment</dd></div><div class="summary-total"><dt>Total before tax</dt><dd>{money((product().priceCents || 0) * draft().quantity)}</dd></div></dl>
        <p class="form-note">Orders processed within 1–2 business days. We’ll send tracking when your order ships.</p><a class="text-link" href="/shipping-returns">Shipping & returns →</a>
      </aside>
    </div></Show>
  </main>;
}
