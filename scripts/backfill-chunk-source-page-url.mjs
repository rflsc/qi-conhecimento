#!/usr/bin/env node
/**
 * Preenche sourceUrl nos chunks de documentos agregados por web-import.
 *
 * Estratégia principal: cada página completed tem updatedAt ao final da ingestão;
 * chunks criados entre o updatedAt da página anterior e o desta página pertencem a ela.
 *
 * Fallback: chapter === título da página (normalizado).
 *
 * Uso:
 *   node scripts/backfill-chunk-source-page-url.mjs --dry-run
 *   node scripts/backfill-chunk-source-page-url.mjs --seed=eberick
 *   node scripts/backfill-chunk-source-page-url.mjs --doc-id=<objectId>
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

function parseArgs(argv) {
  const args = {
    dryRun: false,
    seed: null,
    docId: null,
    help: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--seed=')) args.seed = arg.slice('--seed='.length);
    else if (arg.startsWith('--doc-id=')) args.docId = arg.slice('--doc-id='.length);
    else if (arg.startsWith('--gap-ms=')) {
      console.warn('--gap-ms ignorado: backfill usa updatedAt das páginas importadas');
    }
  }

  return args;
}

function normalizeTitle(value) {
  return (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[?.!]+$/, '');
}

function toTime(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/** Pareia chunks com páginas pela janela temporal entre updatedAt consecutivos. */
function assignByPageWindows(pages, chunks) {
  const assignments = new Map();
  const completedPages = pages
    .filter((page) => page.status === 'completed' && toTime(page.updatedAt) != null)
    .sort((a, b) => {
      const delta = toTime(a.updatedAt) - toTime(b.updatedAt);
      if (delta !== 0) return delta;
      return a._id.toString().localeCompare(b._id.toString());
    });

  const sortedChunks = [...chunks].sort((a, b) => {
    const delta = toTime(a.createdAt) - toTime(b.createdAt);
    if (delta !== 0) return delta;
    return a._id.toString().localeCompare(b._id.toString());
  });

  let chunkIndex = 0;

  for (let pageIndex = 0; pageIndex < completedPages.length; pageIndex += 1) {
    const page = completedPages[pageIndex];
    const windowEnd = toTime(page.updatedAt);
    const windowStart =
      pageIndex === 0 ? 0 : toTime(completedPages[pageIndex - 1].updatedAt);

    while (chunkIndex < sortedChunks.length) {
      const chunkTime = toTime(sortedChunks[chunkIndex].createdAt);
      if (chunkTime == null) {
        chunkIndex += 1;
        continue;
      }

      if (pageIndex > 0 && chunkTime <= windowStart) {
        break;
      }

      if (chunkTime > windowEnd) {
        break;
      }

      assignments.set(sortedChunks[chunkIndex]._id.toString(), page.url);
      chunkIndex += 1;
    }
  }

  return { assignments, method: 'page-window', completedPages };
}

function assignByTitle(pages, chunks, existing = new Map()) {
  const assignments = new Map(existing);
  const pagesByTitle = new Map();

  for (const page of pages.filter((p) => p.status === 'completed')) {
    const key = normalizeTitle(page.title);
    if (key) pagesByTitle.set(key, page.url);
  }

  for (const chunk of chunks) {
    const chunkId = chunk._id.toString();
    if (assignments.has(chunkId) || chunk.sourceUrl?.trim()) continue;

    const key = normalizeTitle(chunk.chapter);
    const url = pagesByTitle.get(key);
    if (url) assignments.set(chunkId, url);
  }

  return assignments;
}

function buildAssignments(pages, chunks) {
  const pending = chunks.filter((chunk) => !chunk.sourceUrl?.trim());
  if (pending.length === 0) {
    return {
      assignments: new Map(),
      method: 'none',
      warnings: [],
      pendingCount: 0,
      pageCount: 0,
    };
  }

  const warnings = [];
  const { assignments: windowAssignments, completedPages } = assignByPageWindows(
    pages,
    pending,
  );

  let assignments = windowAssignments;
  let method = 'page-window';

  if (assignments.size < pending.length) {
    const before = assignments.size;
    assignments = assignByTitle(pages, pending, assignments);
    if (assignments.size > before) {
      method = 'page-window+title';
    }
  }

  if (assignments.size < pending.length) {
    warnings.push(
      `${pending.length - assignments.size} chunk(s) sem janela temporal — título não bateu`,
    );
  }

  return {
    assignments,
    method,
    warnings,
    pendingCount: pending.length,
    pageCount: completedPages.length,
  };
}

async function backfillDocument(db, document, pages, options) {
  const chunks = await db
    .collection('knowledge_chunks')
    .find({ documentId: document._id, deletedAt: null })
    .project({ chapter: 1, sourceUrl: 1, createdAt: 1 })
    .toArray();

  const { assignments, method, warnings, pendingCount, pageCount } = buildAssignments(
    pages,
    chunks,
  );

  let updated = 0;
  for (const [chunkId, url] of assignments) {
    if (options.dryRun) {
      updated += 1;
      continue;
    }
    const result = await db.collection('knowledge_chunks').updateOne(
      { _id: new mongoose.Types.ObjectId(chunkId), deletedAt: null },
      { $set: { sourceUrl: url } },
    );
    updated += result.modifiedCount;
  }

  const alreadySet = chunks.filter((chunk) => chunk.sourceUrl?.trim()).length;
  const stillMissing = pendingCount - assignments.size;

  return {
    documentTitle: document.title,
    documentId: document._id.toString(),
    totalChunks: chunks.length,
    alreadySet,
    pendingCount,
    assigned: assignments.size,
    updated,
    stillMissing,
    method,
    warnings,
    pageCount,
  };
}

const args = parseArgs(process.argv);

if (args.help) {
  console.log(`Uso: node scripts/backfill-chunk-source-page-url.mjs [opções]

  --dry-run           Simula sem gravar
  --seed=<texto>      Filtra jobs por seedUrl/título (ex.: eberick)
  --doc-id=<id>       Só um documento agregado
`);
  process.exit(0);
}

const uri = loadEnv('MONGODB_URI') || 'mongodb://localhost:27017/qi-conhecimento';

try {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  let documents = [];

  if (args.docId) {
    const doc = await db.collection('knowledge_documents').findOne({
      _id: new mongoose.Types.ObjectId(args.docId),
      deletedAt: null,
    });
    if (!doc) {
      console.error(`Documento ${args.docId} não encontrado.`);
      process.exit(1);
    }
    documents = [doc];
  } else {
    const jobFilter = { deletedAt: null };
    if (args.seed) {
      jobFilter.$or = [
        { 'config.seedUrl': { $regex: args.seed, $options: 'i' } },
        { title: { $regex: args.seed.replace(/-/g, '.*'), $options: 'i' } },
      ];
    }

    const jobs = await db.collection('web_import_jobs').find(jobFilter).toArray();
    const jobIds = jobs.map((job) => job._id);
    const docIdsFromJobs = jobs.map((job) => job.documentId).filter(Boolean);

    const docFilter = {
      deletedAt: null,
      $or: [
        ...(jobIds.length ? [{ webImportJobId: { $in: jobIds } }] : []),
        ...(docIdsFromJobs.length ? [{ _id: { $in: docIdsFromJobs } }] : []),
      ],
    };

    if (docFilter.$or.length === 0) {
      console.log('Nenhum job/documento de web-import encontrado.');
      process.exit(0);
    }

    documents = await db.collection('knowledge_documents').find(docFilter).toArray();
  }

  if (documents.length === 0) {
    console.log('Nenhum documento para backfill.');
    process.exit(0);
  }

  console.log(`\n=== Backfill sourceUrl (${args.dryRun ? 'DRY RUN' : 'APLICAR'}) ===`);
  console.log(`Documentos: ${documents.length}\n`);

  let totalUpdated = 0;
  let totalMissing = 0;

  for (const document of documents) {
    const jobId = document.webImportJobId;
    const pages = jobId
      ? await db
          .collection('web_import_pages')
          .find({ jobId, deletedAt: null })
          .toArray()
      : [];

    if (pages.length === 0) {
      console.log(`• ${document.title}`);
      console.log(`  ID: ${document._id}`);
      console.log('  → sem web_import_pages (job apagado?) — pulando\n');
      continue;
    }

    const result = await backfillDocument(db, document, pages, args);
    totalUpdated += result.updated;
    totalMissing += result.stillMissing;

    console.log(`• ${result.documentTitle}`);
    console.log(`  ID: ${result.documentId}`);
    console.log(`  Chunks: ${result.totalChunks} | já com URL: ${result.alreadySet} | pendentes: ${result.pendingCount}`);
    if (result.pendingCount === 0 && result.alreadySet > 0) {
      console.log('  → backfill já aplicado — nada a fazer');
    } else {
      console.log(`  Páginas completed: ${result.pageCount} | método: ${result.method}`);
      console.log(
        `  ${args.dryRun ? 'Seriam atribuídos' : 'Atualizados'}: ${result.assigned} | ainda sem URL: ${result.stillMissing}`,
      );
    }
    if (pages.length === 0 && result.pendingCount > 0) {
      console.log('  ⚠ web_import_pages ausentes — reimporte o job ou use backup do Mongo');
    }
    for (const warning of result.warnings) {
      console.log(`  ⚠ ${warning}`);
    }
    console.log('');
  }

  console.log(
    args.dryRun
      ? `Total que seria atualizado: ${totalUpdated} chunk(s)`
      : `Total atualizado: ${totalUpdated} chunk(s)`,
  );

  if (totalMissing > 0) {
    console.log(`\n⚠ ${totalMissing} chunk(s) ficaram sem URL — considere reimportar.`);
    process.exit(1);
  }
} finally {
  await mongoose.disconnect();
}
