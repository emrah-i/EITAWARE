import { spawnSync } from 'node:child_process';
import Stripe from 'stripe';

const args = process.argv.slice(2);
const environment = args[args.indexOf('--env') + 1];
if (!['staging', 'production'].includes(environment)) throw new Error('Usage: npm run store:pause -- --env staging|production');
const key = process.env.STRIPE_SECRET_KEY;
if (!key || (environment === 'production' ? !key.startsWith('sk_live_') : !key.startsWith('sk_test_'))) throw new Error('Set STRIPE_SECRET_KEY in this shell for the selected environment. Never pass it as a command argument.');
const command = 'node_modules/.bin/wrangler';
function query(sql, json = false) {
  const result = spawnSync(command, ['d1', 'execute', 'DB', '--remote', '--env', environment, '--command', sql, ...(json ? ['--json'] : [])], { encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  if (result.status !== 0) throw new Error('Cloudflare could not update or read the store. Run wrangler login and retry.');
  return result.stdout;
}
query("UPDATE store_settings SET value='false' WHERE key='sales_enabled';");
console.log('New checkout sessions are paused. Expiring unpaid Stripe sessions…');
// Allow an already-started session-creation request to finish before the second sweep.
const stripe = new Stripe(key, { maxNetworkRetries: 2 });
let failures = 0;
for (let sweep = 0; sweep < 2; sweep++) {
  if (sweep) await new Promise(resolve => setTimeout(resolve, 10_000));
  const results = JSON.parse(query("SELECT stripe_session_id FROM orders WHERE status='pending' AND stripe_session_id IS NOT NULL;", true));
  const rows = results.flatMap(result => result.results || []);
  for (const row of rows) {
    try {
      const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
      if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
    } catch { failures++; console.error('One checkout session could not be expired. Check open sessions in Stripe before treating inventory as unavailable.'); }
  }
}
console.log('Pause sweeps finished. Check Stripe for any payments that completed during the pause.');
if (failures) process.exitCode = 1;
