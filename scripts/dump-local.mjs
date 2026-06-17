/**
 * Gera dump BSON da base local qi-conhecimento.
 * Uso: pnpm dump:local
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'dump');
const localUri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/qi-conhecimento';

console.log(`Gerando dump de ${localUri} → ${outPath}`);

const result = spawnSync(
  'mongodump',
  ['--uri', localUri, '--out', outPath],
  { stdio: 'inherit', shell: true },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('Dump local concluído.');
