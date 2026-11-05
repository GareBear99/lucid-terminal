/**
 * Monaco is bundled with the app — it is never fetched from a CDN.
 *
 * `@monaco-editor/react` loads Monaco from cdn.jsdelivr.net unless it is
 * told otherwise, which left both the prompt input and the file editor
 * dead whenever the network (or the CDN) was down. The loader is pointed
 * at a copy of Monaco's `min/vs` shipped inside the app instead
 * (`public/monaco/vs`, copied to `dist/monaco/vs` by the build), so both
 * surfaces work offline and make no remote request.
 *
 * The `vs` path is relative on purpose: in dev the page is served from the
 * Vite server (`/monaco/vs/loader.js`), in the packaged app it is loaded
 * from disk (`dist/monaco/vs/loader.js`). An absolute path would break the
 * packaged app.
 *
 * When `monaco-editor` is upgraded, re-copy the bundle:
 *   cp -r node_modules/monaco-editor/min/vs public/monaco/vs
 *
 * Import this module once (for its side effect) before any surface calls
 * `loader.init()` — each Monaco surface does that itself.
 */
import { loader } from '@monaco-editor/react';

// How long a surface waits for Monaco before falling back to a plain
// textarea. Same wait as the prompt input used to give the CDN.
export const MONACO_LOAD_TIMEOUT_MS = 8000;

// Local path (relative to the served app root) of the vendored Monaco
// bundle. No CDN, no remote fetch.
export const MONACO_LOCAL_VS_PATH = 'monaco/vs';

export function configureMonacoLoader(): void {
  loader.config({ paths: { vs: MONACO_LOCAL_VS_PATH } });
}

configureMonacoLoader();
