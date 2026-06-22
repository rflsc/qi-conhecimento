#!/usr/bin/env node
/**
 * Backfill tags nos chunks a partir dos metadados do documento.
 * Uso: node scripts/backfill-document-tags.mjs [--dry-run]
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

function normalizeTag(tag) {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ');
}

function inferTagsFromDocument(doc) {
  const tags = new Set();

  if (doc.normReference?.trim()) {
    tags.add(normalizeTag(doc.normReference));
  }

  const title = (doc.title ?? '').toLowerCase();
  const sourceRef = (doc.sourceReference ?? '').toLowerCase();
  const author = (doc.author ?? '').toLowerCase();
  const specialty = doc.specialty;

  // NBRs no título (ex.: "NBR 6118:2014")
  for (const match of title.matchAll(/\bnbr\s*[\d.-]+(?::\d{4})?/gi)) {
    tags.add(normalizeTag(match[0]));
  }

  // Normas conhecidas — tags temáticas além da referência
  if (/nbr\s*6118/.test(title + (doc.normReference ?? ''))) {
    tags.add('concreto');
    tags.add('estruturas');
  }
  if (/nbr\s*8800/.test(title + (doc.normReference ?? ''))) {
    tags.add('aco');
    tags.add('estruturas-metalicas');
    tags.add('flambagem');
  }
  if (/nbr\s*8160/.test(title + (doc.normReference ?? ''))) tags.add('esgoto');
  if (/nbr\s*5410/.test(title + (doc.normReference ?? ''))) tags.add('instalacoes-eletricas');

  // Produtos / manuais AltoQi
  if (/eberick|altoqi|alto qi/.test(title + sourceRef + author)) {
    tags.add('eberick');
    tags.add('altoqi');
    tags.add('manual');
  }
  if (/builder|qi builder/.test(title + sourceRef)) tags.add('qi-builder');
  if (/\bvisus\b/.test(title + sourceRef)) tags.add('visus');

  // Temas por título
  if (/esgoto|sanit[aá]ri|pluvial|hidr[aá]ulic/.test(title)) tags.add('esgoto');
  if (/instala[cç][aã]o el[eé]tric|nbr\s*5410|eletrot[eé]cnica/.test(title + sourceRef)) {
    tags.add('instalacoes-eletricas');
  }
  if (/estrutur|concreto|a[cç]o|flambagem|nbr\s*8800|nbr\s*6118/.test(title)) {
    tags.add('estruturas');
  }
  if (/seguran[cç]a|nr\s*\d+|cipa|epi/.test(title)) tags.add('seguranca-trabalho');

  // Especialidade como tag ampla
  if (specialty) tags.add(specialty);

  // Tipo de fonte
  if (doc.sourceType === 'manual_text') tags.add('cms');
  if (doc.sourceType === 'html' || doc.sourceType === 'link') tags.add('web');
  if (doc.sourceType === 'pdf') tags.add('pdf');

  return [...tags].filter(Boolean);
}

const dryRun = process.argv.includes('--dry-run');
const uri = loadEnv('MONGODB_URI') || 'mongodb://localhost:27017/qi-conhecimento';

try {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const documents = await db
    .collection('knowledge_documents')
    .find({ deletedAt: null })
    .toArray();

  if (documents.length === 0) {
    console.log('Nenhum documento encontrado.');
    process.exit(0);
  }

  console.log(`\n=== Backfill de tags (${dryRun ? 'DRY RUN' : 'APLICAR'}) ===\n`);
  console.log(`Documentos: ${documents.length}\n`);

  let totalChunksUpdated = 0;

  for (const doc of documents) {
    const tags = inferTagsFromDocument(doc);
    const chunkCount = await db.collection('knowledge_chunks').countDocuments({
      documentId: doc._id,
      deletedAt: null,
    });

    const sample = await db.collection('knowledge_chunks').findOne({
      documentId: doc._id,
      deletedAt: null,
    });

    const currentTags = sample?.tags ?? [];
    const needsUpdate =
      tags.length > 0 &&
      (currentTags.length === 0 ||
        tags.some((t) => !currentTags.map(normalizeTag).includes(t)));

    console.log(`• ${doc.title}`);
    console.log(`  ID: ${doc._id}`);
    console.log(`  Norma: ${doc.normReference ?? '(nenhuma)'}`);
    console.log(`  Especialidade: ${doc.specialty} | Fonte: ${doc.sourceType}`);
    console.log(`  Chunks: ${chunkCount}`);
    console.log(`  Tags atuais (amostra): [${currentTags.join(', ')}]`);
    console.log(`  Tags inferidas: [${tags.join(', ')}]`);

    if (!needsUpdate) {
      console.log('  → já OK ou sem tags a aplicar\n');
      continue;
    }

    if (!dryRun) {
      const result = await db.collection('knowledge_chunks').updateMany(
        { documentId: doc._id, deletedAt: null },
        { $set: { tags } },
      );
      totalChunksUpdated += result.modifiedCount;
      console.log(`  → ${result.modifiedCount} chunk(s) atualizado(s)\n`);
    } else {
      console.log(`  → atualizaria ${chunkCount} chunk(s)\n`);
      totalChunksUpdated += chunkCount;
    }
  }

  console.log(
    dryRun
      ? `Total que seria atualizado: ${totalChunksUpdated} chunks`
      : `Total atualizado: ${totalChunksUpdated} chunks`,
  );
} finally {
  await mongoose.disconnect();
}
