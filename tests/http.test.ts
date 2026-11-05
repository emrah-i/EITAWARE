import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../src/server/index';
import type { Env } from '../src/server/env';
import { createTestEnv, type TestD1 } from './support/d1';

const databases: TestD1[] = [];
afterEach(() => { databases.splice(0).forEach(db => db.close()); });
function setup(overrides: Partial<Env> = {}) {
  const { env, db } = createTestEnv(overrides); databases.push(db);
  env.ASSETS = { fetch: async () => new Response('<!doctype html><title>EITAWARE</title>', { headers: { 'Content-Type': 'text/html' } }) } as unknown as Env['ASSETS'];
  return env;
}
describe('HTTP boundary', () => {
  it('redirects www and production HTTP before serving forms', async () => {
    const env = setup({ ENVIRONMENT: 'production', SITE_URL: 'https://eitaware.com' });
    const www = await app.fetch(new Request('https://www.eitaware.com/products?quantity=2'), env);
    expect(www.status).toBe(308); expect(www.headers.get('Location')).toBe('https://eitaware.com/products?quantity=2');
    const http = await app.fetch(new Request('http://eitaware.com/contact'), env);
    expect(http.status).toBe(308); expect(http.headers.get('Location')).toBe('https://eitaware.com/contact');
  });
  it('rejects cross-origin and non-JSON form submissions before writes', async () => {
    const env = setup({ SITE_URL: 'https://eitaware.com' });
    const cross = await app.fetch(new Request('https://eitaware.com/api/contact', { method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' }, body: '{}' }), env);
    expect(cross.status).toBe(403);
    const plain = await app.fetch(new Request('https://eitaware.com/api/contact', { method: 'POST', headers: { Origin: 'https://eitaware.com', 'Content-Type': 'text/plain' }, body: '{}' }), env);
    expect(plain.status).toBe(415);
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM contact_messages').first<{ count: number }>())?.count).toBe(0);
  });
  it('adds staging noindex and API no-store headers', async () => {
    const env = setup({ ENVIRONMENT: 'staging' });
    const page = await app.fetch(new Request('https://eitaware.com/'), env);
    expect(page.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(page.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const api = await app.fetch(new Request('https://eitaware.com/api/health'), env);
    expect(api.headers.get('Cache-Control')).toBe('no-store');
    expect(await api.json()).toEqual({ ok: true });
  });
});
