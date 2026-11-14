/**
 * Restore node_modules/.bin/tsc + tsserver to the project's
 * own TypeScript (5.x, devDependency `typescript`).
 *
 * The TS-LSP slice installs the TS 6 engine as the npm alias
 * `typescript-lsp` (typescript@6.0.3). The alias IS the
 * typescript package, so its bin (`tsc`, `tsserver`) collides
 * with the project's own — npm lets the last install win, and
 * .bin/tsc ends up pointing at the 6.0.3 binary. That breaks
 * the build: TS 6 errors on the project's deprecated
 * `baseUrl` (TS5101, exit 2), and the build compiler is
 * supposed to stay 5.x while 6.x is only the runtime engine.
 *
 * Run from postinstall (after npm has created the .bin
 * links). Never fails the install — a missed restore is
 * reported, and the next npm install re-runs this script.
 */
import { existsSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const binDir = join(root, 'node_modules', '.bin');

for (const name of ['tsc', 'tsserver']) {
  const link = join(binDir, name);
  const target = join('..', 'typescript', 'bin', name);
  try {
    if (existsSync(link)) {
      // readlinkSync would tell us the current target; the
      // cheap correct move is to always re-point it — the
      // link is either already right (a no-op rewrite) or
      // pointing at typescript-lsp (the bug this fixes).
      unlinkSync(link);
    }
    symlinkSync(target, link);
  } catch (error) {
    console.warn(
      `[fix-typescript-bin] could not restore .bin/${name} to the project TypeScript: ${error.message}`,
    );
  }
}
