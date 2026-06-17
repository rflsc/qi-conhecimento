import { execSync } from 'node:child_process';

const ports = [3100, 3101, 3102];

function killWindowsPort(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();

    for (const line of output.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const pid = line.trim().split(/\s+/).at(-1);
      if (pid && pid !== '0') pids.add(pid);
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`Freed port ${port} (PID ${pid})`);
      } catch {
        // process may have already exited
      }
    }
  } catch {
    // no process on port
  }
}

function killUnixPort(port) {
  try {
    execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore', shell: true });
    console.log(`Freed port ${port}`);
  } catch {
    // no process on port
  }
}

for (const port of ports) {
  if (process.platform === 'win32') killWindowsPort(port);
  else killUnixPort(port);
}
