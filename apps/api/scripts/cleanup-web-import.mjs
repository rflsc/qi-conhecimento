/**
 * Remove documentos, pílulas e jobs de importação web por seed URL ou job id.
 * Uso: node scripts/cleanup-web-import.mjs [--seed=altoqi-eberick] [--dry-run]
 */
import mongoose from 'mongoose';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const seedArg = args.find((a) => a.startsWith('--seed='));
const seedPattern = seedArg ? seedArg.split('=')[1] : 'altoqi-eberick';

const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/qi-conhecimento';

await mongoose.connect(uri);
const db = mongoose.connection.db;

const jobFilter = {
  deletedAt: null,
  $or: [
    { 'config.seedUrl': { $regex: seedPattern, $options: 'i' } },
    { title: { $regex: seedPattern.replace(/-/g, '.*'), $options: 'i' } },
  ],
};

const jobs = await db.collection('web_import_jobs').find(jobFilter).toArray();
const jobIds = jobs.map((j) => j._id);

console.log(`Jobs encontrados (${jobs.length}):`);
for (const job of jobs) {
  console.log(`  - ${job._id} | ${job.title} | ${job.config?.seedUrl} | ${job.status}`);
}

const docFilter = {
  deletedAt: null,
  $or: [
    ...(jobIds.length ? [{ webImportJobId: { $in: jobIds } }] : []),
    {
      sourceType: 'link',
      sourceReference: { $regex: 'suporte\\.altoqi\\.com\\.br/hc/pt-br', $options: 'i' },
    },
  ],
};

if (docFilter.$or.length === 0) {
  console.log('Nenhum critério de documento — abortando.');
  await mongoose.disconnect();
  process.exit(0);
}

const docs = await db.collection('knowledge_documents').find(docFilter).toArray();
const docIds = docs.map((d) => d._id);

console.log(`\nDocumentos a remover (${docs.length}):`);
for (const doc of docs.slice(0, 10)) {
  console.log(`  - ${doc._id} | ${doc.title?.slice(0, 60)}`);
}
if (docs.length > 10) console.log(`  … e mais ${docs.length - 10}`);

const chunkCount = docIds.length
  ? await db.collection('knowledge_chunks').countDocuments({ documentId: { $in: docIds } })
  : 0;
const pageCount = jobIds.length
  ? await db.collection('web_import_pages').countDocuments({ jobId: { $in: jobIds } })
  : 0;

console.log(`\nPílulas: ${chunkCount} | Páginas de import: ${pageCount}`);

if (dryRun) {
  console.log('\n[dry-run] Nada foi apagado.');
  await mongoose.disconnect();
  process.exit(0);
}

if (docIds.length) {
  const chunks = await db.collection('knowledge_chunks').deleteMany({ documentId: { $in: docIds } });
  const documents = await db.collection('knowledge_documents').deleteMany({ _id: { $in: docIds } });
  console.log(`\nRemovidos: ${documents.deletedCount} documento(s), ${chunks.deletedCount} pílula(s)`);
}

if (jobIds.length) {
  const pages = await db.collection('web_import_pages').deleteMany({ jobId: { $in: jobIds } });
  const removedJobs = await db.collection('web_import_jobs').deleteMany({ _id: { $in: jobIds } });
  console.log(`Removidos: ${removedJobs.deletedCount} job(s), ${pages.deletedCount} página(s) de import`);
}

await mongoose.disconnect();
console.log('Concluído.');
