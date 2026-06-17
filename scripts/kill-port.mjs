import { execSync } from 'node:child_process';

const port = Number(process.argv[2] ?? 3100);

function killWindowsPort(targetPort) {
  try {
    const output = execSync('netstat -ano', { encoding: 'utf8' });
    const pids = new Set();

    for (const line of output.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const match = line.match(new RegExp(`:${targetPort}\\s`));
      if (!match) continue;
      const pid = line.trim().split(/\s+/).at(-1);
      if (pid && pid !== '0') pids.add(pid);
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
        console.log(`Freed port ${targetPort} (PID ${pid})`);
      } catch {
        // already exited
      }
    }
  } catch {
    // no process
  }
}

function killUnixPort(targetPort) {
  try {
    execSync(`lsof -ti:${targetPort} | xargs -r kill -9`, { stdio: 'ignore', shell: true });
    console.log(`Freed port ${targetPort}`);
  } catch {
    // no process
  }
}

if (process.platform === 'win32') killWindowsPort(port);
else killUnixPort(port);
