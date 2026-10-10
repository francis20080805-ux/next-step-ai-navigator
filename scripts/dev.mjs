import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--experimental-strip-types', 'server/index.ts'], { stdio: 'inherit', cwd: fileURLToPath(new URL('..', import.meta.url)) }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit', cwd: fileURLToPath(new URL('..', import.meta.url)) }),
];
function stop() { children.forEach(child => child.kill()); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
for (const child of children) child.on('exit', code => { if (code) { stop(); process.exitCode = code; } });
