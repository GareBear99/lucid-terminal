/**
 * Generate the vendored tree-sitter WASM bytes (steal #2 — 2026-11-14).
 *
 * Reads the three .wasm files out of node_modules and writes them as
 * base64 string constants into src/lib/treeSitterWasm.ts. The renderer
 * decodes them at first use and instantiates the parsers from the
 * bytes — no fetch, no IPC, no network.
 *
 * Why base64 in a generated .ts file instead of copying the .wasm
 * files into public/ and fetching them: the packaged app loads its
 * page from disk (loadFile, file://) with webSecurity on, and a
 * file:// page cannot fetch a sibling file:// URL. The Monaco
 * bundle gets away with script tags (not subject to CORS); a .wasm
 * has no such path. Base64 in the bundle works identically in dev,
 * in the packaged app, and offline. The generated chunk is lazy —
 * it is dynamic-imported only when the first TS/JS file opens, so
 * it never touches the startup path (cold start on the 8 GB Intel
 * Mac mini is the floor).
 *
 * Re-run after upgrading web-tree-sitter or tree-sitter-typescript:
 *   node scripts/generate-tree-sitter-assets.mjs
 * (also wired into postinstall, so a fresh `npm install` regenerates
 * it). The generated file is committed, like public/monaco/vs —
 * do not edit it by hand.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = {
  CORE: 'node_modules/web-tree-sitter/web-tree-sitter.wasm',
  TYPESCRIPT: 'node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm',
  TSX: 'node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm',
};

const parts = [];
for (const [name, rel] of Object.entries(SOURCES)) {
  const bytes = readFileSync(path.join(root, rel));
  const b64 = bytes.toString('base64');
  parts.push(`// ${rel} — ${bytes.length} bytes, base64 ${b64.length} chars.\nexport const TREE_SITTER_${name}_WASM_BASE64 = '${b64}';`);
}

const header = `/**
 * GENERATED — do not edit by hand. See scripts/generate-tree-sitter-assets.mjs.
 *
 * The tree-sitter WASM binaries, vendored as base64 so the renderer
 * can instantiate them from bytes: the packaged app loads from disk
 * (file://) with webSecurity on, and a file:// page cannot fetch a
 * sibling file:// URL. All three are MIT (tree-sitter core +
 * tree-sitter-typescript grammars). Loaded lazily via dynamic import
 * by src/lib/treeSitter.ts — never on the startup path.
 */
`;

writeFileSync(path.join(root, 'src/lib/treeSitterWasm.ts'), header + '\n' + parts.join('\n\n') + '\n');
console.log(
  'tree-sitter assets generated:',
  Object.entries(SOURCES)
    .map(([name, rel]) => `${name} ${readFileSync(path.join(root, rel)).length} B`)
    .join(', '),
);
