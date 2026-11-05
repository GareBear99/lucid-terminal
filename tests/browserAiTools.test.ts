/**
 * Browser AI tools (Area 5) tests: the `browser_*` tool definitions
 * in `electron/services/aiTools.ts` and their `executeTool` cases,
 * driven against a fake bridge target (no Electron, no page).
 *
 * The tools must run through the local main-process bridge — the
 * AI asks, main acts. When no target is registered the tools
 * report cleanly instead of throwing; bad arguments are clean
 * error strings and never reach the target.
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  tools,
  executeTool,
  browserToolNames,
} from '../electron/services/aiTools';
import {
  registerBrowserToolTarget,
  clearBrowserToolTarget,
  BROWSER_TOOL_UNAVAILABLE,
} from '../electron/services/browserToolBridge';

const EXPECTED_TOOLS = [
  'browser_navigate',
  'browser_read_page',
  'browser_click',
  'browser_fill',
  'browser_screenshot',
  'browser_get_state',
  'browser_search',
  // Area 7: scripted flows.
  'browser_run_flow',
  // Area 8: CDP trusted click.
  'browser_trusted_click',
];

describe('browser tool definitions', () => {
  it('defines all nine browser tools', () => {
    const names = tools.map((t) => t.function.name);
    for (const name of EXPECTED_TOOLS) {
      expect(names).toContain(name);
    }
  });

  it('requires url / selector / value / query where the tool needs them', () => {
    const byName = new Map(tools.map((t) => [t.function.name, t.function]));
    expect(byName.get('browser_navigate')?.parameters.required).toEqual([
      'url',
    ]);
    expect(byName.get('browser_click')?.parameters.required).toEqual([
      'selector',
    ]);
    expect(byName.get('browser_fill')?.parameters.required).toEqual([
      'selector',
      'value',
    ]);
    expect(byName.get('browser_search')?.parameters.required).toEqual([
      'query',
    ]);
    expect(byName.get('browser_read_page')?.parameters.required).toBeUndefined();
    expect(byName.get('browser_screenshot')?.parameters.required).toBeUndefined();
    expect(byName.get('browser_get_state')?.parameters.required).toBeUndefined();
  });

  it('the allowlist is exactly the nine browser tools', () => {
    expect([...browserToolNames].sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  it('the fill description steers the AI away from password fields', () => {
    const fill = tools.find((t) => t.function.name === 'browser_fill');
    expect(fill?.function.description).toMatch(/password/i);
  });
});

describe('executeTool browser cases', () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const fakeTarget = {
    navigate: vi.fn(async (url: string) => {
      calls.push({ name: 'navigate', args: url });
      return `Opened ${url}.`;
    }),
    readPage: vi.fn(async () => {
      calls.push({ name: 'readPage', args: undefined });
      return 'Page text here.';
    }),
    click: vi.fn(async (selector: string) => {
      calls.push({ name: 'click', args: selector });
      return `Clicked ${selector}.`;
    }),
    fill: vi.fn(async (selector: string, value: string) => {
      calls.push({ name: 'fill', args: { selector, value } });
      return `Filled ${selector}.`;
    }),
    screenshot: vi.fn(async () => {
      calls.push({ name: 'screenshot', args: undefined });
      return 'Screenshot saved to /tmp/shot.png.';
    }),
    getState: vi.fn(async () => {
      calls.push({ name: 'getState', args: undefined });
      return '{"url": "https://example.com/"}';
    }),
    search: vi.fn(async (query: string) => {
      calls.push({ name: 'search', args: query });
      return '1. Result\n   https://example.com/';
    }),
    runFlow: vi.fn(async (definition: unknown) => {
      calls.push({ name: 'runFlow', args: definition });
      return 'Flow started: Test flow.';
    }),
    trustedClick: vi.fn(async (selector: string) => {
      calls.push({ name: 'trustedClick', args: selector });
      return `Clicked ${selector} (trusted input).`;
    }),
  };

  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
    registerBrowserToolTarget(fakeTarget);
  });

  afterEach(() => {
    clearBrowserToolTarget();
  });

  it('navigate/read/click/fill/screenshot/state/search reach the target', async () => {
    expect(
      await executeTool('browser_navigate', { url: 'https://example.com/' }),
    ).toBe('Opened https://example.com/.');
    expect(await executeTool('browser_read_page', {})).toBe('Page text here.');
    expect(await executeTool('browser_click', { selector: '#go' })).toBe(
      'Clicked #go.',
    );
    expect(
      await executeTool('browser_fill', { selector: '#q', value: 'hi' }),
    ).toBe('Filled #q.');
    expect(await executeTool('browser_screenshot', {})).toBe(
      'Screenshot saved to /tmp/shot.png.',
    );
    expect(await executeTool('browser_get_state', {})).toBe(
      '{"url": "https://example.com/"}',
    );
    expect(await executeTool('browser_search', { query: 'lucid' })).toBe(
      '1. Result\n   https://example.com/',
    );
    expect(
      await executeTool('browser_run_flow', {
        definition: {
          name: 'Test flow',
          steps: [{ kind: 'click', selector: '#go' }],
        },
      }),
    ).toBe('Flow started: Test flow.');
    expect(await executeTool('browser_trusted_click', { selector: '#buy' })).toBe(
      'Clicked #buy (trusted input).',
    );
    expect(calls.map((c) => c.name)).toEqual([
      'navigate',
      'readPage',
      'click',
      'fill',
      'screenshot',
      'getState',
      'search',
      'runFlow',
      'trustedClick',
    ]);
  });

  it('bad arguments are clean errors and never reach the target', async () => {
    expect(await executeTool('browser_navigate', { url: '' })).toMatch(
      /needs a url/,
    );
    expect(await executeTool('browser_navigate', {})).toMatch(/needs a url/);
    expect(await executeTool('browser_click', { selector: '  ' })).toMatch(
      /needs a selector/,
    );
    expect(
      await executeTool('browser_fill', { selector: '#q' }),
    ).toMatch(/needs a value/);
    expect(await executeTool('browser_search', { query: '' })).toMatch(
      /needs a query/,
    );
    expect(await executeTool('browser_run_flow', {})).toMatch(
      /needs a flow definition/,
    );
    expect(await executeTool('browser_run_flow', { definition: 'nope' })).toMatch(
      /needs a flow definition/,
    );
    expect(await executeTool('browser_trusted_click', { selector: '' })).toMatch(
      /needs a selector/,
    );
    expect(calls).toHaveLength(0);
  });

  it('no registered target reports unavailable instead of throwing', async () => {
    clearBrowserToolTarget();
    expect(await executeTool('browser_read_page', {})).toBe(
      BROWSER_TOOL_UNAVAILABLE,
    );
    expect(await executeTool('browser_search', { query: 'x' })).toBe(
      BROWSER_TOOL_UNAVAILABLE,
    );
  });

  it('a failing target surfaces its error as the tool result', async () => {
    fakeTarget.readPage.mockRejectedValueOnce(new Error('page crashed'));
    expect(await executeTool('browser_read_page', {})).toMatch(
      /Error executing tool browser_read_page/,
    );
  });
});
