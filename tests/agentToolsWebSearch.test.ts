/**
 * The web tools — web_search / web_read_page (Gary, 2026-11-16:
 * "the first browser way can be made now on the browser tab we
 * have").
 *
 * The tools go through the host's web methods (IPC to main, where
 * the in-panel browser tab loads the page) — never a raw fetch
 * from the renderer. These tests pin that: the definitions exist
 * with the right shape, a missing arg is an error, a host without
 * the browser bridge reports honestly that web search is
 * unavailable, a host failure is an error result (never a faked
 * answer), a non-http(s) URL is refused before it reaches the
 * host, and a huge result is capped.
 *
 * Run with: npm test tests/agentToolsWebSearch.test.ts
 */
import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '../src/lib/agentTools';
import {
  getBuiltInToolDefinitions,
  registerBuiltInTools,
} from '../src/lib/agentToolsImpl';
import type { AgentToolContext } from '../src/lib/agentTools';
import { AgentFileIndex } from '../src/lib/agentIndex';
import { MemoryAgentHost, makeTestWorkspace } from './agentTestHost';
import type { BrowserAiResult } from '../src/lib/browserActions';

function makeSetup() {
  const host = new MemoryAgentHost(makeTestWorkspace());
  const index = new AgentFileIndex(host);
  const registry = new ToolRegistry();
  registerBuiltInTools(registry);
  const ctx: AgentToolContext = {
    workspaceRoot: '/ws',
    cwd: '/ws',
    isGuest: false,
    host,
    index,
  };
  return { host, index, registry, ctx };
}

describe('web tools — definitions', () => {
  it('web_search and web_read_page are registered, read-only, no approval needed', () => {
    const definitions = getBuiltInToolDefinitions();
    const names = definitions.map((d) => d.function.name);
    expect(names).toContain('web_search');
    expect(names).toContain('web_read_page');
    for (const name of ['web_search', 'web_read_page']) {
      const def = definitions.find((d) => d.function.name === name)!;
      expect(def.readonly).toBe(true);
      expect(def.defaultPolicy).toBe('allowedWithoutPermission');
    }
    expect(
      definitions.find((d) => d.function.name === 'web_search')!.function.parameters.required,
    ).toEqual(['query']);
    expect(
      definitions.find((d) => d.function.name === 'web_read_page')!.function.parameters.required,
    ).toEqual(['url']);
  });
});

describe('web_search', () => {
  it('a missing query is an error, never a call', async () => {
    const { registry, ctx, host } = makeSetup();
    host.webSearch = vi.fn();
    const result = await registry.call('web_search', {}, ctx);
    expect(result.ok).toBe(false);
    // The registry enforces required args before the
    // implementation runs, so the message is its own.
    expect(result.error).toMatch(/missing required argument: query/i);
    expect(host.webSearch).not.toHaveBeenCalled();
  });

  it('a host without the browser bridge reports honestly that web search is unavailable', async () => {
    const { registry, ctx } = makeSetup();
    // MemoryAgentHost has no webSearch — the tool must say so,
    // never guess a result and never fetch from the renderer.
    const result = await registry.call('web_search', { query: 'latest Electron version' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not available/i);
    expect(result.error).toMatch(/browser/i);
  });

  it('a host success returns the results text', async () => {
    const { registry, ctx, host } = makeSetup();
    const text = '1. Electron 36\n   https://electronjs.org\n   The latest release.';
    host.webSearch = vi.fn(async (): Promise<BrowserAiResult> => ({ ok: true, text }));
    const result = await registry.call('web_search', { query: 'latest Electron version' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('Electron 36');
    expect(host.webSearch).toHaveBeenCalledWith('latest Electron version');
  });

  it('a host failure is an error result, never a faked answer', async () => {
    const { registry, ctx, host } = makeSetup();
    host.webSearch = vi.fn(async (): Promise<BrowserAiResult> => ({
      ok: false,
      error: 'Search timed out after 15s.',
    }));
    const result = await registry.call('web_search', { query: 'latest Electron version' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timed out/i);
  });

  it('a host throw is an error result, never a crash', async () => {
    const { registry, ctx, host } = makeSetup();
    host.webSearch = vi.fn(async (): Promise<BrowserAiResult> => {
      throw new Error('IPC channel closed');
    });
    const result = await registry.call('web_search', { query: 'latest Electron version' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/IPC channel closed/);
  });

  it('a huge result is capped, never dumped whole', async () => {
    const { registry, ctx, host } = makeSetup();
    host.webSearch = vi.fn(async (): Promise<BrowserAiResult> => ({
      ok: true,
      text: 'x'.repeat(25_000),
    }));
    const result = await registry.call('web_search', { query: 'big' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output.length).toBeLessThan(25_000);
    expect(result.output).toMatch(/truncated/);
  });
});

describe('web_read_page', () => {
  it('a missing URL is an error, never a call', async () => {
    const { registry, ctx, host } = makeSetup();
    host.readWebPage = vi.fn();
    const result = await registry.call('web_read_page', {}, ctx);
    expect(result.ok).toBe(false);
    // The registry enforces required args before the
    // implementation runs, so the message is its own.
    expect(result.error).toMatch(/missing required argument: url/i);
    expect(host.readWebPage).not.toHaveBeenCalled();
  });

  it('a non-http(s) URL is refused before it reaches the host', async () => {
    const { registry, ctx, host } = makeSetup();
    host.readWebPage = vi.fn();
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/x']) {
      const result = await registry.call('web_read_page', { url }, ctx);
      expect(result.ok, url).toBe(false);
      expect(result.error, url).toMatch(/only http/i);
    }
    expect(host.readWebPage).not.toHaveBeenCalled();
  });

  it('an invalid URL is refused before it reaches the host', async () => {
    const { registry, ctx, host } = makeSetup();
    host.readWebPage = vi.fn();
    const result = await registry.call('web_read_page', { url: 'not a url at all' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not a valid URL/i);
    expect(host.readWebPage).not.toHaveBeenCalled();
  });

  it('a host without the browser bridge reports honestly that page reading is unavailable', async () => {
    const { registry, ctx } = makeSetup();
    const result = await registry.call(
      'web_read_page',
      { url: 'https://example.com/docs' },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not available/i);
  });

  it('a host success returns the page text', async () => {
    const { registry, ctx, host } = makeSetup();
    const text = 'Page: Docs (https://example.com/docs)\n\nThe docs say hello.';
    host.readWebPage = vi.fn(async (): Promise<BrowserAiResult> => ({ ok: true, text }));
    const result = await registry.call(
      'web_read_page',
      { url: 'https://example.com/docs' },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain('The docs say hello.');
    expect(host.readWebPage).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('a host failure is an error result, never a faked page', async () => {
    const { registry, ctx, host } = makeSetup();
    host.readWebPage = vi.fn(async (): Promise<BrowserAiResult> => ({
      ok: false,
      error: 'Page load timed out after 15s: https://example.com/docs.',
    }));
    const result = await registry.call(
      'web_read_page',
      { url: 'https://example.com/docs' },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timed out/i);
  });
});
