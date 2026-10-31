/**
 * RELIEF-OS Unified Monorepo Development Server Launcher
 * Concurrently spawns both the Backend Decision Engine API (port 4000)
 * and the React Frontend Web Application (port 5173).
 */
const { spawn } = require('child_process');
const path = require('path');

console.log('================================================================');
console.log('🚀 Launching RELIEF-OS Full-Stack Local Development Environment');
console.log('   - Backend API:    http://localhost:4000 (Decision Engine)');
console.log('   - Frontend Web:   http://localhost:5173 (React Portals)');
console.log('================================================================');

const apiProcess = spawn('npx', ['tsx', 'watch', 'src/index.ts'], {
  cwd: path.resolve(__dirname, '../apps/api'),
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

const webProcess = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', '5173'], {
  cwd: path.resolve(__dirname, '../apps/web'),
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

function shutdown() {
  console.log('\n[RELIEF-OS] Gracefully shutting down dev servers...');
  try {
    apiProcess.kill();
  } catch {}
  try {
    webProcess.kill();
  } catch {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

apiProcess.on('exit', (code) => {
  if (code && code !== 0) {
    console.error(`[RELIEF-OS API] Process exited with code ${code}`);
  }
});

webProcess.on('exit', (code) => {
  if (code && code !== 0) {
    console.error(`[RELIEF-OS Web] Process exited with code ${code}`);
  }
});
