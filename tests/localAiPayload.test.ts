/**
 * Local stdio payload tests — `buildChatPayload` in
 * `electron/services/local_ai.ts`.
 *
 * The rule under test: the per-chat model + chat id ride in the
 * stdio payload when present, and are omitted when absent (Auto),
 * so the backend then uses its own default model and its shared
 * history, exactly as today.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => '/tmp/lucid-test-user-data' },
}));

import { buildChatPayload } from '../electron/services/local_ai';

describe('buildChatPayload', () => {
  it('sends only command, message and cwd with no per-chat options (Auto)', () => {
    const payload = JSON.parse(buildChatPayload('hello', '/tmp/work'));
    expect(payload).toEqual({ command: 'chat', message: 'hello', cwd: '/tmp/work' });
  });

  it('omits cwd when none is given', () => {
    const payload = JSON.parse(buildChatPayload('hello', undefined));
    expect(payload).toEqual({ command: 'chat', message: 'hello' });
    expect('cwd' in payload).toBe(false);
  });

  it('carries the chosen model in the payload', () => {
    const payload = JSON.parse(buildChatPayload('hello', undefined, { model: 'tinyllama' }));
    expect(payload.model).toBe('tinyllama');
  });

  it('carries the chat id in the payload', () => {
    const payload = JSON.parse(buildChatPayload('hello', undefined, { chatId: 'chat-42' }));
    expect(payload.chat_id).toBe('chat-42');
  });

  it('carries both the model and the chat id', () => {
    const payload = JSON.parse(buildChatPayload('hello', '/tmp/work', { model: 'llama3.2', chatId: 'chat-7' }));
    expect(payload).toEqual({
      command: 'chat',
      message: 'hello',
      cwd: '/tmp/work',
      model: 'llama3.2',
      chat_id: 'chat-7',
    });
  });

  it('omits model and chat_id when they are empty', () => {
    const payload = JSON.parse(buildChatPayload('hello', undefined, { model: '', chatId: '' }));
    expect('model' in payload).toBe(false);
    expect('chat_id' in payload).toBe(false);
  });
});
