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
  const isSupabase =
    (process.env.DATABASE_URL &&
      (process.env.DATABASE_URL.includes('supabase.co') ||
        process.env.DATABASE_URL.includes('supabase.com'))) ||
    (process.env.DB_HOST &&
      (process.env.DB_HOST.includes('supabase.co') ||
        process.env.DB_HOST.includes('supabase.com')));

  const sslRequired =
    process.env.DB_SSL === 'true' ||
    Boolean(isSupabase) ||
    Boolean(process.env.DATABASE_URL?.includes('sslmode=require'));

  const baseConfig: PoolConfig = {
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
  };

  if (sslRequired && process.env.DB_SSL !== 'false') {
    baseConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  if (process.env.DATABASE_URL && !isPlaceholder(process.env.DATABASE_URL)) {
    return {
      ...baseConfig,
      connectionString: process.env.DATABASE_URL,
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
    if (
      err &&
      (err.code === 'ECONNRESET' ||
        err.code === '57P01' ||
        err.code === '08006' ||
        err.code === '08001' ||
        err.message?.includes('closed network connection') ||
        err.message?.includes('Connection terminated'))
    ) {
      // Retry once on remote pooler connection reset / terminated connection
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
        ? process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@')
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
