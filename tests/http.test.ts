import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { app } from '../src/server/index';
import { stripePaymentLink } from '../src/shared/payments';
import { CATALOG, PRODUCT } from '../src/shared/catalog';
import { createTestEnv } from './support/env';

const originalProduct = structuredClone(PRODUCT);
const originalLength = CATALOG.products.length;
afterEach(() => {
  vi.unstubAllGlobals();
  CATALOG.products.length = originalLength;
  for (const key of Object.keys(PRODUCT)) if (!(key in originalProduct)) delete (PRODUCT as unknown as Record<string, unknown>)[key];
  Object.assign(PRODUCT, structuredClone(originalProduct));
});
describe('HTTP boundary without storage', () => {
  it('redirects www and production HTTP to the canonical origin', async () => {
    const env = createTestEnv({ ENVIRONMENT: 'production', SITE_URL: 'https://eitaware.com' });
    const www = await app.fetch(new Request('https://www.eitaware.com/products?source=nav'), env);
    expect(www.status).toBe(308); expect(www.headers.get('Location')).toBe('https://eitaware.com/products?source=nav');
    const http = await app.fetch(new Request('http://eitaware.com/contact'), env);
    expect(http.status).toBe(308); expect(http.headers.get('Location')).toBe('https://eitaware.com/contact');
  });
  it.each(['/checkout', '/checkout/', `/checkout?product=${PRODUCT.id}&quantity=2&cancelled=1`, '/checkout/?redirect=https://unrelated.example'])('redirects %s to the product-configured Payment Link', async path => {
    const response = await app.fetch(new Request(`https://eitaware.com${path}`), createTestEnv());
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(stripePaymentLink(PRODUCT));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
  it('rejects cross-origin, non-JSON, and oversized contact submissions before sending', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const env = createTestEnv({ SITE_URL: 'https://eitaware.com' });
    const post = (origin: string, type: string, body = '{}') => app.fetch(new Request('https://eitaware.com/api/contact', { method: 'POST', headers: { Origin: origin, 'Content-Type': type }, body }), env);
    expect((await post('https://unrelated.example', 'application/json')).status).toBe(403);
    expect((await post('https://eitaware.com', 'text/plain')).status).toBe(415);
    expect((await post('https://eitaware.com', 'application/json', 'a'.repeat(40_000))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['/api/product', '/api/checkout/status?session_id=old', '/api/checkout/session', '/api/stripe/webhook'])('returns 404 for removed endpoint %s', async path => {
    const method = path.endsWith('/session') || path.endsWith('/webhook') ? 'POST' : 'GET';
    const response = await app.fetch(new Request(`https://eitaware.com${path}`, { method }), createTestEnv());
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('keeps the thank-you page private to crawlers and uncached', async () => {
    const page = await app.fetch(new Request('https://eitaware.com/order-confirmation?session_id=old'), createTestEnv());
    expect(page.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(page.headers.get('Cache-Control')).toBe('no-store');
  });
  it('retains staging noindex, security headers, and health checks', async () => {
    const env = createTestEnv({ ENVIRONMENT: 'staging' });
    const page = await app.fetch(new Request('https://eitaware.com/'), env);
    expect(page.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(page.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const api = await app.fetch(new Request('https://eitaware.com/api/health'), env);
    expect(api.headers.get('Cache-Control')).toBe('no-store');
    expect(await api.json()).toEqual({ ok: true });
    expect(Object.keys(worker)).toEqual(['fetch']);
  });
});


describe('catalog-aware legacy checkout', () => {
  it('uses each product’s own link and discards caller-supplied destination and quantity', async () => {
    const second = { ...PRODUCT, id: 'green-set', slug: 'green-set', payments: { stripePaymentLink: 'https://buy.stripe.com/test_green' } };
    CATALOG.products.push(second);
    for (const product of [PRODUCT, second]) {
      const response = await app.fetch(new Request(`https://eitaware.com/checkout?product=${product.id}&quantity=3&cancelled=1&redirect=https://unrelated.example`), createTestEnv());
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe(product.payments!.stripePaymentLink);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });
  it.each(['sold-out', 'coming-soon'] as const)('routes %s products to details even when they still have a Stripe URL', async status => {
    PRODUCT.status = status;
    for (const path of ['/checkout', `/checkout/?product=${PRODUCT.id}`]) {
      const response = await app.fetch(new Request(`https://eitaware.com${path}`), createTestEnv());
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe(`/products/${PRODUCT.slug}`);
    }
    expect(stripePaymentLink(PRODUCT)).toBeUndefined();
  });
  it.each(['unknown-product', '', 'https://unrelated.example'])('routes unknown product %s to the collection', async id => {
    const response = await app.fetch(new Request(`https://eitaware.com/checkout?product=${encodeURIComponent(id)}`), createTestEnv());
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/products');
  });
  it('does not expose a draft through a checkout bookmark', async () => {
    CATALOG.products.push({ ...PRODUCT, id: 'draft-set', slug: 'draft-set', status: 'draft' });
    const response = await app.fetch(new Request('https://eitaware.com/checkout?product=draft-set'), createTestEnv());
    expect(response.headers.get('Location')).toBe('/products');
  });
});
