/**
 * RELIEF-OS Database Migration Runner
 * Executes 001_initial_schema.sql against Supabase PostgreSQL using native Node.js pg.
 */
const fs = require('fs');
const path = require('path');
const { getConnectedClient, getSanitizedTarget } = require('./db-client');

async function runMigration() {
  console.log('[RELIEF-OS Migration] Connecting to target database...');
  console.log(`[RELIEF-OS Migration] Target: ${getSanitizedTarget()}`);

  let client;
  try {
    client = await getConnectedClient();
  } catch (err) {
    process.exit(1);
  }

  try {
    // 1. Verify PostGIS availability
    console.log('[RELIEF-OS Migration] Checking PostGIS extension compatibility...');
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    const extRes = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'postgis';");
    const postgisVersion = extRes.rows[0]?.extversion || 'Unknown';
    console.log(`[RELIEF-OS Migration] PostGIS version: ${postgisVersion}`);

    // 2. Read migration SQL
    const migrationFile = path.resolve(__dirname, '../migrations/001_initial_schema.sql');
    if (!fs.existsSync(migrationFile)) {
      throw new Error(`Migration file not found at: ${migrationFile}`);
    }
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('[RELIEF-OS Migration] Applying 001_initial_schema.sql...');
    await client.query(sql);

    // 3. Verify created tables
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tableNames = tablesRes.rows.map((r) => r.table_name);
    console.log(`[RELIEF-OS Migration] Migration applied successfully. ${tableNames.length} tables verified in public schema:`);
    console.log(`  ${tableNames.join(', ')}`);
  } catch (err) {
    console.error('❌ [RELIEF-OS Migration] Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
