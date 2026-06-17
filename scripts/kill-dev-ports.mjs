import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const killPortScript = path.join(__dirname, 'kill-port.mjs');

for (const port of [3100, 3101, 3102]) {
  execSync(`node "${killPortScript}" ${port}`, { stdio: 'inherit' });
}
