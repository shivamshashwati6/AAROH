/**
 * RELIEF-OS Database Verification Script
 * Validates connection, PostGIS extension version, schema tables, and canonical PRD figures.
 */
const { getConnectedClient, getSanitizedTarget, getDbConfig } = require('./db-client');

async function verifyDatabase() {
  const config = getDbConfig();
  if (!config) {
    console.log('Database verification: NOT CONFIGURED (No credentials in .env)');
    process.exit(1);
  }

  console.log(`[RELIEF-OS DB Verification] Connecting to ${getSanitizedTarget()}...`);
  let client;
  try {
    client = await getConnectedClient();
  } catch (err) {
    console.error(`❌ [RELIEF-OS DB Verification] Connection failed: ${err.message}`);
    process.exit(1);
  }

  try {
    console.log('================================================================');
    console.log('RELIEF-OS DATABASE AUDIT & VERIFICATION REPORT');
    console.log('================================================================');

    // 1. Database Info
    const dbInfo = await client.query('SELECT current_database(), current_user, version();');
    console.log(`Database:     ${dbInfo.rows[0].current_database}`);
    console.log(`User:         ${dbInfo.rows[0].current_user}`);
    console.log(`PostgreSQL:   ${dbInfo.rows[0].version.split(',')[0]}`);

    // 2. PostGIS Version
    const postgisRes = await client.query(`
      SELECT 
        extname, 
        extversion,
        (SELECT PostGIS_Full_Version()) as full_version
      FROM pg_extension 
      WHERE extname = 'postgis';
    `);

    if (postgisRes.rows.length === 0) {
      console.log('PostGIS:      ❌ NOT INSTALLED (Run npm run db:migrate)');
    } else {
      console.log(`PostGIS:      ✅ Version ${postgisRes.rows[0].extversion}`);
      console.log(`Details:      ${postgisRes.rows[0].full_version}`);
    }

    // 3. Schema Tables Count
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tableNames = tablesRes.rows.map((r) => r.table_name);
    console.log(`Tables (${tableNames.length}):   ${tableNames.join(', ')}`);

    // 4. Canonical PRD Demo Figures Verification
    if (tableNames.includes('zones') && tableNames.includes('shelters')) {
      const canonical = await client.query(`
        SELECT
          (SELECT sum(affected_population) FROM zones) as affected_population,
          (SELECT count(*) FROM zones WHERE band = 'Critical') as critical_zones,
          (SELECT count(*) FROM shelters) as shelters,
          (SELECT count(*) FROM resource_centers) as relief_centers,
          (SELECT sum(vehicles_available + boats_available) FROM resource_centers) as vehicles,
          (SELECT priority_score FROM zones WHERE id = 'zone-a') as zone_a_score,
          (SELECT band FROM zones WHERE id = 'zone-a') as zone_a_band,
          (SELECT status FROM road_segments WHERE id = 'route-a') as route_a_status,
          (SELECT status FROM road_segments WHERE id = 'route-c') as route_c_status;
      `);

      const r = canonical.rows[0];
      console.log('----------------------------------------------------------------');
      console.log('CANONICAL ASSAM FLOOD DEMO DATA AUDIT:');
      console.log(`  Affected Population: ${r.affected_population} / 18420 -> ${r.affected_population == 18420 ? 'PASS' : 'FAIL'}`);
      console.log(`  Critical Zones:      ${r.critical_zones} / 7      -> ${r.critical_zones == 7 ? 'PASS' : 'FAIL'}`);
      console.log(`  Shelters Count:      ${r.shelters} / 18           -> ${r.shelters == 18 ? 'PASS' : 'FAIL'}`);
      console.log(`  Relief Centers:      ${r.relief_centers} / 5      -> ${r.relief_centers == 5 ? 'PASS' : 'FAIL'}`);
      console.log(`  Fleet Vehicles:      ${r.vehicles} / 21           -> ${r.vehicles == 21 ? 'PASS' : 'FAIL'}`);
      console.log(`  Zone A Priority:     ${r.zone_a_score}/100 (${r.zone_a_band}) -> ${r.zone_a_score == 94 && r.zone_a_band === 'Critical' ? 'PASS' : 'FAIL'}`);
      console.log(`  Route A Status:      ${r.route_a_status} (Expected: blocked)  -> ${r.route_a_status === 'blocked' ? 'PASS' : 'FAIL'}`);
      console.log(`  Route C Status:      ${r.route_c_status} (Expected: accessible) -> ${r.route_c_status === 'accessible' ? 'PASS' : 'FAIL'}`);
    } else {
      console.log('Demo Data:    Tables not seeded yet. Run npm run db:migrate && npm run db:seed');
    }
    console.log('================================================================');
  } catch (err) {
    console.error('❌ [RELIEF-OS DB Verification] Error querying database:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verifyDatabase();
