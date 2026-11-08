export interface Env {
  ASSETS: Fetcher;
  RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  ENVIRONMENT: 'local' | 'staging' | 'production';
  SITE_URL: string;
  /** Cloudflare secret; never expose this value to the browser. */
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
  SUPPORT_EMAIL: string;
}
