// 개발 서버를 백그라운드에서 유지하고 재시작하는 보조 스크립트
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const logPath = path.join(root, 'codex-dev-keeper.log');
const log = fs.openSync(logPath, 'a');

function write(message) {
  fs.writeSync(log, `${new Date().toISOString()} ${message}\n`);
}

function start() {
  write('[keeper] starting next dev');
  const child = spawn(process.execPath, [
    path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
    'dev',
    '-H',
    '127.0.0.1',
    '-p',
    '3000',
  ], {
    cwd: root,
    stdio: ['pipe', log, log],
    windowsHide: true,
  });

  child.stdin.write('\n');
  child.on('exit', (code, signal) => {
    write(`[keeper] child exited code=${code} signal=${signal}; restarting`);
    setTimeout(start, 1500);
  });
}

start();
setInterval(() => {}, 2147483647);
