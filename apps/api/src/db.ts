import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Check both root .env and local .env
const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

function isPlaceholder(val?: string): boolean {
  if (!val) return true;
  return (
    val.includes('your_secure_postgres_password_here') ||
    val.includes('your_supabase_database_password_here') ||
    val.includes('[YOUR-PROJECT-REF]') ||
    val.includes('[YOUR-PASSWORD]')
  );
}

/**
 * Normalizes Supabase database connection URLs for serverless / IPv4 environments.
 * - Detects direct Supabase host pattern: db.<ref>.supabase.co
 * - Rewrites hostname to IPv4-compatible pooler: aws-0-<region>.pooler.supabase.com
 * - Formats username to postgres.<ref> if not already formatted
 * - Ensures port 5432 (session pooler)
 * - Strips sslmode query parameter so pg-connection-string does not force rejectUnauthorized: true
 */
export function normalizeDatabaseUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || isPlaceholder(rawUrl)) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    // Detect direct Supabase host: db.<ref>.supabase.co
    const directMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (directMatch) {
      const ref = directMatch[1];
      const region = process.env.SUPABASE_REGION || process.env.DB_REGION || 'ap-northeast-2';
      parsed.hostname = `aws-0-${region}.pooler.supabase.com`;
      if (!parsed.username.includes('.')) {
        parsed.username = `${parsed.username}.${ref}`;
      }
      if (!parsed.port || parsed.port === '5432') {
        parsed.port = '5432';
      }
    }
    // Remove sslmode query parameter so pg-connection-string does not override rejectUnauthorized: false
    if (parsed.searchParams.has('sslmode')) {
      parsed.searchParams.delete('sslmode');
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}


export function isDbConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  const host = process.env.DB_HOST;
  const password = process.env.DB_PASSWORD;

  if (url && !isPlaceholder(url)) {
    return true;
  }

  if (host && password && !isPlaceholder(password)) {
    return true;
  }

  return false;
}

export function getPoolConfig(): PoolConfig {
  const rawUrl = process.env.DATABASE_URL;
  const normalizedUrl = normalizeDatabaseUrl(rawUrl);

  const isSupabase =
    (normalizedUrl &&
      (normalizedUrl.includes('supabase.co') ||
        normalizedUrl.includes('supabase.com'))) ||
    (process.env.DB_HOST &&
      (process.env.DB_HOST.includes('supabase.co') ||
        process.env.DB_HOST.includes('supabase.com')));

  const sslRequired =
    process.env.DB_SSL === 'true' ||
    Boolean(isSupabase) ||
    Boolean(rawUrl?.includes('sslmode=require'));

  const isServerless = Boolean(process.env.VERCEL);
  const baseConfig: PoolConfig = {
    max: isServerless ? 3 : 10,
    idleTimeoutMillis: isServerless ? 10000 : 30000,
    connectionTimeoutMillis: 30000,
    keepAlive: true,
  };

  if (sslRequired && process.env.DB_SSL !== 'false') {
    baseConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  if (normalizedUrl && !isPlaceholder(normalizedUrl)) {
    return {
      ...baseConfig,
      connectionString: normalizedUrl,
    };
  }

  return {
    ...baseConfig,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  };
}

let poolInstance: Pool | null = null;

export function getPool(): Pool {
  if (!poolInstance) {
    poolInstance = new Pool(getPoolConfig());
    poolInstance.on('error', (err) => {
      console.error('[RELIEF-OS DB Pool] Unexpected error on idle client:', err.message);
    });
  }
  return poolInstance;
}

export async function query<R extends QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<R>> {
  const pool = getPool();
  try {
    return await pool.query<R>(text, params);
  } catch (err: any) {
    const isIdempotentRead = /^\s*SELECT\b/i.test(text);
    if (
      isIdempotentRead &&
      err &&
      (err.code === 'ECONNRESET' ||
        err.code === '57P01' ||
        err.code === '08006' ||
        err.code === '08001' ||
        err.message?.includes('closed network connection') ||
        err.message?.includes('Connection terminated'))
    ) {
      // Retry once ONLY for idempotent read-only queries (SELECT) on remote pooler connection reset.
      // Non-idempotent mutations (INSERT/UPDATE/DELETE) are NEVER retried to avoid duplicate execution.
      return pool.query<R>(text, params);
    }
    throw err;
  }
}

export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

export interface DbStatus {
  configured: boolean;
  connected: boolean;
  target?: string;
  ssl_enabled?: boolean;
  postgis_version?: string;
  error?: string;
}

export async function checkDbStatus(): Promise<DbStatus> {
  if (!isDbConfigured()) {
    return {
      configured: false,
      connected: false,
      error: 'Database credentials not configured in .env (Supabase connection URI required)',
    };
  }

  const pool = getPool();
  try {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT 
          current_database() as db_name,
          (SELECT extversion FROM pg_extension WHERE extname = 'postgis') as postgis_version
      `);

      const target = process.env.DATABASE_URL
        ? normalizeDatabaseUrl(process.env.DATABASE_URL)?.replace(/:([^:@]+)@/, ':****@')
        : `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

      return {
        configured: true,
        connected: true,
        target,
        ssl_enabled: Boolean(getPoolConfig().ssl),
        postgis_version: res.rows[0]?.postgis_version || 'Not enabled (run migrations)',
      };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      connected: false,
      error: message,
    };
  }
}
