#!/usr/bin/env node
/**
 * Preenche knowledge_chunks.sourceUrl a partir de web_import_pages (Eberick / web-import).
 *
 * Uso:
 *   node scripts/backfill-chunk-source-urls.mjs [--dry-run] [--doc-id <objectId>]
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function resolveModule(name) {
  const candidates = [
    join(root, 'apps/api/node_modules', name),
    join(root, 'node_modules', name),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  }
  throw new Error(`Módulo "${name}" não encontrado — rode pnpm install`);
}

const mongoose = require(resolveModule('mongoose'));

function loadEnv(key) {
  if (process.env[key]) return process.env[key];
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return null;
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${key}=`) && !entry.startsWith(`#${key}=`));
  return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') ?? null;
}

function normalizeTitle(value) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const dryRun = process.argv.includes('--dry-run');
const docIdArgIdx = process.argv.indexOf('--doc-id');
const docIdFilter = docIdArgIdx >= 0 ? process.argv[docIdArgIdx + 1] : null;

const uri = loadEnv('MONGODB_URI');
if (!uri) {
  console.error('MONGODB_URI não encontrada no .env');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;
const { ObjectId } = mongoose.Types;

const docQuery = {
  webImportJobId: { $exists: true, $ne: null },
  deletedAt: null,
  ...(docIdFilter ? { _id: new ObjectId(docIdFilter) } : {}),
};

const documents = await db.collection('knowledge_documents').find(docQuery).toArray();
console.log(`📄 Documentos web-import: ${documents.length}${dryRun ? ' (dry-run)' : ''}\n`);

let updated = 0;
let skipped = 0;

for (const document of documents) {
  const pages = await db
    .collection('web_import_pages')
    .find({ jobId: document.webImportJobId, deletedAt: null })
    .project({ url: 1, title: 1, canonicalUrl: 1 })
    .toArray();

  const pageByTitle = new Map();
  for (const page of pages) {
    const title = normalizeTitle(page.title);
    if (title) pageByTitle.set(title, page.canonicalUrl || page.url);
  }

  const chunks = await db
    .collection('knowledge_chunks')
    .find({
      documentId: document._id,
      deletedAt: null,
      $or: [{ sourceUrl: { $exists: false } }, { sourceUrl: null }, { sourceUrl: '' }],
    })
    .project({ chapter: 1, section: 1 })
    .toArray();

  let docUpdated = 0;

  for (const chunk of chunks) {
    const candidates = [chunk.chapter, chunk.section].map(normalizeTitle).filter(Boolean);
    let matchedUrl = null;

    for (const candidate of candidates) {
      if (pageByTitle.has(candidate)) {
        matchedUrl = pageByTitle.get(candidate);
        break;
      }
    }

    if (!matchedUrl) {
      skipped++;
      continue;
    }

    if (!dryRun) {
      await db.collection('knowledge_chunks').updateOne(
        { _id: chunk._id },
        { $set: { sourceUrl: matchedUrl } },
      );
    }

    docUpdated++;
    updated++;
  }

  console.log(`   ${document.title}: ${chunks.length} chunks sem URL → ${docUpdated} atualizados`);
}

console.log(`\n✅ Backfill concluído: ${updated} chunk(s)${dryRun ? ' (simulado)' : ''}, ${skipped} sem match de página`);

await mongoose.disconnect();
