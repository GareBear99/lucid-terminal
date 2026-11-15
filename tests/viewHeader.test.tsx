// @vitest-environment jsdom
/**
 * Common view-header pattern (sweep item 17).
 *
 * One pattern — title + one-line description, same sizes —
 * taken from Forge (which had it right) and applied to every
 * toolbar view: Forge, PersonaPlex, Synth, Editor, and Modules.
 * The Synth shell's own HUD stays inside the iframe; the header
 * is Lucid chrome above it. No close button on any view header:
 * views fall back to Terminal (Gary's toolbar rule).
 *
 * Run with: npx vitest run tests/viewHeader.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ViewHeader } from '../src/components/Layout/ViewHeader';
import { ForgeView } from '../src/components/Forge/ForgeView';
import { PersonaPlexView } from '../src/components/PersonaPlex/PersonaPlexView';
import { SynthView } from '../src/components/Synth/SynthView';
import CodeEditor from '../src/components/Editor/CodeEditor';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { MODULES_PLUGIN } from '../src/data/modules';
import { useForgeStore } from '../src/stores/forgeStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useFileStore } from '../src/stores/fileStore';
import type { Homunculus } from '../src/lib/homunculi';

vi.mock('@monaco-editor/react', () => ({
  loader: {
    init: () => new Promise(() => {}),
    config: () => {},
  },
  default: () => <div data-testid="monaco-editor" />,
}));

describe('ViewHeader — the one pattern', () => {
  test('title h1 + one-line description, same sizes; extras below, no close button', () => {
    render(
      <ViewHeader
        title="Forge"
        description="Train your Homunculi."
        icon={<span data-testid="header-icon">★</span>}
      >
        <p>An extra line.</p>
      </ViewHeader>,
    );
    const header = screen.getByTestId('view-header');
    expect(header.tagName).toBe('HEADER');
    const h1 = header.querySelector('h1');
    expect(h1?.textContent).toContain('Forge');
    expect(h1?.className).toContain('text-lg');
    expect(h1?.className).toContain('font-semibold');
    expect(screen.getByText('Train your Homunculi.').className).toContain('text-xs');
    expect(screen.getByTestId('header-icon')).not.toBeNull();
    expect(screen.getByText('An extra line.')).not.toBeNull();
    expect(header.querySelector('button')).toBeNull();
  });
});

function installForgeMock(roster: Homunculus[]) {
  const win = window as unknown as Record<string, unknown>;
  const prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    ...((prevLucidAPI as object) ?? {}),
    llmbuilder: {
      status: vi.fn(async () => ({
        ready: true, pythonAvailable: true, venvReady: true,
        torchInstalled: true, lowMemory: false, message: null,
      })),
      setup: vi.fn(async () => ({ ok: true, message: 'ok' })),
      getRoster: vi.fn(async () => [...roster]),
      saveRoster: vi.fn(async () => undefined),
      listRuns: vi.fn(async () => []),
      getScoreboard: vi.fn(async () => []),
      getPromotionDecision: vi.fn(async () => null),
      onProgress: vi.fn(() => () => undefined),
    },
    settings: { set: vi.fn(async () => undefined) },
  };
  return () => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
  };
}

describe('view headers — sweep item 17', () => {
  let restoreLucidAPI: (() => void) | null = null;

  beforeEach(() => {
    useFileStore.setState({ openFiles: [], activeFilePath: null });
  });

  afterEach(() => {
    restoreLucidAPI?.();
    restoreLucidAPI = null;
    useForgeStore.getState().resetForTests();
    vi.restoreAllMocks();
  });

  test('Forge: the shared header, both description lines kept', async () => {
    restoreLucidAPI = installForgeMock([]);
    render(<ForgeView />);
    const header = await screen.findByTestId('view-header');
    expect(header.querySelector('h1')?.textContent).toBe('Forge');
    expect(screen.getByText(/Train your Homunculi/)).not.toBeNull();
    expect(screen.getByText(/Honest scale/)).not.toBeNull();
  });

  test('PersonaPlex: h1 now (was h2), same copy', async () => {
    const win = window as unknown as Record<string, unknown>;
    const prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: {
        set: vi.fn(async () => undefined),
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
      fs: {
        getHomeDir: vi.fn(async () => '/Users/gary'),
        readFile: vi.fn(async () => '{}'),
      },
    };
    restoreLucidAPI = () => {
      win.lucidAPI = prevLucidAPI;
    };
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
    render(<PersonaPlexView />);
    const header = await screen.findByTestId('view-header');
    expect(header.querySelector('h1')?.textContent).toContain('Persona Plex');
    expect(header.querySelector('h2')).toBeNull();
    expect(screen.getByText(/One plex embodiment/)).not.toBeNull();
  });

  test('Editor: the header sits above the file tabs (and in the empty state)', () => {
    const first = render(<CodeEditor />);
    const header = screen.getByTestId('view-header');
    expect(header.querySelector('h1')?.textContent).toBe('Editor');
    expect(screen.getByText(/pick one in the Explorer/)).not.toBeNull();
    // No files open: the empty state, not the tabs bar — but the
    // header is there in both states (the empty state is its own
    // return, so the header lives there too).
    expect(screen.getByText('No files open. Select a file from the explorer.')).not.toBeNull();
    first.unmount();

    // With a file open: the header sits above the file tabs bar.
    useFileStore.setState({
      openFiles: [
        {
          path: '/tmp/notes.ts',
          name: 'notes.ts',
          content: 'const answer = 42;\n',
          originalContent: 'const answer = 42;\n',
          isDirty: false,
        },
      ],
      activeFilePath: '/tmp/notes.ts',
    });
    render(<CodeEditor />);
    expect(screen.getByTestId('view-header').querySelector('h1')?.textContent).toBe('Editor');
    expect(screen.getByTestId('file-tabs-bar')).not.toBeNull();
  });

  test('Modules: the shared header in Settings, anchored badge kept', () => {
    const html = renderToStaticMarkup(
      React.createElement(SettingsPanel, { onClose: () => undefined, initialTab: 'modules' }),
    );
    expect(html).toContain('data-testid="view-header"');
    expect(html).toContain('Modules');
    expect(html).toContain('Container for Segments');
    expect(html).toContain('Built-in · Anchored');
    expect(MODULES_PLUGIN.description).toContain('Container for Segments');
  });

  test('Synth: the header is Lucid chrome above the shell iframe', async () => {
    render(<SynthView />);
    const header = await screen.findByTestId('view-header');
    expect(header.querySelector('h1')?.textContent).toBe('Synth');
    expect(screen.getByText(/Matrix Synth shell/)).not.toBeNull();
    // The shell's own HUD stays inside the iframe — the iframe
    // is still there, below the header.
    expect(document.querySelector('iframe[title="Lucid synth shell"]')).not.toBeNull();
  });
});
