import assert from 'node:assert/strict';
import { CATALOG, stripePaymentLink } from '../dist/server/entry-server.js';

const current = CATALOG.products.find(product => product.id === 'eitaware-dark-blue-12');
const base = process.env.EITAWARE_TEST_URL || 'http://127.0.0.1:8787';
const routes = ['/', '/products', '/products/everyday-set-dark-blue', '/contact', '/faq', '/privacy', '/terms', '/shipping-returns', '/order-confirmation'];
for (const route of routes) {
  const response = await fetch(`${base}${route}`);
  assert.equal(response.status, 200, route);
  const html = await response.text();
  assert.match(html, /EITAWARE/);
  assert.match(html, /main-content/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  if (route.startsWith('/products')) { assert.match(html, /application\/ld\+json/); assert.match(html, /\$79\.99\b/); }
  if (route === '/order-confirmation') {
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  }
}
assert.equal((await fetch(`${base}/not-a-real-page`)).status, 404);
for (const path of ['/checkout', '/checkout/', `/checkout?product=${current.id}&quantity=2`]) {
  const response = await fetch(`${base}${path}`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), stripePaymentLink(current));
  assert.equal(response.headers.get('cache-control'), 'no-store');
}
const unknown = await fetch(`${base}/checkout?product=unknown`, { redirect: 'manual' });
assert.equal(unknown.status, 302);
assert.equal(unknown.headers.get('location'), '/products');
for (const path of ['/api/product', '/api/checkout/status?session_id=invalid', '/api/checkout/session', '/api/stripe/webhook']) {
  const method = path.endsWith('/session') || path.endsWith('/webhook') ? 'POST' : 'GET';
  assert.equal((await fetch(`${base}${path}`, { method })).status, 404);
}
const post = (body, origin = base) => fetch(`${base}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
assert.equal((await post({}, 'https://unrelated.example')).status, 403);
assert.equal((await post({})).status, 400);
assert.equal((await post({ message: 'a'.repeat(40_000) })).status, 413);
// No valid email is submitted here: smoke checks must never send real messages.
assert.equal((await post({ website: 'spam.example.com' })).status, 202);
console.log('Local Worker smoke checks passed: nine pages, plain purchase links, legacy redirects, thank-you headers, removed APIs, contact abuse protection, and no database. No payments or emails created.');
