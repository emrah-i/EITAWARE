import assert from 'node:assert/strict';

const base = process.env.EITAWARE_TEST_URL || 'http://127.0.0.1:8787';
const routes = ['/', '/products', '/products/everyday-set-dark-blue', '/contact', '/faq', '/privacy', '/terms', '/shipping-returns', '/checkout', '/order-confirmation'];
for (const route of routes) {
  const response = await fetch(`${base}${route}`);
  assert.equal(response.status, 200, route);
  const html = await response.text();
  assert.match(html, /EITAWARE/);
  assert.match(html, /main-content/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  if (route.startsWith('/products')) { assert.match(html, /application\/ld\+json/); assert.match(html, /\$79\.99\b/); }
}
assert.equal((await fetch(`${base}/not-a-real-page`)).status, 404);
const product = await (await fetch(`${base}/api/product`)).json();
assert.equal(product.priceCents, 7999);
assert.equal(product.available, false, 'This smoke test expects direct checkout disabled.');
const post = (path, body, origin = base) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
assert.equal((await post('/api/checkout/session', {}, 'https://unrelated.example')).status, 403);
assert.equal((await post('/api/checkout/session', {})).status, 400);
assert.equal((await post('/api/checkout/session', { message: 'a'.repeat(40_000) })).status, 413);
const validCheckout = { quantity: 1, name: 'Local Test', email: 'test@example.com', address: { line1: '123 Main Street', city: 'Baltimore', state: 'MD', postalCode: '21201', country: 'US' }, idempotencyKey: crypto.randomUUID() };
assert.equal((await post('/api/checkout/session', validCheckout)).status, 503);
assert.equal((await post('/api/contact', { name: 'Local Test', email: 'test@example.com', subject: 'Local smoke test', message: 'This message must not be sent externally.', idempotencyKey: crypto.randomUUID() })).status, 503);
assert.equal((await fetch(`${base}/api/checkout/status?session_id=invalid`)).status, 404);
console.log('Local Worker smoke checks passed: 10 pages, SEO HTML, security headers, 404, price, unavailable checkout/contact, validation, origin/body limits. No external payments or messages created.');
