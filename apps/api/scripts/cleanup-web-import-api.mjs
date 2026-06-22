/**
 * Apaga documentos/pílulas/jobs de importação web via API REST.
 * Uso: node scripts/cleanup-web-import-api.mjs [--seed=altoqi-eberick] [--dry-run]
 */
const API = process.env.API_URL ?? 'http://localhost:3100';
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@altoqi.com.br';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'AdminQi123!';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const seedArg = args.find((a) => a.startsWith('--seed='));
const seedPattern = (seedArg ? seedArg.split('=')[1] : 'altoqi-eberick').toLowerCase();

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const login = await request('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const headers = {
  Authorization: `Bearer ${login.accessToken}`,
  'Content-Type': 'application/json',
};

const jobsRes = await request('/knowledge/web-imports?page=1&limit=100', { headers });
const jobs = (jobsRes.data ?? []).filter((job) => {
  const seed = job.config?.seedUrl?.toLowerCase() ?? '';
  const title = job.title?.toLowerCase() ?? '';
  return seed.includes(seedPattern) || title.includes(seedPattern.replace(/-/g, ' '));
});

console.log(`Jobs (${jobs.length}):`);
for (const job of jobs) {
  console.log(`  - ${job.id} | ${job.title} | ${job.status}`);
}

const toDelete = [];
let page = 1;
const limit = 100;

while (true) {
  const res = await request(`/knowledge/documents?page=${page}&limit=${limit}`, { headers });
  const rows = res.data ?? [];
  for (const doc of rows) {
    const ref = doc.sourceReference?.toLowerCase() ?? '';
    const title = doc.title?.toLowerCase() ?? '';
    const fromSite = ref.includes('suporte.altoqi.com.br/hc/pt-br');
    const fromJobTitle = title.includes('eberick') || seedPattern.replace(/-/g, ' ').split(' ').every((w) => title.includes(w));
    if (doc.sourceType === 'link' && (fromSite || fromJobTitle)) {
      toDelete.push(doc);
    }
  }
  if (page * limit >= (res.total ?? 0) || rows.length === 0) break;
  page += 1;
}

console.log(`\nDocumentos a apagar (${toDelete.length}):`);
for (const doc of toDelete.slice(0, 8)) {
  console.log(`  - ${doc.id} | ${doc.title?.slice(0, 55)}`);
}
if (toDelete.length > 8) console.log(`  … e mais ${toDelete.length - 8}`);

if (dryRun) {
  console.log('\n[dry-run] Nada foi apagado.');
  process.exit(0);
}

let deletedDocs = 0;
for (const doc of toDelete) {
  await request(`/knowledge/documents/${doc.id}`, { method: 'DELETE', headers });
  deletedDocs += 1;
  if (deletedDocs % 25 === 0) console.log(`  ${deletedDocs}/${toDelete.length} documentos…`);
}

for (const job of jobs) {
  if (job.status !== 'cancelled' && job.status !== 'completed' && job.status !== 'failed') {
    try {
      await request(`/knowledge/web-imports/${job.id}/cancel`, { method: 'POST', headers });
    } catch {
      // job pode já ter terminado
    }
  }
}

console.log(`\nApagados ${deletedDocs} documento(s) (+ pílulas via API).`);
console.log(`${jobs.length} job(s) de importação identificado(s) — recrie após o fix de documento único.`);
