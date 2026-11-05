export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  ENVIRONMENT: 'local' | 'staging' | 'production';
  SITE_URL: string;
  CHECKOUT_ENABLED: string;
  STRIPE_MODE: 'test' | 'live';
  TAX_READY: string;
  EMAIL_READY: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
  ORDER_EMAIL: string;
  SUPPORT_EMAIL: string;
  /** Legacy fallback for eitaware-dark-blue-12 only; other products use fulfillment.json. */
  MCF_SELLER_SKU?: string;
}
export interface OutboxRow {
  id: string; kind: string; recipient: string; subject: string; html: string; text: string;
  reply_to: string | null; status: string; attempts: number; created_at: number;
  next_attempt_at: number; lease_until: number | null; lease_token: string | null;
  first_attempt_at: number | null; provider_id: string | null; last_error: string | null;
}
