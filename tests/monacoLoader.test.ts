/**
 * Monaco loader tests.
 *
 * Monaco must be bundled with the app, never fetched from a CDN: importing
 * the shared loader module points `@monaco-editor/react`'s loader at the
 * vendored copy in `public/monaco/vs` instead of the default jsdelivr URL.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const { loaderConfig } = vi.hoisted(() => ({ loaderConfig: vi.fn() }));

vi.mock('@monaco-editor/react', () => ({
  loader: { config: loaderConfig, init: vi.fn() },
  default: () => null,
}));

import { MONACO_LOCAL_VS_PATH } from '../src/lib/monacoLoader';

const vsDir = join(__dirname, '..', 'public', 'monaco', 'vs');

describe('monacoLoader', () => {
  it('points the loader at the local vendored bundle, not a CDN URL', () => {
    expect(loaderConfig).toHaveBeenCalledTimes(1);
    const [config] = loaderConfig.mock.calls[0] as [
      { paths?: { vs?: unknown }; monaco?: unknown },
    ];
    // A local path — relative so it works both from the Vite dev server
    // and from the packaged app loaded off disk. No URL, no CDN.
    expect(config.paths?.vs).toBe(MONACO_LOCAL_VS_PATH);
    expect(typeof config.paths?.vs).toBe('string');
    expect(config.paths?.vs as string).not.toMatch(/^https?:\/\//);
    expect(config.paths?.vs as string).not.toContain('jsdelivr');
    expect((config.paths?.vs as string).startsWith('/')).toBe(false);
    expect(config.monaco).toBeUndefined();
  });

  it('ships the vendored bundle the loader path points at', () => {
    // The AMD loader entry plus the editor core the loader fetches first.
    expect(existsSync(join(vsDir, 'loader.js'))).toBe(true);
    expect(existsSync(join(vsDir, 'editor', 'editor.main.js'))).toBe(true);
    expect(existsSync(join(vsDir, 'editor', 'editor.main.css'))).toBe(true);
    expect(existsSync(join(vsDir, 'editor', 'editor.worker.js'))).toBe(true);
    // The loader must be the AMD loader, not some other bundle.
    expect(readFileSync(join(vsDir, 'loader.js'), 'utf8')).toContain('define');
  });
});
