import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const production = config.env.production;
const errors = [];
const publicVars = new Set(['ENVIRONMENT', 'SITE_URL', 'EMAIL_FROM', 'SUPPORT_EMAIL']);
for (const [name, environment] of [['default', config], ...Object.entries(config.env)]) {
  if (environment.workers_dev !== false || environment.preview_urls !== false) errors.push(`${name} must disable development and preview URLs.`);
  if (environment.triggers?.crons?.length) errors.push(`${name} must not schedule background tasks.`);
  if (environment.d1_databases?.length) errors.push(`${name} must not bind a database.`);
  if (Object.keys(environment.vars || {}).some(key => !publicVars.has(key))) errors.push(`${name} contains unexpected configuration or a secret in public vars.`);
}
if (production.vars.SITE_URL !== 'https://eitaware.com') errors.push('Production SITE_URL must be https://eitaware.com.');
const domains = production.routes.map(route => route.pattern).sort();
if (JSON.stringify(domains) !== JSON.stringify(['eitaware.com', 'www.eitaware.com'])) errors.push('Only the EITAWARE production custom domains may be configured.');
if (!production.routes.every(route => route.custom_domain)) errors.push('Production routes must use custom domains.');
if (!production.vars.EMAIL_FROM || !production.vars.SUPPORT_EMAIL) errors.push('Configure the Resend sender and support recipient.');
if (errors.length) {
  console.error(`Production configuration needs attention:\n${errors.map(value => `- ${value}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Production configuration checked: custom domains only, no database or cron, direct contact email using the Resend secret.');
}
