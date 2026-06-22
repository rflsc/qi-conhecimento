/**
 * Remove todos os jobs pendentes/ativos da fila BullMQ de embeddings.
 * Uso: pnpm purge:embedding
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { Queue } = require(join(root, 'apps/api/node_modules/bullmq'));

function loadRedisUrl() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return 'redis://localhost:6379';
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith('REDIS_URL=') && !entry.startsWith('#REDIS_URL='));
  return line?.slice('REDIS_URL='.length).trim() ?? 'redis://localhost:6379';
}

const parsed = new URL(loadRedisUrl());
const queue = new Queue('embedding', {
  connection: {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  },
});

const waiting = await queue.getWaitingCount();
const active = await queue.getActiveCount();
const delayed = await queue.getDelayedCount();

console.log(`Fila embedding — waiting: ${waiting}, active: ${active}, delayed: ${delayed}`);

await queue.obliterate({ force: true });
await queue.close();

console.log('Fila embedding purgada com sucesso.');
