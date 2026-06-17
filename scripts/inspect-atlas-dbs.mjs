import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { MongoClient } = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'apps/api/node_modules/mongodb'));

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(key) {
  if (process.env[key]) return process.env[key];
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return null;
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${key}=`) && !entry.startsWith(`#${key}=`));
  return line?.slice(key.length + 1).trim() ?? null;
}

const baseUri = loadEnv('MONGODB_URI');
if (!baseUri) {
  console.error('MONGODB_URI não encontrada');
  process.exit(1);
}

const clusterUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/$1');
const client = new MongoClient(clusterUri);

try {
  await client.connect();
  const admin = client.db().admin();
  const { databases } = await admin.listDatabases();

  console.log('Bancos no cluster:');
  for (const db of databases) {
    console.log(`- ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
  }

  for (const dbName of ['qi-agents', 'qi-conhecimento']) {
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    console.log(`\n${dbName} collections:`);
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`- ${col.name}: ${count} docs`);
    }
  }
} finally {
  await client.close();
}
