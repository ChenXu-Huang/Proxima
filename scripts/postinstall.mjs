import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const isWindows = process.platform === 'win32';
const wxtBin = resolve('node_modules', '.bin', isWindows ? 'wxt.cmd' : 'wxt');

if (!existsSync(wxtBin)) {
  console.log('[proxima] WXT is not installed; skipping `wxt prepare`.');
  process.exit(0);
}

const result = spawnSync(wxtBin, ['prepare'], {
  stdio: 'inherit',
  shell: isWindows,
});

process.exit(result.status ?? 1);
