// @vitest-environment jsdom
/**
 * Ghost completions pause/resume toggle (Tabnine S7 —
 * 2026-11-15): one click on the status bar, always visible
 * (Tabnine's home). Paused = no ghost offers anywhere; the
 * state persists per profile via settings.
 *
 * Run with: npx vitest run tests/ghostPauseToggle.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StatusBar from '../src/components/Layout/StatusBar';
import { useSettingsStore } from '../src/stores/settingsStore';

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;

beforeEach(() => {
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    settings: { set: vi.fn(async () => undefined) },
  };
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, ghostCompletionsPaused: false } });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, ghostCompletionsPaused: false } });
  vi.restoreAllMocks();
});

describe('Ghost pause toggle (Tabnine S7)', () => {
  test('the toggle is visible, reads Ghost, and flips the setting both ways', async () => {
    render(<StatusBar showAI={false} onToggleAI={() => {}} />);
    const toggle = screen.getByTestId('ghost-pause-toggle');
    expect(toggle.textContent).toContain('Ghost');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(useSettingsStore.getState().settings.ghostCompletionsPaused).toBe(true),
    );
    expect(screen.getByTestId('ghost-pause-toggle').textContent).toContain('Ghost paused');
    expect(screen.getByTestId('ghost-pause-toggle').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('ghost-pause-toggle'));
    await waitFor(() =>
      expect(useSettingsStore.getState().settings.ghostCompletionsPaused).toBe(false),
    );
    expect(screen.getByTestId('ghost-pause-toggle').textContent).toContain('Ghost');
  });
});
