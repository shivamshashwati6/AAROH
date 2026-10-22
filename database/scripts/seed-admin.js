/**
 * RELIEF-OS Admin Account Provisioning Script
 * 
 * Safely provisions or updates a dedicated administrator account for hackathon demonstrations.
 * Reads credentials strictly from environment variables:
 *   ADMIN_EMAIL    - Email address for the admin account (required)
 *   ADMIN_PASSWORD - Secure password, minimum 8 characters (required)
 *   ADMIN_NAME     - Display name for the administrator (optional, defaults to "System Administrator")
 * 
 * Invariants:
 * - Never hardcodes passwords or credentials in source code.
 * - Uses bcrypt (10 rounds) matching backend auth service.
 * - Never prints plaintext password or hash in console output.
 * - Enforces role = 'admin' and department = NULL per database check constraints.
 * - Strictly preserves all other existing users (citizen, command_center, departments).
 */

const bcrypt = require('bcryptjs');
const { getConnectedClient } = require('./db-client');

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.trim().toLowerCase() : '';
  const password = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : '';
  const name = process.env.ADMIN_NAME ? process.env.ADMIN_NAME.trim() : 'System Administrator';

  if (!email || !password) {
    console.error(`
================================================================================
❌ [RELIEF-OS Admin Provisioning Error]: Missing Required Credentials
================================================================================
To configure a secure admin demo account, you must provide credentials via
environment variables or your root .env file:

  ADMIN_EMAIL     - Valid email address (e.g., admin@relief.internal)
  ADMIN_PASSWORD  - Secure password (minimum 8 characters)
  ADMIN_NAME      - Optional display name (default: "System Administrator")

Usage Example (PowerShell):
  $env:ADMIN_EMAIL="admin@relief.internal"
  $env:ADMIN_PASSWORD="YourSecurePassword123!"
  npm run db:seed:admin

Usage Example (Bash / Linux / macOS):
  ADMIN_EMAIL="admin@relief.internal" ADMIN_PASSWORD="YourSecurePassword123!" npm run db:seed:admin
================================================================================
`);
    process.exit(1);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error('❌ [Error]: ADMIN_EMAIL must be a valid email address.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ [Error]: ADMIN_PASSWORD must be at least 8 characters long.');
    process.exit(1);
  }

  console.log(`[Admin Provisioning] Connecting to database...`);
  const client = await getConnectedClient();

  try {
    // 1. Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // 2. Check if a user with this email already exists
    const existingRes = await client.query('SELECT id, role, department FROM users WHERE email = $1', [email]);
    let userId = 'usr-admin-demo';

    if (existingRes.rows.length > 0) {
      userId = existingRes.rows[0].id;
      await client.query(
        `UPDATE users
         SET name = $1,
             password_hash = $2,
             role = 'admin',
             department = NULL
         WHERE id = $3`,
        [name, passwordHash, userId]
      );
      console.log(`[Admin Provisioning] Updated existing user (${userId}) to role 'admin'.`);
    } else {
      // Check if usr-admin-demo id is taken by another email
      const idRes = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (idRes.rows.length > 0) {
        userId = `usr-admin-${Date.now()}`;
      }

      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, department)
         VALUES ($1, $2, $3, $4, 'admin', NULL)`,
        [userId, name, email, passwordHash]
      );
      console.log(`[Admin Provisioning] Created new administrator user (${userId}).`);
    }

    console.log(`
================================================================================
✅ RELIEF-OS DEDICATED ADMIN ACCOUNT CONFIGURED SUCCESSFULLY
================================================================================
User ID:      ${userId}
Name:         ${name}
Email:        ${email}
Role:         admin (Authorized for Command Center & Disaster Administration)
Department:   null (Full System / Command Center Scope)
Status:       Active & Ready for Hackathon Demo Login
Security:     Bcrypt hashed (10 salt rounds) — zero plaintext storage
================================================================================
Login URL:    http://localhost:5173/login
Target Portal: /command (Command Center Operations Dashboard)
================================================================================
`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  seedAdmin().catch((err) => {
    console.error('❌ [Admin Provisioning Failed]:', err.message);
    process.exit(1);
  });
}

module.exports = { seedAdmin };
