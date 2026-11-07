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
import { speakText, stopSpeaking, isSpeechSupported, getAvailableSpeakVoices } from '../src/lib/speak';

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
});
