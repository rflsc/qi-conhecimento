/**
 * Restaura o dump local no banco indicado por MONGODB_URI (sem alterar outros DBs).
 * Uso: pnpm restore:atlas
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dumpPath = join(root, 'dump', 'qi-conhecimento');

function loadMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;

  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return null;

  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith('MONGODB_URI=') && !entry.startsWith('#MONGODB_URI='));

  return line?.slice('MONGODB_URI='.length).trim() ?? null;
}

const mongoUri = loadMongoUri();

if (!mongoUri) {
  console.error('Defina MONGODB_URI no .env apontando para o banco de destino no Atlas.');
  process.exit(1);
}

if (!existsSync(dumpPath)) {
  console.error(`Dump não encontrado em ${dumpPath}. Rode: pnpm dump:local`);
  process.exit(1);
}

const safeUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
console.log(`Restaurando dump → ${safeUri} (somente banco qi-conhecimento)`);

const result = spawnSync(
  'mongorestore',
  ['--uri', mongoUri, '--drop', dumpPath],
  { stdio: 'inherit', shell: true },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('Restore concluído.');
