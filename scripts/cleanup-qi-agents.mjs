/**
 * Remove collections do Qi Conhecimento que foram restauradas por engano em qi-agents.
 * Não altera qi-conhecimento nem as collections nativas do qi-agents.
 * Uso: pnpm cleanup:qi-agents
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const mongoose = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'apps/api/node_modules/mongoose'));

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const QI_CONHECIMENTO_ONLY = ['knowledge_documents', 'knowledge_chunks', 'field_queries'];

function loadMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return null;
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith('MONGODB_URI=') && !entry.startsWith('#MONGODB_URI='));
  return line?.slice('MONGODB_URI='.length).trim() ?? null;
}

const baseUri = loadMongoUri();
if (!baseUri) {
  console.error('MONGODB_URI não encontrada no .env');
  process.exit(1);
}

const clusterUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/$1');

await mongoose.connect(clusterUri, { dbName: 'qi-agents' });
const db = mongoose.connection.db;

console.log('Removendo collections do Qi Conhecimento em qi-agents...');

for (const name of QI_CONHECIMENTO_ONLY) {
  const collections = await db.listCollections({ name }).toArray();
  if (!collections.length) {
    console.log(`- ${name}: já ausente`);
    continue;
  }

  const count = await db.collection(name).countDocuments();
  await db.collection(name).drop();
  console.log(`- ${name}: removida (${count} docs apagados)`);
}

const usersCount = await db.collection('users').countDocuments();
console.log(`\nusers: mantida (${usersCount} doc) — foi sobrescrita no restore errado.`);
console.log('Se o login do qi-agents quebrou, restaure só "users" via backup do Atlas.');

const remaining = await db.listCollections().toArray();
console.log('\nqi-agents collections restantes:');
for (const col of remaining.sort((a, b) => a.name.localeCompare(b.name))) {
  const count = await db.collection(col.name).countDocuments();
  console.log(`  ${col.name}: ${count}`);
}

await mongoose.disconnect();
console.log('\nLimpeza concluída. qi-conhecimento não foi alterado.');
