// @vitest-environment jsdom
/**
 * Speak (TTS) tests — `src/lib/speak.ts`.
 *
 * Speak reads a message aloud with the Web Speech API
 * (window.speechSynthesis) — built into Chromium / Electron,
 * on-device, no server, no network, no port. The voice is the
 * active persona's voice; volume (0-1) and rate (0.5-2) come from
 * that persona's voice settings. Everything degrades to "no
 * speech" instead of throwing when speech is unsupported.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { speakText, stopSpeaking, isSpeechSupported, isSpeaking, waitForSpeakVoices, getAvailableSpeakVoices } from '../src/lib/speak';

describe('speakText', () => {
  let speakMock: ReturnType<typeof vi.fn>;
  let cancelMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    speakMock = vi.fn();
    cancelMock = vi.fn();
    const win = window as unknown as Record<string, unknown>;
    win.speechSynthesis = {
      cancel: cancelMock,
      speak: speakMock,
      getVoices: () => [{ name: 'Lily' }, { name: 'Aria' }],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    win.SpeechSynthesisUtterance = class {
      text: string;
      voice: { name: string } | null = null;
      volume = 1;
      rate = 1;
      constructor(text: string) {
        this.text = text;
      }
    } as unknown as typeof SpeechSynthesisUtterance;
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    delete win.speechSynthesis;
    delete win.SpeechSynthesisUtterance;
  });

  it('speaks the text in the matched voice and returns true', () => {
    expect(speakText('Hello world', 'Lily')).toBe(true);
    expect(cancelMock).toHaveBeenCalled();
    expect(speakMock).toHaveBeenCalledTimes(1);
    const utterance = speakMock.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe('Hello world');
    expect(utterance.voice?.name).toBe('Lily');
  });

  it('applies the persona volume and rate to the utterance', () => {
    speakText('Hello', 'Aria', { volume: 0.5, rate: 1.5 });
    const utterance = speakMock.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.volume).toBe(0.5);
    expect(utterance.rate).toBe(1.5);
    expect(utterance.voice?.name).toBe('Aria');
  });

  it('clamps volume to 0-1 and rate to 0.5-2', () => {
    speakText('Hello', 'Lily', { volume: 5, rate: 9 });
    const utterance = speakMock.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.volume).toBe(1);
    expect(utterance.rate).toBe(2);
    speakText('Hello', 'Lily', { volume: -1, rate: 0.1 });
    const second = speakMock.mock.calls[1][0] as SpeechSynthesisUtterance;
    expect(second.volume).toBe(0);
    expect(second.rate).toBe(0.5);
  });

  it('returns false for empty text and never throws when unsupported', () => {
    expect(speakText('   ', 'Lily')).toBe(false);
    expect(speakMock).not.toHaveBeenCalled();
    const win = window as unknown as Record<string, unknown>;
    delete win.speechSynthesis;
    expect(speakText('Hello', 'Lily')).toBe(false);
    expect(isSpeechSupported()).toBe(false);
    expect(getAvailableSpeakVoices()).toEqual([]);
    expect(() => stopSpeaking()).not.toThrow();
  });

  it('falls back to the system default voice when the name matches nothing', () => {
    expect(speakText('Hello', 'Zara')).toBe(true);
    const utterance = speakMock.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.voice).toBeNull();
  });

  it('calls onEnd when the utterance ends, so the preview button clears its playing state', () => {
    const onEnd = vi.fn();
    speakText('Hello', 'Lily', { onEnd });
    const utterance = speakMock.mock.calls[0][0] as unknown as {
      onend: (() => void) | null;
      onerror: (() => void) | null;
    };
    expect(typeof utterance.onend).toBe('function');
    utterance.onend();
    expect(onEnd).toHaveBeenCalledTimes(1);
    utterance.onerror();
    expect(onEnd).toHaveBeenCalledTimes(2);
  });

  it('isSpeaking reports the synthesiser state', () => {
    const win = window as unknown as Record<string, unknown>;
    (win.speechSynthesis as Record<string, unknown>).speaking = true;
    expect(isSpeaking()).toBe(true);
    (win.speechSynthesis as Record<string, unknown>).speaking = false;
    expect(isSpeaking()).toBe(false);
  });
});

describe('waitForSpeakVoices', () => {
  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    delete win.speechSynthesis;
    delete win.SpeechSynthesisUtterance;
  });

  it('resolves immediately with the voices when they are already loaded', async () => {
    const win = window as unknown as Record<string, unknown>;
    win.speechSynthesis = {
      getVoices: () => [{ name: 'Samantha' }, { name: 'Alex' }],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      cancel: vi.fn(),
      speak: vi.fn(),
    };
    win.SpeechSynthesisUtterance = class {
      constructor(public text: string) {}
    } as unknown as typeof SpeechSynthesisUtterance;
    await expect(waitForSpeakVoices()).resolves.toEqual(['Samantha', 'Alex']);
  });

  it('waits for voiceschanged when the list starts empty, so a persona is not spoken in the default voice by mistake', async () => {
    const win = window as unknown as Record<string, unknown>;
    let voices: { name: string }[] = [];
    let listener: (() => void) | null = null;
    win.speechSynthesis = {
      getVoices: () => voices,
      addEventListener: (_ev: string, fn: () => void) => {
        listener = fn;
      },
      removeEventListener: vi.fn(),
      cancel: vi.fn(),
      speak: vi.fn(),
    };
    win.SpeechSynthesisUtterance = class {
      constructor(public text: string) {}
    } as unknown as typeof SpeechSynthesisUtterance;
    const pending = waitForSpeakVoices(5000);
    voices = [{ name: 'Samantha' }];
    listener?.();
    await expect(pending).resolves.toEqual(['Samantha']);
  });

  it('resolves with whatever is there on timeout — never hangs', async () => {
    const win = window as unknown as Record<string, unknown>;
    win.speechSynthesis = {
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      cancel: vi.fn(),
      speak: vi.fn(),
    };
    win.SpeechSynthesisUtterance = class {
      constructor(public text: string) {}
    } as unknown as typeof SpeechSynthesisUtterance;
    await expect(waitForSpeakVoices(10)).resolves.toEqual([]);
  });
});
