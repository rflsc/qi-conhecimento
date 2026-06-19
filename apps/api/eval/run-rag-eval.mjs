#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_URL = process.env.API_URL ?? 'http://localhost:3100';
const ENDPOINT = `${API_URL}/knowledge/public-ask`;
const TIMEOUT_MS = Number(process.env.EVAL_TIMEOUT_MS ?? 60000);

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

const paint = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

/** Normaliza para comparação tolerante a caixa e acentos. */
function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function includesNormalized(haystack, needle) {
  return normalize(haystack).includes(normalize(needle));
}

async function askApi(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Avalia um caso e retorna { passed, failures[] }. */
function evaluateCase(testCase, result) {
  const failures = [];
  const answer = result.answer ?? '';
  const citations = Array.isArray(result.citations) ? result.citations : [];

  for (const needle of testCase.expectAnswer ?? []) {
    if (!includesNormalized(answer, needle)) {
      failures.push(`resposta não contém "${needle}"`);
    }
  }

  if (testCase.expectAnswerAny?.length) {
    const matched = testCase.expectAnswerAny.some((needle) => includesNormalized(answer, needle));
    if (!matched) {
      failures.push(`resposta não contém nenhum de [${testCase.expectAnswerAny.join(', ')}]`);
    }
  }

  for (const needle of testCase.rejectAnswer ?? []) {
    if (includesNormalized(answer, needle)) {
      failures.push(`resposta contém termo proibido "${needle}"`);
    }
  }

  const expect = testCase.expectCitation;
  if (expect) {
    const match = citations.some((citation) => {
      if (expect.normReference && !includesNormalized(citation.normReference, expect.normReference)) {
        return false;
      }
      if (expect.tableCaption && !includesNormalized(citation.tableCaption, expect.tableCaption)) {
        return false;
      }
      if (expect.pageStart !== undefined && citation.pageStart !== expect.pageStart) {
        return false;
      }
      return true;
    });
    if (!match) {
      failures.push(`nenhuma citação satisfaz ${JSON.stringify(expect)}`);
    }
  }

  for (const needle of testCase.rejectCitationText ?? []) {
    const offender = citations.find(
      (citation) =>
        includesNormalized(citation.excerpt, needle) ||
        includesNormalized(citation.tableCaption, needle),
    );
    if (offender) {
      failures.push(`citação contém texto proibido "${needle}"`);
    }
  }

  if (testCase.maxCitations !== undefined && citations.length > testCase.maxCitations) {
    failures.push(`citações demais: ${citations.length} > ${testCase.maxCitations}`);
  }

  if (testCase.minCitations !== undefined && citations.length < testCase.minCitations) {
    failures.push(`citações de menos: ${citations.length} < ${testCase.minCitations}`);
  }

  return { passed: failures.length === 0, failures };
}

async function main() {
  const datasetPath = process.argv[2]
    ? join(process.cwd(), process.argv[2])
    : join(__dirname, 'rag-cases.json');

  const cases = JSON.parse(await readFile(datasetPath, 'utf8'));

  console.log(paint('bold', `\nRAG eval — ${cases.length} caso(s) contra ${ENDPOINT}\n`));

  let passed = 0;
  const failedCases = [];

  for (const testCase of cases) {
    process.stdout.write(`${paint('gray', '•')} ${testCase.id} ... `);
    try {
      const result = await askApi(testCase.query);
      const { passed: ok, failures } = evaluateCase(testCase, result);
      if (ok) {
        passed += 1;
        console.log(paint('green', 'PASS'));
      } else {
        failedCases.push({ testCase, failures, result });
        console.log(paint('red', 'FAIL'));
        for (const failure of failures) {
          console.log(`    ${paint('red', '✗')} ${failure}`);
        }
        console.log(`    ${paint('gray', `resposta: ${(result.answer ?? '').slice(0, 160).replace(/\n/g, ' ')}…`)}`);
      }
    } catch (error) {
      failedCases.push({ testCase, failures: [error.message], result: null });
      console.log(paint('red', 'ERROR'));
      console.log(`    ${paint('red', '✗')} ${error.message}`);
    }
  }

  const total = cases.length;
  const summaryColor = passed === total ? 'green' : 'red';
  console.log(paint('bold', `\n${paint(summaryColor, `${passed}/${total} passaram`)}\n`));

  if (passed !== total) process.exit(1);
}

main().catch((error) => {
  console.error(paint('red', `Falha ao rodar eval: ${error.message}`));
  process.exit(1);
});
