import type { Env } from '../../src/server/env';

export function createTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: 'local', SITE_URL: 'http://localhost',
    RESEND_API_KEY: 're_example', EMAIL_FROM: 'EITAWARE <hello@eitaware.com>', SUPPORT_EMAIL: 'support@eitaware.com',
    ASSETS: { fetch: async () => new Response('<!doctype html><title>EITAWARE</title>', { headers: { 'Content-Type': 'text/html' } }) } as unknown as Fetcher,
    ...overrides,
  };
}
