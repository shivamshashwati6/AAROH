import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

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
    connectionTimeoutMillis: 5000,
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
