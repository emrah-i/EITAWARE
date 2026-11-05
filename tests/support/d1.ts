import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { Env } from '../../src/server/env';

/** Minimal D1 surface backed by real SQLite, including transactional batches. */
export class TestD1 {
  private sqlite = new DatabaseSync(':memory:');
  private batchTail: Promise<unknown> = Promise.resolve();

  constructor(options: { migrationsThrough?: string } = {}) {
    const directory = new URL('../../migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
      if (options.migrationsThrough && file > options.migrationsThrough) break;
      this.sqlite.exec(readFileSync(new URL(file, directory), 'utf8'));
    }
  }

  prepare(sql: string): D1PreparedStatement {
    const sqlite = this.sqlite;
    const bindings: (string | number | null)[] = [];
    const result = (results: unknown[] = [], changes = 0) => ({
      success: true, results, meta: { changes, duration: 0, last_row_id: 0, rows_read: results.length, rows_written: changes },
    });
    const statement = {
      bind(...values: (string | number | null)[]) { bindings.splice(0, bindings.length, ...values); return statement; },
      async first<T>(column?: string): Promise<T | null> {
        const row = sqlite.prepare(sql).get(...bindings) as Record<string, unknown> | undefined;
        return (row ? column ? row[column] : row : null) as T | null;
      },
      async all<T>(): Promise<D1Result<T>> { return result(sqlite.prepare(sql).all(...bindings)) as D1Result<T>; },
      async run<T>(): Promise<D1Result<T>> {
        const changes = sqlite.prepare(sql).run(...bindings).changes;
        return result([], Number(changes)) as D1Result<T>;
      },
      async raw<T>(): Promise<T[]> { return sqlite.prepare(sql).all(...bindings).map((row) => Object.values(row)) as T[]; },
    };
    return statement as unknown as D1PreparedStatement;
  }

  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const operation = this.batchTail.then(async () => {
      this.sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run<T>());
        this.sqlite.exec('COMMIT');
        return results;
      } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
    });
    this.batchTail = operation.catch(() => undefined);
    return operation;
  }

  async exec(sql: string): Promise<D1ExecResult> {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }

  close(): void { this.sqlite.close(); }
}

export function createTestEnv(overrides: Partial<Env> = {}): { env: Env; db: TestD1 } {
  const db = new TestD1();
  const env: Env = {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
    ENVIRONMENT: 'local', SITE_URL: 'http://localhost', CHECKOUT_ENABLED: 'true',
    STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_example',
    TAX_READY: 'true', EMAIL_READY: 'true', RESEND_API_KEY: 'test-resend-key',
    EMAIL_FROM: 'EITAWARE <hello@eitaware.com>', ORDER_EMAIL: 'orders@eitaware.com',
    SUPPORT_EMAIL: 'support@eitaware.com', MCF_SELLER_SKU: 'test-sku', ...overrides,
  };
  return { env, db };
}
