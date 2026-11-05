import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const production = config.env.production;
const catalog = JSON.parse(await readFile(new URL('../src/content/catalog.json', import.meta.url), 'utf8'));
const fulfillment = JSON.parse(await readFile(new URL('../src/server/fulfillment.json', import.meta.url), 'utf8'));
const errors = [];
if (production.d1_databases.some(db => db.database_id.startsWith('00000000-'))) errors.push('Replace the production D1 database ID in wrangler.jsonc.');
if (production.vars.SITE_URL !== 'https://eitaware.com') errors.push('Production SITE_URL must be https://eitaware.com.');
if (production.vars.STRIPE_MODE !== 'live') errors.push('Production STRIPE_MODE must be live.');
if (production.vars.CHECKOUT_ENABLED === 'true') {
  if (production.vars.TAX_READY !== 'true') errors.push('Confirm your required tax registrations and Stripe Tax configuration before enabling live payments.');
  if (production.vars.EMAIL_READY !== 'true') errors.push('Verify your sending domain and order/support mailboxes before enabling live payments.');
  for (const product of catalog.products.filter(product => product.status === 'available')) {
    const sku = fulfillment[product.id] || (product.id === 'eitaware-dark-blue-12' ? production.vars.MCF_SELLER_SKU : '');
    if (typeof sku !== 'string' || !sku.trim() || /replace|example|your[-_ ]/i.test(sku)) errors.push(`Set the actual MCF seller SKU for ${product.id}.`);
  }
}
if (errors.length) {
  console.error(`Production configuration needs attention:\n${errors.map(value => `- ${value}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Production configuration checked. Checkout ${production.vars.CHECKOUT_ENABLED === 'true' ? 'enabled (runtime also checks secrets)' : 'disabled'}.`);
}
