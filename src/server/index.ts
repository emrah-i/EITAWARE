import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Env } from './env';
import { registerCheckoutRoutes } from './checkout';
import { registerContactRoutes } from './contact';
import { flushOutbox } from './notifications';

export const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname === 'www.eitaware.com') {
    url.hostname = 'eitaware.com'; url.protocol = 'https:';
    return c.redirect(url.toString(), 308);
  }
  if (c.env?.ENVIRONMENT === 'production' && url.protocol !== 'https:') {
    url.protocol = 'https:';
    return c.redirect(url.toString(), 308);
  }
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  if (c.env?.ENVIRONMENT === 'staging') c.header('X-Robots-Tag', 'noindex, nofollow');
  if (url.pathname.startsWith('/api/')) c.header('Cache-Control', 'no-store');
});
app.use('/api/*', bodyLimit({ maxSize: 32_768, onError: c => c.json({ error: 'This request is too large.' }, 413) }));
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.path !== '/api/stripe/webhook') {
    const origin = c.req.header('Origin');
    const expected = new URL(c.env.SITE_URL || c.req.url).origin;
    const local = c.env.ENVIRONMENT !== 'production' && origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!origin || (origin !== expected && !local)) return c.json({ error: 'Please submit this form from the EITAWARE website.' }, 403);
    if (!c.req.header('Content-Type')?.startsWith('application/json')) return c.json({ error: 'Please send a JSON request.' }, 415);
  }
  await next();
});
registerCheckoutRoutes(app);
registerContactRoutes(app);
app.get('/api/health', c => c.json({ ok: true }));
app.all('/api/*', c => c.json({ error: 'This endpoint does not exist.' }, 404));
app.all('*', c => c.env.ASSETS.fetch(c.req.raw));
app.onError((error, c) => {
  console.error(JSON.stringify({ event: 'request_failed', path: c.req.path, name: error.name }));
  return c.json({ error: 'We couldn’t complete that request. Please try again or contact support@eitaware.com.' }, 503);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(flushOutbox(env));
  },
} satisfies ExportedHandler<Env>;
