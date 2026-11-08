// @vitest-environment jsdom
/**
 * Forge-to-Persona Plex segment tests — `src/components/Modules/ForgePersonaPlexSegment.tsx`
 * (rendered by `src/components/Modules/SegmentsPanel.tsx`).
 *
 * The segment is the bridge between Forge and Persona Plex. It
 * appears in the Segments panel ONLY when Persona Plex is installed
 * (the same `installedAddons` state as the install flow) — installing
 * Persona Plex carries it with it, removing Persona Plex hides it.
 * Inside the segment, for each Homunculus, the user picks which
 * persona pairs to it and the voice for that pairing — the voice
 * Forge uses for that Homunculus, and the voice that persona's chat
 * bubble messages speak in (Speak and auto-speak). The voice picker
 * and the options (Speak on/off, auto-speak, volume, speed) live in
 * this segment; the Persona Plex setup page reflects the same
 * settings (one source of truth, two views). Everything is local,
 * no servers.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SegmentsPanel } from '../src/components/Modules/SegmentsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useForgeStore } from '../src/stores/forgeStore';
import { emptyHomunculus } from '../src/lib/homunculi';

const SOULS_JSON = JSON.stringify({
  user1: {
    souls: [
      { id: 'soul-lucifer', entity_key: 'lucifer', rarity: 'legendary', level: 7, entity: { name: 'Lucifer', emoji: '😈' } },
    ],
  },
});

describe('Forge-to-Persona Plex segment in Segments', () => {
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    // System voices for the picker (Aria, besides Lily).
    // SpeechSynthesisUtterance must exist too, or isSpeechSupported
    // is false and the picker never sees the system voices.
    win.SpeechSynthesisUtterance = class {
      text: string;
      voice: { name: string } | null = null;
      volume = 1;
      rate = 1;
      constructor(text: string) {
        this.text = text;
      }
    } as unknown as typeof SpeechSynthesisUtterance;
    win.speechSynthesis = {
      getVoices: () => [{ name: 'Lily' }, { name: 'Aria' }],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      cancel: vi.fn(),
      speak: vi.fn(),
    };
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: {
        set: mockSet,
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
      fs: {
        getHomeDir: vi.fn(async () => '/Users/gary'),
        readFile: vi.fn(async () => SOULS_JSON),
      },
    };
    mockSet.mockClear();
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        personaPlexConfig: {},
        personaPlexCustomPersonas: [],
        personaPlexActiveId: null,
        personaPlexSpeakEnabled: true,
        installedAddons: ['persona-plex'],
      },
    });
    useForgeStore.setState({
      roster: [emptyHomunculus('lucifer', 'Lucifer', 'purple')],
      selectedId: 'lucifer',
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  test('the segment appears when Persona Plex is installed', async () => {
    render(<SegmentsPanel />);
    await waitFor(() =>
      expect(document.querySelector('[data-forge-persona-plex-segment]')).not.toBeNull(),
    );
    expect(document.body.textContent).toContain('Forge-to-Persona Plex segment');
    expect(document.body.textContent).toContain('Forge ↔ Persona Plex');
  });

  test('the segment is hidden when Persona Plex is not installed', () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, installedAddons: [] } });
    render(<SegmentsPanel />);
    expect(document.querySelector('[data-forge-persona-plex-segment]')).toBeNull();
    expect(document.body.textContent).not.toContain('Forge ↔ Persona Plex');
  });

  test('the segment lists the Homunculus with a persona picker and a voice picker', async () => {
    render(<SegmentsPanel />);
    await waitFor(() =>
      expect(document.querySelector('[data-segment-homunculus="lucifer"]')).not.toBeNull(),
    );
    const personaPicker = document.querySelector('[data-segment-persona="lucifer"]') as HTMLSelectElement;
    expect(personaPicker).not.toBeNull();
    // The soul persona is an option once the roster loads.
    await waitFor(() =>
      expect(within(personaPicker).getByText('Lucifer')).toBeTruthy(),
    );
    // No persona paired yet: no voice picker, the default is noted.
    expect(document.querySelector('[data-segment-voice=""]')).toBeNull();
    expect(document.body.textContent).toContain('default voice (Lily)');
  });

  test('pairing a persona in the segment stores the pairing, and its voice picker appears', async () => {
    render(<SegmentsPanel />);
    await waitFor(() =>
      expect(document.querySelector('[data-segment-homunculus="lucifer"]')).not.toBeNull(),
    );
    const personaPicker = document.querySelector('[data-segment-persona="lucifer"]') as HTMLSelectElement;
    await waitFor(() => expect(within(personaPicker).getByText('Lucifer')).toBeTruthy());
    fireEvent.change(personaPicker, { target: { value: 'soul-lucifer' } });
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(
        'personaPlexConfig',
        expect.objectContaining({
          'soul-lucifer': expect.objectContaining({ homunculusId: 'lucifer' }),
        }),
      );
    });
    // The voice picker for that pairing appears (keyed by homunculus).
    await waitFor(() =>
      expect(document.querySelector('[data-segment-voice="lucifer"]')).not.toBeNull(),
    );
  });

  test('choosing a voice in the segment sets that persona chat-message voice (persisted)', async () => {
    // Pre-pair the soul persona to Lucifer so the voice picker is shown.
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        personaPlexConfig: {
          'soul-lucifer': {
            voice: 'Lily', allowedTools: [], homunculusId: 'lucifer',
            speakEnabled: true, autoSpeak: false, volume: 1, rate: 1,
          },
        },
      },
    });
    render(<SegmentsPanel />);
    await waitFor(() =>
      expect(document.querySelector('[data-segment-voice="lucifer"]')).not.toBeNull(),
    );
    const voice = document.querySelector('[data-segment-voice="lucifer"]') as HTMLSelectElement;
    expect(voice.value).toBe('Lily');
    // Wait for the system voices to load into the picker.
    await waitFor(() =>
      expect(voice.querySelector('option[value="Aria"]')).not.toBeNull(),
    );
    fireEvent.change(voice, { target: { value: 'Aria' } });
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(
        'personaPlexConfig',
        expect.objectContaining({
          'soul-lucifer': expect.objectContaining({ voice: 'Aria', homunculusId: 'lucifer' }),
        }),
      );
    });
  });

  test('the segment has a Hear button that speaks the paired persona in its effective voice', async () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        personaPlexConfig: {
          'soul-lucifer': {
            voice: 'Lily', allowedTools: [], homunculusId: 'lucifer',
            speakEnabled: true, autoSpeak: false, volume: 1, rate: 1,
          },
        },
      },
    });
    render(<SegmentsPanel />);
    await waitFor(() =>
      expect(document.querySelector('[data-segment-voice="lucifer"]')).not.toBeNull(),
    );
    const win = window as unknown as Record<string, unknown>;
    const synth = win.speechSynthesis as { speak: ReturnType<typeof vi.fn> };
    const hear = document.querySelector('[data-segment-hear="lucifer"]') as HTMLButtonElement;
    expect(hear).not.toBeNull();
    fireEvent.click(hear);
    await waitFor(() => {
      expect(synth.speak).toHaveBeenCalledTimes(1);
    });
    const utterance = synth.speak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe("Hi, I'm Lucifer. This is my voice.");
    expect(utterance.voice?.name).toBe('Lily');
  });

  test('the segment has Speak, auto-speak, volume and speed options per pairing', async () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        personaPlexConfig: {
          'soul-lucifer': {
            voice: 'Lily', allowedTools: [], homunculusId: 'lucifer',
            speakEnabled: true, autoSpeak: false, volume: 1, rate: 1,
          },
        },
      },
    });
    render(<SegmentsPanel />);
    await waitFor(() =>
      expect(document.querySelector('[data-segment-voice="lucifer"]')).not.toBeNull(),
    );
    const segment = document.querySelector('[data-forge-persona-plex-segment]') as HTMLElement;
    expect(within(segment).getByLabelText('Speak on for Lucifer')).toBeTruthy();
    expect(within(segment).getByLabelText('Auto-speak for Lucifer')).toBeTruthy();
    expect(within(segment).getByLabelText('Volume for Lucifer')).toBeTruthy();
    expect(within(segment).getByLabelText('Speed for Lucifer')).toBeTruthy();
  });
});
