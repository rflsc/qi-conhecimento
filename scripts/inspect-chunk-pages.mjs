#!/usr/bin/env node
/**
 * Inspeciona cobertura de páginas nos chunks de um documento.
 *
 * Uso:
 *   node scripts/inspect-chunk-pages.mjs
 *   node scripts/inspect-chunk-pages.mjs --norm "NBR 8800"
 *   node scripts/inspect-chunk-pages.mjs --doc-id <objectId> --max-page 279
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
  const args = { norm: 'NBR 8800', docId: null, maxPage: null, minChars: 40 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--norm') args.norm = argv[++i];
    else if (arg === '--doc-id') args.docId = argv[++i];
    else if (arg === '--max-page') args.maxPage = Number(argv[++i]);
    else if (arg === '--min-chars') args.minChars = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') {
      console.log(`Uso: node scripts/inspect-chunk-pages.mjs [opções]

  --norm "NBR 8800"   Filtra documento por normReference (default: NBR 8800)
  --doc-id <id>       ObjectId do documento (ignora --norm)
  --max-page <n>      Espera páginas 1..n para detectar lacunas
  --min-chars <n>     Chunks com menos caracteres são "suspeitos" (default: 40)
`);
      process.exit(0);
    }
  }
  return args;
}

function formatRange(pages) {
  if (pages.length === 0) return '(nenhuma)';
  const sorted = [...pages].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const page = sorted[i];
    if (page === prev + 1) {
      prev = page;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = page;
    prev = page;
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

const args = parseArgs(process.argv);
const uri = loadEnv('MONGODB_URI');
if (!uri) {
  console.error('MONGODB_URI não encontrada no .env');
  process.exit(1);
}

try {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const { ObjectId } = mongoose.Types;

  let document;
  if (args.docId) {
    document = await db.collection('knowledge_documents').findOne({
      _id: new ObjectId(args.docId),
      deletedAt: null,
    });
  } else {
    const candidates = await db
      .collection('knowledge_documents')
      .find({
        $or: [
          { normReference: { $regex: args.norm.replace(/\s+/g, '\\s*'), $options: 'i' } },
          { title: { $regex: args.norm, $options: 'i' } },
        ],
        deletedAt: null,
      })
      .toArray();

    if (candidates.length === 0) {
      console.error(`Documento não encontrado (norm/title: "${args.norm}")`);
      process.exit(1);
    }

    if (candidates.length > 1) {
      console.log(`Encontrados ${candidates.length} documentos — usando o com mais chunks:\n`);
      for (const c of candidates) {
        const n = await db.collection('knowledge_chunks').countDocuments({
          documentId: c._id,
          deletedAt: null,
        });
        console.log(`  ${c._id}  ${c.ingestionStatus?.padEnd(10) ?? '?'}  ${n} chunks  ${c.title}`);
      }
      console.log('');
    }

    const withCounts = await Promise.all(
      candidates.map(async (c) => ({
        doc: c,
        chunks: await db.collection('knowledge_chunks').countDocuments({
          documentId: c._id,
          deletedAt: null,
        }),
      })),
    );
    withCounts.sort((a, b) => b.chunks - a.chunks);
    document = withCounts[0]?.doc;
  }

  if (!document) {
    console.error(`Documento não encontrado (norm/title: "${args.norm}")`);
    process.exit(1);
  }

  const chunks = await db
    .collection('knowledge_chunks')
    .find({ documentId: document._id, deletedAt: null })
    .project({
      pageStart: 1,
      pageEnd: 1,
      contentType: 1,
      tableCaption: 1,
      markdownContent: 1,
      normItem: 1,
    })
    .sort({ pageStart: 1, _id: 1 })
    .toArray();

  const byPage = new Map();
  const noPage = [];
  const empty = [];
  const short = [];
  const tables = [];

  for (const chunk of chunks) {
    const text = chunk.markdownContent ?? '';
    const len = text.trim().length;
    if (len === 0) empty.push(chunk);
    else if (len < args.minChars) short.push({ chunk, len });

    if (chunk.contentType === 'table' || chunk.tableCaption) {
      tables.push(chunk);
    }

    if (chunk.pageStart == null) {
      noPage.push(chunk);
      continue;
    }

    const start = chunk.pageStart;
    const end = chunk.pageEnd ?? start;
    for (let p = start; p <= end; p += 1) {
      if (!byPage.has(p)) byPage.set(p, []);
      byPage.get(p).push(chunk);
    }
  }

  const coveredPages = [...byPage.keys()].sort((a, b) => a - b);
  const maxObserved = coveredPages.length ? coveredPages[coveredPages.length - 1] : 0;
  const maxPage = args.maxPage ?? maxObserved;

  const gaps = [];
  for (let p = 1; p <= maxPage; p += 1) {
    if (!byPage.has(p)) gaps.push(p);
  }

  console.log('\n=== Cobertura de chunks por página ===\n');
  console.log(`Documento: ${document.title}`);
  console.log(`ID:        ${document._id.toString()}`);
  console.log(`Norma:     ${document.normReference ?? '(sem normReference)'}`);
  console.log(`Status:    ${document.ingestionStatus ?? '?'}`);
  console.log(`Chunks:    ${chunks.length} total`);
  console.log(`Com page:  ${chunks.length - noPage.length}`);
  console.log(`Sem page:  ${noPage.length}`);
  console.log(`Tabelas:   ${tables.length}`);
  console.log(`Páginas cobertas (1..${maxPage}): ${coveredPages.length}/${maxPage}`);

  if (gaps.length === 0) {
    console.log('\n✓ Nenhuma lacuna de página detectada.');
  } else {
    console.log(`\n✗ Lacunas (${gaps.length} páginas sem chunk): ${formatRange(gaps)}`);
  }

  if (noPage.length > 0) {
    console.log(`\n⚠ Chunks sem pageStart (${noPage.length}) — importação anterior à v5 ou fallback pdf-parse`);
  }

  if (empty.length > 0) {
    console.log(`\n✗ Chunks vazios: ${empty.length}`);
  }

  if (short.length > 0) {
    console.log(`\n⚠ Chunks curtos (< ${args.minChars} chars): ${short.length}`);
    for (const { chunk, len } of short.slice(0, 8)) {
      const preview = (chunk.markdownContent ?? '').trim().slice(0, 60).replace(/\n/g, ' ');
      console.log(
        `  p.${chunk.pageStart ?? '?'} [${chunk.contentType ?? '?'}] ${len} chars — "${preview}…"`,
      );
    }
    if (short.length > 8) console.log(`  … e mais ${short.length - 8}`);
  }

  const h1 = chunks.filter(
    (c) =>
      /tabela\s+h\.?\s*1/i.test(c.tableCaption ?? '') ||
      /tabela\s+h\.?\s*1/i.test(c.markdownContent ?? ''),
  );
  console.log(`\n--- Tabela H.1 ---`);
  if (h1.length === 0) {
    console.log('✗ Nenhum chunk com Tabela H.1 encontrado');
  } else {
    for (const c of h1) {
      const hasBody = /\|.+\|/.test(c.markdownContent ?? '');
      console.log(
        `  p.${c.pageStart ?? '?'} [${c.contentType ?? '?'}] caption="${(c.tableCaption ?? '').slice(0, 50)}" body=${hasBody ? 'sim' : 'NÃO'}`,
      );
    }
  }

  const densePages = [...byPage.entries()]
    .filter(([, list]) => list.length === 0)
    .map(([p]) => p);
  if (densePages.length) {
    console.log(`\nPáginas sem chunks: ${formatRange(densePages)}`);
  }

  const multiChunkPages = [...byPage.entries()]
    .filter(([, list]) => list.length >= 4)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);
  if (multiChunkPages.length) {
    console.log('\nPáginas com mais chunks (normal em tabelas densas):');
    for (const [page, list] of multiChunkPages) {
      console.log(`  p.${page}: ${list.length} chunks`);
    }
  }

  console.log('');
  if (gaps.length > 0 || empty.length > 0 || h1.some((c) => !/\|.+\|/.test(c.markdownContent ?? ''))) {
    process.exit(1);
  }
} finally {
  await mongoose.disconnect();
}
