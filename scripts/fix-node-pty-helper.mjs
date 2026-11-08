/**
 * fix-node-pty-helper.mjs
 *
 * node-pty 1.1.0 spawns shells on macOS via a small native helper binary
 * (`node_modules/node-pty/prebuilds/<platform>-<arch>/spawn-helper`).
 * The prebuild tarball ships that helper WITHOUT the executable bit, so
 * every fresh `npm install` leaves it mode 644 — and node-pty's
 * `pty.spawn()` then fails with the opaque error "posix_spawnp failed."
 * (verified live 2026-11-07: helper was `-rw-r--r--`, direct exec gave
 * "Permission denied", exit 126; `child_process.spawn` worked fine, so
 * the failure was the helper, not the shell or the environment).
 *
 * Upstream's own post-install script does not chmod it, so this repo does:
 * run as the root `postinstall` script after every install, and the
 * packaged app inherits the +x bit because electron-builder unpacks the
 * helper to `app.asar.unpacked` (node-pty's unixTerminal.js already
 * rewrites `app.asar` -> `app.asar.unpacked` in the helper path).
 *
 * Cross-platform no-op on Windows (spawn-helper is not used there) and
 * never fails the install: missing files are skipped, errors are logged
 * and swallowed with exit 0.
 */
import { chmodSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const helpers = [
  'darwin-x64',
  'darwin-arm64',
  'linux-x64',
  'linux-arm64',
].map((dir) =>
  join(root, 'node_modules', 'node-pty', 'prebuilds', dir, 'spawn-helper'),
);

let fixed = 0;
for (const helper of helpers) {
  if (!existsSync(helper)) continue;
  try {
    chmodSync(helper, 0o755);
    fixed++;
    console.log(`[fix-node-pty-helper] chmod +x ${helper}`);
  } catch (err) {
    console.warn(`[fix-node-pty-helper] could not chmod ${helper}: ${err.message}`);
  }
}
if (fixed === 0) {
  console.log('[fix-node-pty-helper] no node-pty spawn-helper found (skipped)');
}
