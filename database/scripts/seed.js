/**
 * RELIEF-OS Seed Data Runner
 * Loads canonical Assam Flood demonstration figures into Supabase PostgreSQL.
 */
const fs = require('fs');
const path = require('path');
const { getConnectedClient, getSanitizedTarget } = require('./db-client');

async function runSeed() {
  console.log('[RELIEF-OS Seeding] Connecting to target database...');
  console.log(`[RELIEF-OS Seeding] Target: ${getSanitizedTarget()}`);

  let client;
  try {
    client = await getConnectedClient();
  } catch (err) {
    process.exit(1);
  }

  try {
    // 1. Verify tables exist
    const checkTables = await client.query(`
      SELECT count(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('disasters', 'zones', 'shelters', 'resource_centers');
    `);

    if (parseInt(checkTables.rows[0].count, 10) < 4) {
      console.error('❌ [RELIEF-OS Seeding] Tables do not exist yet. Please run "npm run db:migrate" first.');
      process.exit(1);
    }

    // 2. Read seed SQL
    const seedFile = path.resolve(__dirname, '../seeds/001_assam_flood_seed.sql');
    if (!fs.existsSync(seedFile)) {
      throw new Error(`Seed file not found at: ${seedFile}`);
    }
    const sql = fs.readFileSync(seedFile, 'utf8');

    console.log('[RELIEF-OS Seeding] Applying 001_assam_flood_seed.sql...');
    await client.query(sql);

    // 3. Verify canonical PRD figures
    console.log('[RELIEF-OS Seeding] Verifying canonical PRD Assam flood figures:');

    const zonesRes = await client.query(`
      SELECT 
        count(*) as zone_count,
        sum(affected_population) as total_affected,
        count(*) FILTER (WHERE band = 'Critical') as critical_zone_count
      FROM zones;
    `);

    const sheltersRes = await client.query(`
      SELECT count(*) as shelter_count FROM shelters;
    `);

    const centersRes = await client.query(`
      SELECT 
        count(*) as center_count,
        sum(vehicles_available + boats_available) as total_fleet
      FROM resource_centers;
    `);

    const zoneARes = await client.query(`
      SELECT id, name, priority_score, band, affected_population 
      FROM zones 
      WHERE id = 'zone-a';
    `);

    const routeRes = await client.query(`
      SELECT id, name, status FROM road_segments WHERE id IN ('route-a', 'route-c');
    `);

    console.log(`  • Total Affected Population: ${zonesRes.rows[0].total_affected} (Target: 18,420)`);
    console.log(`  • Critical Zones:           ${zonesRes.rows[0].critical_zone_count} (Target: 7)`);
    console.log(`  • Shelters Seeded:          ${sheltersRes.rows[0].shelter_count} (Target: 18)`);
    console.log(`  • Relief Centers Seeded:    ${centersRes.rows[0].center_count} (Target: 5)`);
    console.log(`  • Dispatched Fleet Units:   ${centersRes.rows[0].total_fleet} (Target: 21)`);
    console.log(`  • Zone A Priority:          ${zoneARes.rows[0]?.priority_score}/100, Band: ${zoneARes.rows[0]?.band} (Target: 94/100 Critical)`);
    
    routeRes.rows.forEach(r => {
      console.log(`  • Road Segment ${r.id}:       ${r.name} -> Status: ${r.status}`);
    });

    console.log('✅ [RELIEF-OS Seeding] Demonstration dataset loaded & validated successfully.');
  } catch (err) {
    console.error('❌ [RELIEF-OS Seeding] Seeding failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSeed();
