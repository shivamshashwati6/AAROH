/**
 * RELIEF-OS Database Client Utility for Migrations & Seeds
 * Connects to Supabase PostgreSQL or local PostgreSQL using native Node.js 'pg'.
 * Uses existing environment variables: DATABASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load root .env
const rootEnvPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

function isPlaceholder(val) {
  if (!val) return true;
  return (
    val.includes('your_secure_postgres_password_here') ||
    val.includes('your_supabase_database_password_here') ||
    val.includes('[YOUR-PROJECT-REF]') ||
    val.includes('[YOUR-PASSWORD]')
  );
}

function getDbConfig() {
  const url = process.env.DATABASE_URL;
  const host = process.env.DB_HOST;
  const password = process.env.DB_PASSWORD;

  const isConfigured = (url && !isPlaceholder(url)) || (host && password && !isPlaceholder(password));

  if (!isConfigured) {
    return null;
  }

  const isSupabase =
    (url && (url.includes('supabase.co') || url.includes('supabase.com'))) ||
    (host && (host.includes('supabase.co') || host.includes('supabase.com')));

  const sslRequired =
    process.env.DB_SSL === 'true' ||
    Boolean(isSupabase) ||
    Boolean(url && url.includes('sslmode=require'));

  const ssl = sslRequired && process.env.DB_SSL !== 'false' ? { rejectUnauthorized: false } : false;

  if (url && !isPlaceholder(url)) {
    return {
      connectionString: url,
      ssl,
      connectionTimeoutMillis: 10000,
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl,
    connectionTimeoutMillis: 10000,
  };
}

function getSanitizedTarget() {
  const url = process.env.DATABASE_URL;
  if (url && !isPlaceholder(url)) {
    return url.replace(/:([^:@]+)@/, ':****@');
  }
  return `${process.env.DB_USER || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'postgres'}`;
}

async function getConnectedClient() {
  const config = getDbConfig();
  if (!config) {
    console.error('\n================================================================');
    console.error('❌ [RELIEF-OS DB] Supabase database credentials are not configured.');
    console.error('================================================================');
    console.error('To configure Supabase:');
    console.error('1. Create a project at https://supabase.com');
    console.error('2. Go to Project Settings -> Database -> Connection string');
    console.error('3. Select "URI" under Transaction / Session Pooler (port 6543) or Direct (port 5432)');
    console.error('4. Copy the connection string into the root .env file:');
    console.error('   DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require"');
    console.error('   DB_SSL=true');
    console.error('================================================================\n');
    throw new Error('Database credentials not configured in .env');
  }

  const client = new Client(config);
  await client.connect();
  
  // Ensure extensions schema is in search_path for PostGIS in Supabase
  await client.query('SET search_path TO public, extensions;');
  return client;
}

module.exports = {
  getDbConfig,
  getConnectedClient,
  getSanitizedTarget,
  isPlaceholder,
};
