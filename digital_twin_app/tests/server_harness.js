// Starts server.js as a child process on a given port and waits until it is listening.
const { spawn } = require('node:child_process');
const path = require('node:path');

function startServer(port) {
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const logs = [];
  const collect = chunk => logs.push(...chunk.toString().split(/\r?\n/).filter(Boolean));
  proc.stdout.on('data', collect);
  proc.stderr.on('data', collect);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Server did not start on port ${port}:\n${logs.join('\n')}`));
    }, 10000);
    proc.stdout.on('data', () => {
      if (logs.some(line => line.includes(`localhost:${port}`))) {
        clearTimeout(timer);
        resolve({
          url: `http://localhost:${port}`,
          logs,
          stop: () => new Promise(done => {
            if (proc.exitCode !== null) return done();
            proc.once('exit', done);
            proc.kill();
          })
        });
      }
    });
    proc.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited with code ${code}:\n${logs.join('\n')}`));
    });
  });
}

module.exports = { startServer };
