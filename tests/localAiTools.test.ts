/**
 * Local-path browser tool-calling (Area 5) tests: the tool-call
 * parser and the tool loop in `electron/services/local_ai.ts`,
 * driven with injected fake chat + fake tools (no backend, no
 * page, no Electron window).
 *
 * The local path allows browser tools ONLY: a model reply asking
 * for `run_command`, `read_file` or any other non-browser tool is
 * rejected exactly like plain text, even when well-formed.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => '/tmp/lucid-test-user-data' },
}));

import {
  extractBrowserToolCall,
  chatLocalWithBrowserTools,
  LOCAL_TOOL_MAX_ROUNDS,
  LOCAL_TOOL_RESULT_CAP,
} from '../electron/services/local_ai';

describe('extractBrowserToolCall', () => {
  it('parses a fenced json tool call', () => {
    expect(
      extractBrowserToolCall(
        'Let me look.\n```json\n{"tool": "browser_read_page", "args": {}}\n```',
      ),
    ).toEqual({ tool: 'browser_read_page', args: {} });
  });

  it('parses a bare JSON object that is the whole reply', () => {
    expect(
      extractBrowserToolCall('{"tool": "browser_search", "args": {"query": "lucid"}}'),
    ).toEqual({
      tool: 'browser_search',
      args: { query: 'lucid' },
    });
  });

  it('defaults missing args to {}', () => {
    expect(
      extractBrowserToolCall('```json\n{"tool": "browser_get_state"}\n```'),
    ).toEqual({ tool: 'browser_get_state', args: {} });
  });

  it('returns null for plain text', () => {
    expect(extractBrowserToolCall('The page says hello.')).toBeNull();
    expect(extractBrowserToolCall('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(
      extractBrowserToolCall('```json\n{"tool": "browser_read_page",\n```'),
    ).toBeNull();
  });

  it('returns null for a non-object, missing tool, or non-object args', () => {
    expect(extractBrowserToolCall('```json\n[1, 2]\n```')).toBeNull();
    expect(extractBrowserToolCall('```json\n{"args": {}}\n```')).toBeNull();
    expect(
      extractBrowserToolCall(
        '```json\n{"tool": "browser_read_page", "args": "nope"}\n```',
      ),
    ).toBeNull();
  });

  it('rejects non-browser tools even when well-formed', () => {
    expect(
      extractBrowserToolCall(
        '```json\n{"tool": "run_command", "args": {"command": "rm -rf /"}}\n```',
      ),
    ).toBeNull();
    expect(
      extractBrowserToolCall(
        '```json\n{"tool": "read_file", "args": {"path": "/etc/passwd"}}\n```',
      ),
    ).toBeNull();
    expect(
      extractBrowserToolCall(
        '```json\n{"tool": "write_file", "args": {"path": "x", "content": "y"}}\n```',
      ),
    ).toBeNull();
  });

  it('rejects an unknown browser-ish tool name', () => {
    expect(
      extractBrowserToolCall(
        '```json\n{"tool": "browser_hack", "args": {}}\n```',
      ),
    ).toBeNull();
  });
});

describe('chatLocalWithBrowserTools', () => {
  const toolCall = (tool: string, args: Record<string, unknown> = {}) =>
    `\`\`\`json\n${JSON.stringify({ tool, args })}\n\`\`\``;

  it('returns a plain reply untouched; no tool runs', async () => {
    const chat = vi.fn(async () => 'The answer is 42.');
    const execute = vi.fn(async () => 'never');
    const result = await chatLocalWithBrowserTools(
      [{ role: 'user', content: 'What is the answer?' }],
      undefined,
      { chat, execute },
    );
    expect(result).toBe('The answer is 42.');
    expect(chat).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('runs a tool call and feeds the result back, then answers', async () => {
    const prompts: string[] = [];
    const chat = vi.fn(async (messages: Array<{ content: string }>) => {
      prompts.push(messages[0].content);
      return prompts.length === 1
        ? toolCall('browser_read_page')
        : 'The page says hello.';
    });
    const execute = vi.fn(async () => 'Page: Test (https://example.com/)\n\nHello world.');
    const onToolCall = vi.fn();
    const result = await chatLocalWithBrowserTools(
      [{ role: 'user', content: 'What does the page say?' }],
      undefined,
      { chat, execute, onToolCall },
    );
    expect(result).toBe('The page says hello.');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('browser_read_page', {});
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolCall.mock.calls[0][0]).toBe('browser_read_page');
    // The second prompt carries the tool result.
    expect(prompts[1]).toContain('Tool browser_read_page returned:');
    expect(prompts[1]).toContain('Hello world.');
    // And the original question survives in the transcript.
    expect(prompts[1]).toContain('What does the page say?');
  });

  it('runs several rounds in sequence', async () => {
    const chat = vi.fn(async () => '');
    chat
      .mockResolvedValueOnce(toolCall('browser_navigate', { url: 'https://example.com/' }))
      .mockResolvedValueOnce(toolCall('browser_click', { selector: '#go' }))
      .mockResolvedValueOnce('Done — the page is open.');
    const executed: string[] = [];
    const execute = vi.fn(async (name: string) => {
      executed.push(name);
      return `${name} ok.`;
    });
    const result = await chatLocalWithBrowserTools(
      [{ role: 'user', content: 'Open the page and click go.' }],
      undefined,
      { chat, execute },
    );
    expect(result).toBe('Done — the page is open.');
    expect(executed).toEqual(['browser_navigate', 'browser_click']);
  });

  it('stops after the max rounds instead of looping forever', async () => {
    const chat = vi.fn(async () => toolCall('browser_read_page'));
    const execute = vi.fn(async () => 'page text');
    const result = await chatLocalWithBrowserTools(
      [{ role: 'user', content: 'Read the page.' }],
      undefined,
      { chat, execute },
    );
    expect(execute).toHaveBeenCalledTimes(LOCAL_TOOL_MAX_ROUNDS);
    expect(result).toMatch(/stopped after 5 browser actions/);
    expect(result).toContain('page text');
  });

  it('a failing tool returns its error as the result; the model can react', async () => {
    const prompts: string[] = [];
    const chat = vi.fn(async (messages: Array<{ content: string }>) => {
      prompts.push(messages[0].content);
      return prompts.length === 1
        ? toolCall('browser_click', { selector: '#missing' })
        : 'The button is not there, so I stopped.';
    });
    const execute = vi.fn(async () => {
      throw new Error('click failed');
    });
    const result = await chatLocalWithBrowserTools(
      [{ role: 'user', content: 'Click the button.' }],
      undefined,
      { chat, execute },
    );
    expect(result).toBe('The button is not there, so I stopped.');
    expect(prompts[1]).toContain('Error executing tool browser_click');
  });

  it('caps long tool results before feeding them back', async () => {
    const prompts: string[] = [];
    const chat = vi.fn(async (messages: Array<{ content: string }>) => {
      prompts.push(messages[0].content);
      return prompts.length === 1 ? toolCall('browser_read_page') : 'Summarised.';
    });
    const execute = vi.fn(async () => 'x'.repeat(LOCAL_TOOL_RESULT_CAP + 5000));
    await chatLocalWithBrowserTools(
      [{ role: 'user', content: 'Read the page.' }],
      undefined,
      { chat, execute },
    );
    const feedback = prompts[1];
    const afterMarker = feedback.split('Tool browser_read_page returned:\n')[1];
    expect(afterMarker.length).toBeLessThanOrEqual(
      LOCAL_TOOL_RESULT_CAP + 200,
    );
  });
});
