// @vitest-environment jsdom
/**
 * Settings voice message tests (Gary, 2026-11-07 ~05:38 PST):
 * the Appearance and Customization tabs each get one flagship
 * voice recording, like the Devices flagship — a single main
 * explanation of what the tab is, and how it differs from the
 * other one. Each message is synthesized in Lily's voice and saved
 * as an mp3 under public/settings/, and the tab plays it from a
 * speaker button — never auto-play.
 *
 * These tests render with react-dom/server's renderToStaticMarkup
 * (effects never run under SSR) for the button render checks, and
 * with @testing-library/react (jsdom) for the wiring + click
 * checks. The voice button creates its Audio element lazily on
 * click, so it renders safely under SSR; the click tests replace
 * window.Audio with a mock and assert no Audio exists before the
 * click (no auto-play) and exactly one is created + played on it.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { settingsVoiceSrc } from '../src/lib/settingsVoice';
import { AppearanceVoiceButton } from '../src/components/Settings/AppearanceVoiceButton';
import { CustomizationVoiceButton } from '../src/components/Settings/CustomizationVoiceButton';
import SettingsPanel from '../src/components/Settings/SettingsPanel';

// Vitest runs from the repo root, so the voice files are read from
// there (same pattern as tests/packaging.test.ts).
const SETTINGS_VOICES = [
  'appearance-explanation',
  'customization-explanation',
];

describe('settings voice messages', () => {
  it('every settings voice has a path named after its id', () => {
    for (const voiceId of SETTINGS_VOICES) {
      expect(settingsVoiceSrc(voiceId)).toBe(`./settings/${voiceId}.mp3`);
    }
  });

  it('every settings voice mp3 exists on disk and is non-empty', () => {
    for (const voiceId of SETTINGS_VOICES) {
      const filePath = path.join(process.cwd(), 'public', 'settings', `${voiceId}.mp3`);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.statSync(filePath).size).toBeGreaterThan(0);
    }
  });

  it('the Appearance voice button renders its voice play button', () => {
    const html = renderToStaticMarkup(React.createElement(AppearanceVoiceButton));
    expect(html).toContain('data-plugin-voice="appearance-explanation"');
    expect(html).toContain('Play Appearance explanation');
  });

  it('the Customization voice button renders its voice play button', () => {
    const html = renderToStaticMarkup(React.createElement(CustomizationVoiceButton));
    expect(html).toContain('data-plugin-voice="customization-explanation"');
    expect(html).toContain('Play Customization explanation');
  });
});

describe('settings voice wiring (Settings > Appearance / Customization)', () => {
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  let prevLucidAPI: unknown;
  let prevAudio: unknown;

  interface MockAudioInstance {
    src: string;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }
  let audioInstances: MockAudioInstance[];

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: {
        set: mockSet,
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
    };
    mockSet.mockClear();
    audioInstances = [];
    prevAudio = win.Audio;
    class MockAudio {
      src: string;
      play = vi.fn(async () => undefined);
      pause = vi.fn();
      onended: (() => void) | null = null;
      constructor(src: string) {
        this.src = src;
        audioInstances.push(this);
      }
    }
    win.Audio = MockAudio as unknown as typeof Audio;
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    win.Audio = prevAudio;
  });

  it('the Appearance tab shows the voice button next to "Theme"', () => {
    render(<SettingsPanel onClose={() => undefined} initialTab="appearance" />);
    expect(screen.getByText('Theme')).toBeTruthy();
    const button = document.querySelector('[data-plugin-voice="appearance-explanation"]');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Play Appearance explanation');
  });

  it('the Customization tab shows the voice button next to "Processing Animation"', () => {
    render(<SettingsPanel onClose={() => undefined} initialTab="customization" />);
    expect(screen.getByText('Processing Animation')).toBeTruthy();
    const button = document.querySelector('[data-plugin-voice="customization-explanation"]');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Play Customization explanation');
  });

  it('clicking the Appearance button plays its mp3, and nothing plays before the click', () => {
    render(<SettingsPanel onClose={() => undefined} initialTab="appearance" />);
    // No auto-play: no Audio element exists before any click.
    expect(audioInstances.length).toBe(0);
    const button = document.querySelector('[data-plugin-voice="appearance-explanation"]') as HTMLElement;
    expect(button).not.toBeNull();
    fireEvent.click(button);
    expect(audioInstances.length).toBe(1);
    expect(audioInstances[0].src).toContain('appearance-explanation.mp3');
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1);
  });

  it('clicking the Customization button plays its mp3, and nothing plays before the click', () => {
    render(<SettingsPanel onClose={() => undefined} initialTab="customization" />);
    // No auto-play: no Audio element exists before any click.
    expect(audioInstances.length).toBe(0);
    const button = document.querySelector('[data-plugin-voice="customization-explanation"]') as HTMLElement;
    expect(button).not.toBeNull();
    fireEvent.click(button);
    expect(audioInstances.length).toBe(1);
    expect(audioInstances[0].src).toContain('customization-explanation.mp3');
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1);
  });
});
