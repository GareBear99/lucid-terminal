/**
 * Generate the vendored TypeScript default library (steal #3 — 2026-11-14).
 *
 * Reads the default lib chain out of node_modules/typescript-lsp/lib
 * (the pinned TypeScript 6.x — `typescript-lsp` is an npm alias for
 * `typescript@6.0.3`, so Lucid's own build compiler stays on TS 5.3.3)
 * and writes it as one base64 string into src/lib/tsLibBundle.ts.
 * The renderer decodes it at first use and serves it to the in-process
 * language service as the default lib — no fetch, no IPC, no network,
 * no filesystem read at runtime.
 *
 * Why a bundle instead of the lib files on disk: the renderer has no
 * access to node_modules at runtime (the packaged app is an asar),
 * and the language service host is in-memory only (guest parses in
 * memory, persists nothing). The bundle is the ES2020 full lib
 * (lib.es2020.full.d.ts + its whole `/// <reference lib="…" />`
 * chain: 51 files, ~2.8 MB) — the DOM lib alone is 2.3 MB and
 * Lucid's own code uses DOM types, so the chain is kept whole
 * rather than trimmed. The `/// <reference … />` lines are stripped
 * from the concatenated text (the bundle already contains every
 * referenced file) and the result is parse-checked with the
 * installed TypeScript compiler before it is written — a corrupt
 * bundle fails loudly here, never silently in the editor.
 *
 * The generated chunk is lazy — it is dynamic-imported only when
 * the language service first starts (first TS/JS file open), so it
 * never touches the startup path (cold start on the 8 GB Intel
 * Mac mini is the floor).
 *
 * Re-run after upgrading the pinned TypeScript:
 *   node scripts/generate-ts-lib-assets.mjs
 * (also wired into postinstall, so a fresh `npm install` regenerates
 * it). The generated file is committed, like src/lib/treeSitterWasm.ts
 * — do not edit it by hand.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const libDir = path.join(root, 'node_modules/typescript-lsp/lib');

/** Follow the `/// <reference lib="…" />` chain from the root lib. */
function collectLibFiles() {
  const seen = new Set();
  const order = [];
  const walk = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const file = path.join(libDir, `lib.${name}.d.ts`);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\/\/\/ <reference lib="([^"]+)" \/>/g)) {
      walk(match[1]);
    }
    // Dependencies first (post-order): a file's references are
    // concatenated before it, so the bundle reads top-down.
    order.push({ name, text });
  };
  walk('es2020.full');
  return order;
}

const files = collectLibFiles();
const parts = files.map(({ name, text }) => {
  // Strip the reference directives — the bundle already contains
  // every referenced file, and the host serves the bundle as one
  // lib, so re-resolving them would be work for nothing.
  const stripped = text.replace(/\/\/\/ <reference [^\n]*\n/g, '');
  return `// ---- lib.${name}.d.ts ----\n${stripped}`;
});
const bundle = parts.join('\n');
const b64 = Buffer.from(bundle, 'utf8').toString('base64');

// Parse-check the bundle with the installed TypeScript compiler
// (the build compiler, TS 5.3.3) — a syntax error here means the
// concatenation corrupted a file, and it must fail loudly now.
try {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = ts.createSourceFile(
    'lib.es2020.full.d.ts',
    bundle,
    ts.ScriptTarget.Latest,
    true,
  );
  const errors = source.parseDiagnostics ?? [];
  if (errors.length > 0) {
    console.error('ts-lib bundle failed to parse:', errors.slice(0, 5));
    process.exit(1);
  }
} catch (err) {
  // No TypeScript resolvable (e.g. --omit=dev install) — the
  // bundle is still written; the language service will fail
  // loudly at runtime instead, and the editor falls back to
  // tree-sitter structure (Kite's failure mode).
  console.warn('ts-lib bundle parse check skipped:', err.message);
}

const header = `/**
 * GENERATED — do not edit by hand. See scripts/generate-ts-lib-assets.mjs.
 *
 * The TypeScript 6.x default library (ES2020 full: lib.es2020.full.d.ts
 * + its whole reference chain, ${files.length} files, ${bundle.length} bytes),
 * vendored as base64 so the renderer can serve it to the in-process
 * language service from memory: the packaged app has no node_modules
 * at runtime, and the host is in-memory only (guest parses in memory,
 * persists nothing). Loaded lazily via dynamic import by
 * src/lib/tsLanguageService.ts — never on the startup path.
 * Apache-2.0 (Microsoft, TypeScript).
 */
`;

writeFileSync(
  path.join(root, 'src/lib/tsLibBundle.ts'),
  `${header}\n// ${files.length} lib files, ${bundle.length} bytes, base64 ${b64.length} chars.\nexport const TS_LIB_BUNDLE_BASE64 = '${b64}';\n`,
);
console.log(
  'ts-lib assets generated:',
  `${files.length} files, ${bundle.length} B -> src/lib/tsLibBundle.ts`,
);
