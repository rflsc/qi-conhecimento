import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parserDir = path.join(__dirname, '..', 'apps', 'parser');
const venvDir = path.join(parserDir, '.venv');
const isWin = process.platform === 'win32';

function resolvePython() {
  if (isWin) {
    const py312 = spawnSync('py', ['-3.12', '-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8',
      shell: false,
    });
    if (py312.status === 0 && py312.stdout?.trim()) {
      return py312.stdout.trim();
    }
  }
  return isWin ? 'python' : 'python3';
}

const pythonExe = resolvePython();
const venvPython = path.join(venvDir, isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');

function run(cmd, args, cwd = parserDir) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Usando Python: ${pythonExe}\n`);
console.log('Configurando parser Docling em apps/parser...\n');

run(pythonExe, ['-m', 'venv', '.venv'], parserDir);
run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt']);

console.log('\n✓ Parser pronto. Rode: pnpm parser:dev');
console.log('  Health: http://localhost:8000/health');
