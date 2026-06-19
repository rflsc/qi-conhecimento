import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const parserDir = path.join(repoRoot, 'apps', 'parser');
const isWin = process.platform === 'win32';
const venvPython = path.join(parserDir, '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');

/** Lê PARSER_* (e demais) do .env da raiz — o parser não carrega esse arquivo sozinho. */
function loadRootEnv() {
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

if (!fs.existsSync(venvPython)) {
  console.error('Ambiente virtual não encontrado. Rode primeiro: pnpm parser:setup');
  process.exit(1);
}

const rootEnv = loadRootEnv();

const env = {
  ...rootEnv,
  ...process.env,
  PARSER_PORT: '8000',
  PARSER_MAX_UPLOAD_MB: process.env.PARSER_MAX_UPLOAD_MB ?? rootEnv.PARSER_MAX_UPLOAD_MB ?? '150',
  PARSER_DO_OCR: process.env.PARSER_DO_OCR ?? rootEnv.PARSER_DO_OCR ?? 'false',
  PARSER_LOW_MEMORY: process.env.PARSER_LOW_MEMORY ?? rootEnv.PARSER_LOW_MEMORY ?? 'true',
};

const profile = env.PARSER_PROFILE ?? 'default';
const workers = env.PARSER_PARALLEL_WORKERS ?? '(auto)';
const threads = env.PARSER_THREADS_PER_WORKER ?? '(auto)';
const batch = env.PARSER_PAGE_BATCH_SIZE ?? '(auto)';
console.log('Iniciando parser Docling em http://localhost:8000');
console.log(`Perfil: PARSER_PROFILE=${profile}`);
console.log(`Paralelismo: workers=${workers} threads/worker=${threads} batch=${batch}`);
console.log('(Primeira subida baixa modelos — pode levar alguns minutos)\n');

const useReload = process.env.PARSER_RELOAD === 'true';
const uvicornArgs = [
  '-m',
  'uvicorn',
  'app.main:app',
  '--host',
  '0.0.0.0',
  '--port',
  '8000',
];
if (useReload) {
  uvicornArgs.push('--reload');
  console.log('PARSER_RELOAD=true — reload ativo (pode interromper PDFs longos em processamento)\n');
}

const child = spawn(venvPython, uvicornArgs, { cwd: parserDir, stdio: 'inherit', env, shell: false });

child.on('exit', (code) => process.exit(code ?? 0));

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
