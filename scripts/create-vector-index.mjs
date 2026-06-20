import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Cria (ou confirma) o índice Atlas Vector Search `knowledge_vector_index`
 * na coleção `knowledge_chunks`, campo `embedding`.
 *
 * A dimensão (`numDimensions`) é detectada automaticamente a partir de um
 * chunk já existente, então funciona tanto com OpenAI (1536) quanto Ollama (768).
 *
 * Uso: node scripts/create-vector-index.mjs
 * Requer: MONGODB_URI no ambiente ou em .env (raiz do repo).
 * Disponível no Atlas inclusive no tier gratuito M0.
 */

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { MongoClient } = require(join(root, 'apps/api/node_modules/mongodb'));

const INDEX_NAME = 'knowledge_vector_index';
const COLLECTION = 'knowledge_chunks';

function loadEnv(key) {
  if (process.env[key]) return process.env[key];
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return null;
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${key}=`) && !entry.startsWith(`#${key}=`));
  return line?.slice(key.length + 1).trim() ?? null;
}

const uri = loadEnv('MONGODB_URI');
if (!uri) {
  console.error('MONGODB_URI não encontrada (ambiente ou .env)');
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(); // usa o database embutido na URI
  const collection = db.collection(COLLECTION);

  const sample = await collection.findOne(
    { embedding: { $exists: true, $not: { $size: 0 } } },
    { projection: { embedding: 1 } },
  );
  if (!sample?.embedding?.length) {
    console.error(
      `Nenhum chunk com embedding em ${db.databaseName}.${COLLECTION}. ` +
        'Gere embeddings antes de criar o índice.',
    );
    process.exit(1);
  }
  const numDimensions = sample.embedding.length;
  console.log(`Database: ${db.databaseName}`);
  console.log(`Dimensão do embedding detectada: ${numDimensions}`);

  const existing = await collection.listSearchIndexes().toArray();
  if (existing.some((idx) => idx.name === INDEX_NAME)) {
    console.log(`Índice "${INDEX_NAME}" já existe. Nada a fazer.`);
    process.exit(0);
  }

  const definition = {
    fields: [
      { type: 'vector', path: 'embedding', numDimensions, similarity: 'cosine' },
      { type: 'filter', path: 'specialty' },
      { type: 'filter', path: 'deletedAt' },
    ],
  };

  const created = await collection.createSearchIndex({
    name: INDEX_NAME,
    type: 'vectorSearch',
    definition,
  });

  console.log(`Índice "${created}" criado. A indexação inicial leva alguns segundos.`);
  console.log('Acompanhe o status com: db.knowledge_chunks.getSearchIndexes() no Atlas/mongosh.');
} catch (error) {
  console.error('Falha ao criar o índice:', error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
