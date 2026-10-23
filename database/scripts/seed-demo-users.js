const bcrypt = require('bcryptjs');
const { getConnectedClient } = require('./db-client');

async function seedDemoUsers() {
  const client = await getConnectedClient();
  try {
    const hash = await bcrypt.hash('Password123!', 10);
    const users = [
      { id: 'usr-citizen-demo', name: 'Rupjyoti Das', email: 'citizen@relief.internal', role: 'citizen', department: null },
      { id: 'usr-admin-demo', name: 'RELIEF-OS Lead Administrator', email: 'admin@relief.internal', role: 'admin', department: null },
      { id: 'usr-command-demo', name: 'Operations Commander Barua', email: 'command@relief.internal', role: 'command_center', department: null },
      { id: 'usr-health-demo', name: 'Dr. Saikia (Health Lead)', email: 'health@relief.internal', role: 'department', department: 'health' },
      { id: 'usr-supply-demo', name: 'Supply Officer Hazarika', email: 'supply@relief.internal', role: 'department', department: 'supply' },
      { id: 'usr-rescue-demo', name: 'Rescue Commander Nath', email: 'rescue@relief.internal', role: 'department', department: 'rescue' },
      { id: 'usr-officer-demo', name: 'District Relief Officer Phukan', email: 'officer@relief.internal', role: 'officer', department: null }
    ];

    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, department)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             department = EXCLUDED.department`,
        [u.id, u.name, u.email, hash, u.role, u.department]
      );
    }
    console.log('✅ Demo users seeded successfully.');
  } finally {
    await client.end();
  }
}

seedDemoUsers().catch(err => {
  console.error('Failed to seed demo users:', err);
  process.exit(1);
});
