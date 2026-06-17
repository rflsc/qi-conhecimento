import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parserDir = path.join(__dirname, '..', 'apps', 'parser');
const isWin = process.platform === 'win32';
const venvPython = path.join(parserDir, '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');

if (!fs.existsSync(venvPython)) {
  console.error('Ambiente virtual não encontrado. Rode primeiro: pnpm parser:setup');
  process.exit(1);
}

const env = {
  ...process.env,
  PARSER_PORT: '8000',
  PARSER_MAX_UPLOAD_MB: process.env.PARSER_MAX_UPLOAD_MB ?? '50',
  PARSER_DO_OCR: process.env.PARSER_DO_OCR ?? 'false',
};

console.log('Iniciando parser Docling em http://localhost:8000');
console.log('(Primeira subida baixa modelos — pode levar alguns minutos)\n');

const child = spawn(
  venvPython,
  ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000', '--reload'],
  { cwd: parserDir, stdio: 'inherit', env, shell: false },
);

child.on('exit', (code) => process.exit(code ?? 0));

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
