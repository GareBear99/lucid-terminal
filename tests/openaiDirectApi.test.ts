import { describe, it, expect, vi, beforeEach } from 'vitest';

// The chat path runs in the Electron main process: secureStorage pulls
// in electron (safeStorage) and electron-store. Stand-ins keep the real
// storage logic running in-memory instead of touching the OS keychain.
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (buffer: Buffer) => buffer.toString('utf8'),
  },
}));

vi.mock('electron-store', () => ({
  default: class MemoryStore {
    private data: Record<string, unknown>;
    constructor(opts: { name: string; defaults?: Record<string, unknown> }) {
      this.data = { ...(opts.defaults ?? {}) };
    }
    get(key: string) {
      return this.data[key];
    }
    set(key: string, value: unknown) {
      this.data[key] = value;
    }
    has(key: string) {
      return key in this.data;
    }
    delete(key: string) {
      delete this.data[key];
    }
    clear() {
      this.data = {};
    }
    get store() {
      return { ...this.data };
    }
  },
}));

vi.mock('../electron/services/aiTools', () => ({
  tools: [
    {
      type: 'function',
      function: {
        name: 'run_command',
        description: 'Run a command',
        parameters: { type: 'object', properties: {} },
      },
    },
  ],
  executeTool: vi.fn(async () => 'tool-ok'),
}));

import { chat, cancelStream, hasApiKey } from '../electron/services/openai';
import { apiKeyStorage } from '../electron/services/secureStorage';
import { executeTool } from '../electron/services/aiTools';

const fetchMock = vi.fn();

function sseResponse(sseText: string) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sseText));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream, text: async () => '' };
}

function sseChunk(content: string) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

describe('Tier 5 direct-API chat', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    apiKeyStorage.deleteApiKey();
    (executeTool as ReturnType<typeof vi.fn>).mockClear();
  });

  it('sends a streaming chat-completions request straight to the API', async () => {
    apiKeyStorage.setApiKey('sk-test-key');
    fetchMock.mockResolvedValueOnce(
      sseResponse(`${sseChunk('Hel')}${sseChunk('lo')}data: [DONE]\n\n`),
    );

    const streamed: string[] = [];
    let ended = false;
    const result = await chat(
      [{ role: 'user', content: 'hi' }],
      undefined,
      (chunk) => streamed.push(chunk),
      () => {
        ended = true;
      },
    );

    expect(result).toBe('Hello');
    expect(streamed).toEqual(['Hel', 'lo']);
    expect(ended).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer sk-test-key');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-4');
    expect(body.stream).toBe(true);
    expect(body.tools).toHaveLength(1);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
    // No middleman fields: the body is exactly the API's own shape.
    expect(Object.keys(body).sort()).toEqual([
      'messages',
      'model',
      'stream',
      'temperature',
      'tools',
    ]);
  });

  it('errors clearly with no API key and never calls fetch', async () => {
    const errors: string[] = [];
    await expect(
      chat([{ role: 'user', content: 'hi' }], undefined, undefined, undefined, (e) =>
        errors.push(e),
      ),
    ).rejects.toThrow('API key not configured');
    expect(errors).toEqual([
      'API key not configured. Please add your API key in Settings (Tier 5).',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts the stream and resolves empty', async () => {
    apiKeyStorage.setApiKey('sk-test-key');
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const promise = chat([{ role: 'user', content: 'hi' }]);
    await new Promise((r) => setTimeout(r, 10));
    cancelStream();
    await expect(promise).resolves.toBe('');
  });

  it('reports an API error with its status and message', async () => {
    apiKeyStorage.setApiKey('sk-test-key');
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      body: null,
      text: async () => JSON.stringify({ error: { message: 'Incorrect API key' } }),
    });

    const errors: string[] = [];
    await expect(
      chat([{ role: 'user', content: 'hi' }], undefined, undefined, undefined, (e) =>
        errors.push(e),
      ),
    ).rejects.toThrow('API error (401): Incorrect API key');
    expect(errors).toEqual(['API error (401): Incorrect API key']);
  });

  it('runs streamed tool calls and continues with the result', async () => {
    apiKeyStorage.setApiKey('sk-test-key');
    const toolDelta = `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'run_command',
                  arguments: '{"command":"ls"}',
                },
              },
            ],
          },
        },
      ],
    })}\n\ndata: [DONE]\n\n`;
    fetchMock
      .mockResolvedValueOnce(sseResponse(toolDelta))
      .mockResolvedValueOnce(sseResponse(`${sseChunk('done')}data: [DONE]\n\n`));

    const result = await chat([{ role: 'user', content: 'list files' }]);

    expect(result).toBe('done');
    expect(executeTool).toHaveBeenCalledWith(
      'run_command',
      { command: 'ls' },
      undefined,
      expect.any(Function),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('hasApiKey follows the stored API key', () => {
    expect(hasApiKey()).toBe(false);
    apiKeyStorage.setApiKey('sk-test-key');
    expect(hasApiKey()).toBe(true);
    apiKeyStorage.deleteApiKey();
    expect(hasApiKey()).toBe(false);
  });
});
