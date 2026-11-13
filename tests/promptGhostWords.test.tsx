// @vitest-environment jsdom
/**
 * Ghost words on EVERY prompt (Gary, 2026-11-13 ~02:14 PST).
 *
 * The mechanism covers every prompt on the platform — not just
 * Lucid's shell composer (tests/defcon3Phase5.test.tsx) and not
 * just the AI chat input (tests/aiChatModelDropdown.test.tsx).
 * Every prompt input renders its ghost text as a position:absolute
 * overlay inside the input wrap, at the input's own text origin,
 * pointer-events-none — the caret overlaps the start of the ghost
 * text, and when the words appear or disappear NOTHING on screen
 * moves. The ghost is gone after the first prompt sent through
 * that input, even when the input is empty again. The TEXT is
 * frozen everywhere: no prompt text changes in this file's
 * coverage, only the mechanism.
 *
 * Covered here: the xterm fallback shell input, the Forge
 * ask-the-brain input, the Dual Unison action-message input, and
 * the Tail Generator united-action input. Search boxes, settings
 * and form fields are NOT prompts and are deliberately untouched.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { XtermSurface } from '../src/components/Terminal/XtermSurface';
import { DualUnisonPanel } from '../src/components/Forge/DualUnisonPanel';
import { TailGeneratorPanel } from '../src/components/Forge/TailGeneratorPanel';
import { ForgeView } from '../src/components/Forge/ForgeView';
import { useForgeStore } from '../src/stores/forgeStore';
import type { Homunculus } from '../src/lib/homunculi';

const PINK: Homunculus = {
  id: 'lucifer',
  name: 'Lucifer',
  color: 'pink',
  biography: null,
  modelPath: '~/.lucid/models/lucifer.gguf',
  status: 'untrained',
  incumbentScore: null,
  lineage: [],
  createdAt: '2026-11-05T06:00:00.000Z',
};
const PURPLE: Homunculus = {
  ...PINK,
  id: 'violet',
  name: 'Violet',
  color: 'purple',
};

// The Forge view loads its roster + status through the llmbuilder
// IPC on mount (same shape as tests/forgeView.test.tsx).
function installForgeMock(roster: Homunculus[]) {
  const win = window as unknown as Record<string, unknown>;
  const prevLucidAPI = win.lucidAPI;
  const mock = {
    status: vi.fn(async () => ({
      ready: true,
      pythonAvailable: true,
      venvReady: true,
      torchInstalled: true,
      lowMemory: false,
      message: null,
    })),
    setup: vi.fn(async () => ({ ok: true, message: 'ok' })),
    startRun: vi.fn(async () => ({
      runId: 'run-1',
      homunculusId: 'lucifer',
      candidate: 'lucifer-1',
      tier: 'tiny',
      status: 'running',
      startedAt: new Date().toISOString(),
    })),
    cancelRun: vi.fn(async () => ({ ok: true })),
    listRuns: vi.fn(async () => []),
    getScoreboard: vi.fn(async () => []),
    getPromotionDecision: vi.fn(async () => null),
    installBrain: vi.fn(async () => ({
      modelPath: '~/.lucid/models/lucifer.gguf',
      previousModelPath: null,
    })),
    rollback: vi.fn(async () => ({
      modelPath: '~/.lucid/models/lucifer.gguf',
      previousModelPath: null,
    })),
    getRoster: vi.fn(async () => [...roster]),
    saveRoster: vi.fn(async () => undefined),
    importDataset: vi.fn(async (name: string) => ({
      datasetId: name,
      recordCount: 1,
      domains: [],
    })),
    askBrain: vi.fn(async () => ({
      answer: 'I am Lucifer.',
      matchedCapabilities: [],
      confidence: null,
      noMatch: false,
    })),
    onProgress: vi.fn(() => () => undefined),
  };
  win.lucidAPI = {
    ...((prevLucidAPI as object) ?? {}),
    llmbuilder: mock,
    settings: { set: vi.fn(async () => undefined) },
  };
  return () => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
  };
}

describe('xterm fallback shell input — ghost words', () => {
  test('ghost is an absolute overlay inside the input wrap, at the text origin', () => {
    render(<XtermSurface onInput={vi.fn()} />);
    const input = screen.getByTestId('xterm-fallback-input');
    const overlay = screen.getByTestId('xterm-fallback-hint-placeholder');
    expect(overlay.textContent).toBe(
      'Type a command… (plain input — terminal surface unavailable)',
    );
    expect(overlay.className).toContain('absolute');
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.className).toContain('left-3');
    expect(overlay.parentElement?.contains(input)).toBe(true);
    expect((input as HTMLTextAreaElement).getAttribute('placeholder')).toBe('');
  });

  test('typing hides the ghost; emptying before the first submit brings it back', () => {
    render(<XtermSurface onInput={vi.fn()} />);
    const input = screen.getByTestId('xterm-fallback-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'ls' } });
    expect(screen.queryByTestId('xterm-fallback-hint-placeholder')).toBeNull();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByTestId('xterm-fallback-hint-placeholder')).toBeTruthy();
  });

  test('Enter on an empty line does not mark the first prompt; a real submit does', () => {
    const onInput = vi.fn();
    render(<XtermSurface onInput={onInput} />);
    const input = screen.getByTestId('xterm-fallback-input') as HTMLTextAreaElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('xterm-fallback-hint-placeholder')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'ls' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
    expect(screen.queryByTestId('xterm-fallback-hint-placeholder')).toBeNull();
  });
});

describe('Dual Unison action-message input — ghost words', () => {
  beforeEach(() => {
    useForgeStore.getState().resetForTests();
    // The message input only renders once dual unison is detected
    // (a pink + a purple Homunculus) and the stop action has been
    // input — set the store straight there.
    useForgeStore.setState((s) => ({
      roster: [PINK, PURPLE],
      unison: { ...s.unison, stopAction: 'input' },
    }));
  });

  afterEach(() => {
    useForgeStore.getState().resetForTests();
  });

  test('ghost is an absolute overlay; gone after the first assigned message', () => {
    render(<DualUnisonPanel />);
    const input = screen.getByLabelText(
      'Action message for this stop',
    ) as HTMLInputElement;
    const overlay = screen.getByTestId('dual-unison-hint-placeholder');
    expect(overlay.textContent).toBe('Action message for this stop…');
    expect(overlay.className).toContain('absolute');
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.parentElement?.contains(input)).toBe(true);
    expect(input.getAttribute('placeholder')).toBe('');

    fireEvent.change(input, { target: { value: 'stop' } });
    expect(screen.queryByTestId('dual-unison-hint-placeholder')).toBeNull();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByTestId('dual-unison-hint-placeholder')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'stop now' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
    expect(screen.queryByTestId('dual-unison-hint-placeholder')).toBeNull();
    expect(useForgeStore.getState().unison.stopMessage).toBe('stop now');
  });
});

describe('Tail Generator united-action input — ghost words', () => {
  beforeEach(() => {
    useForgeStore.getState().resetForTests();
    // The root input only renders when the tail page is fully
    // unlocked: dual unison detected + stop action 'detected'.
    useForgeStore.setState((s) => ({
      roster: [PINK, PURPLE],
      unison: { ...s.unison, stopAction: 'detected' },
    }));
  });

  afterEach(() => {
    useForgeStore.getState().resetForTests();
  });

  test('ghost is an absolute overlay; gone after the first rooted action', () => {
    render(<TailGeneratorPanel />);
    const input = screen.getByLabelText(
      'United action to root',
    ) as HTMLInputElement;
    const overlay = screen.getByTestId('tail-generator-hint-placeholder');
    expect(overlay.textContent).toBe('What did you do while united?');
    expect(overlay.className).toContain('absolute');
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.parentElement?.contains(input)).toBe(true);
    expect(input.getAttribute('placeholder')).toBe('');

    fireEvent.change(input, { target: { value: 'we sang' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
    expect(screen.queryByTestId('tail-generator-hint-placeholder')).toBeNull();
    expect(useForgeStore.getState().unison.tail.length).toBe(1);
  });
});

describe('Forge ask-the-brain input — ghost words', () => {
  let restore: () => void;

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
  });

  test('ghost only shows when the pre-filled question is cleared; gone after the first ask', async () => {
    restore = installForgeMock([PINK, PURPLE]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    act(() => {
      useForgeStore.getState().selectHomunculus('lucifer');
    });
    const input = (await waitFor(() =>
      screen.getByLabelText('Ask the brain'),
    )) as HTMLInputElement;
    // The input ships pre-filled with the question, so the ghost
    // is not showing yet — and the text is frozen, never changed.
    expect(input.value).toBe('Who are you?');
    expect(screen.queryByTestId('forge-ask-hint-placeholder')).toBeNull();

    // Clear it before any ask: the ghost appears, as an absolute
    // overlay inside the input wrap.
    fireEvent.change(input, { target: { value: '' } });
    const overlay = screen.getByTestId('forge-ask-hint-placeholder');
    expect(overlay.textContent).toBe('Who are you?');
    expect(overlay.className).toContain('absolute');
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.parentElement?.contains(input)).toBe(true);
    expect(input.getAttribute('placeholder')).toBe('');

    // Ask a question: the ghost is gone for this panel after it,
    // even when the input is empty again.
    fireEvent.change(input, { target: { value: 'Who are you?' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(screen.getByText('I am Lucifer.')).toBeTruthy(),
    );
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByTestId('forge-ask-hint-placeholder')).toBeNull();
  });
});
