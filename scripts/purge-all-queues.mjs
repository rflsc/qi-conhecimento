/**
 * Purgar filas BullMQ: ingestion, embedding e web-import.
 * Uso: pnpm purge:queues
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = ['purge-ingestion-queue.mjs', 'purge-embedding-queue.mjs', 'purge-web-import-queue.mjs'];

for (const script of scripts) {
  console.log(`\n--- ${script} ---`);
  const result = spawnSync('node', [join(root, 'scripts', script)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('\nTodas as filas purgadas.');
