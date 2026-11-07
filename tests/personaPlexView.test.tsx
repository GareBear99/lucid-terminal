// @vitest-environment jsdom
/**
 * Persona Plex setup-page tests — `src/components/PersonaPlex/PersonaPlexView.tsx`.
 *
 * The setup page lists the persona roster (the existing souls as
 * the starter roster, read from the Python soul config, plus custom
 * personas), lets the user pick a voice per persona, pair a persona
 * to a Homunculus (the persona's voice is that Homunculus's voice
 * in Forge), set when it speaks (Speak on/off, auto-speak, volume,
 * speed), and set a per-persona tool allowlist. The Speak toggle
 * turns right-click Speak on/off in AI chat. Everything is local,
 * no servers.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PersonaPlexView } from '../src/components/PersonaPlex/PersonaPlexView';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useForgeStore } from '../src/stores/forgeStore';
import { emptyHomunculus } from '../src/lib/homunculi';

const SOULS_JSON = JSON.stringify({
  user1: {
    souls: [
      { id: 'soul-lucifer', entity_key: 'lucifer', rarity: 'legendary', level: 7, entity: { name: 'Lucifer', emoji: '😈' } },
      { id: 'soul-eve', entity_key: 'eve', rarity: 'rare', level: 3, entity: { name: 'Eve', emoji: '🌸' } },
    ],
  },
});

describe('PersonaPlexView', () => {
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
        personaPlexSpeakEnabled: false,
        installedAddons: ['persona-plex'],
      },
    });
    // One Homunculus in the Forge roster, for the pairing dropdown.
    useForgeStore.setState({
      roster: [emptyHomunculus('lucifer', 'Lucifer', 'purple')],
      selectedId: 'lucifer',
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  async function settleRoster() {
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Eve')).toBeTruthy());
  }

  test('lists the souls as the starter roster', async () => {
    render(<PersonaPlexView />);
    await settleRoster();
    expect(screen.getByText('Personas (2)')).toBeTruthy();
    expect(document.querySelector('[data-persona-row="soul-lucifer"]')).not.toBeNull();
    expect(document.querySelector('[data-persona-row="soul-eve"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Soul · legendary · level 7');
  });

  test('each persona has a voice picker and a Homunculus pairing dropdown', async () => {
    render(<PersonaPlexView />);
    await settleRoster();
    const voice = document.querySelector('[data-persona-voice="soul-lucifer"]') as HTMLSelectElement;
    expect(voice).not.toBeNull();
    expect(voice.value).toBe('Lily');
    const homunculus = document.querySelector('[data-persona-homunculus="soul-lucifer"]') as HTMLSelectElement;
    expect(homunculus).not.toBeNull();
    expect(homunculus.value).toBe('');
    expect(within(homunculus).getByText('Lucifer (purple)')).toBeTruthy();
  });

  test('picking a voice stores it in the per-persona config (updated AND stored)', async () => {
    render(<PersonaPlexView />);
    await settleRoster();
    const voice = document.querySelector('[data-persona-voice="soul-lucifer"]') as HTMLSelectElement;
    // Wait for the system voices to load into the picker.
    await waitFor(() =>
      expect(voice.querySelector('option[value="Aria"]')).not.toBeNull(),
    );
    fireEvent.change(voice, { target: { value: 'Aria' } });
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(
        'personaPlexConfig',
        expect.objectContaining({
          'soul-lucifer': expect.objectContaining({ voice: 'Aria' }),
        }),
      );
    });
  });

  test('pairing a Homunculus stores the pairing in the per-persona config', async () => {
    render(<PersonaPlexView />);
    await settleRoster();
    const homunculus = document.querySelector('[data-persona-homunculus="soul-lucifer"]') as HTMLSelectElement;
    fireEvent.change(homunculus, { target: { value: 'lucifer' } });
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(
        'personaPlexConfig',
        expect.objectContaining({
          'soul-lucifer': expect.objectContaining({ homunculusId: 'lucifer' }),
        }),
      );
    });
  });

  test('each persona has Speak, auto-speak, volume and speed options', async () => {
    render(<PersonaPlexView />);
    await settleRoster();
    expect(screen.getByLabelText('Speak on for Lucifer')).toBeTruthy();
    expect(screen.getByLabelText('Auto-speak for Lucifer')).toBeTruthy();
    expect(screen.getByLabelText('Volume for Lucifer')).toBeTruthy();
    expect(screen.getByLabelText('Speed for Lucifer')).toBeTruthy();
  });

  test('the Speak toggle turns right-click Speak on/off (persisted)', async () => {
    render(<PersonaPlexView />);
    await settleRoster();
    const toggle = screen.getByLabelText('Speak on right-click');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('personaPlexSpeakEnabled', true);
    });
  });

  test('adding a custom persona appends it to the roster', async () => {
    render(<PersonaPlexView />);
    await settleRoster();
    fireEvent.change(screen.getByPlaceholderText('Persona name'), { target: { value: 'Nova' } });
    fireEvent.change(screen.getByPlaceholderText('Description (optional)'), { target: { value: 'A test persona' } });
    fireEvent.click(document.querySelector('[data-persona-add]')!);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(
        'personaPlexCustomPersonas',
        expect.arrayContaining([expect.objectContaining({ name: 'Nova', source: 'custom' })]),
      );
    });
  });

  test('the tool allowlist expands and shows the tool checkboxes', async () => {
    render(<PersonaPlexView />);
    await settleRoster();
    fireEvent.click(document.querySelector('[data-persona-tools-toggle="soul-lucifer"]')!);
    expect(document.querySelector('[data-persona-tool="soul-lucifer:file.read"]')).not.toBeNull();
    expect(document.querySelector('[data-persona-tool="soul-lucifer:system.kill"]')).not.toBeNull();
  });
});
