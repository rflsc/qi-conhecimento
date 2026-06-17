/**
 * Remove todos os jobs pendentes/ativos da fila BullMQ de ingestão.
 * Uso: pnpm purge:ingestion
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { Queue } = require(join(root, 'apps/api/node_modules/bullmq'));

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const parsed = new URL(redisUrl);

const queue = new Queue('ingestion', {
  connection: {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  },
});

const waiting = await queue.getWaitingCount();
const active = await queue.getActiveCount();
const delayed = await queue.getDelayedCount();

console.log(`Fila ingestion — waiting: ${waiting}, active: ${active}, delayed: ${delayed}`);

await queue.obliterate({ force: true });
await queue.close();

console.log('Fila ingestion purgada com sucesso.');
