// @vitest-environment jsdom
/**
 * Settings AI-tab Copilots section tests (Gary, 2026-11-13:
 * add as many copilots as desired in the AI settings input).
 *
 * The section lists the copilots (name + model + Remove), the
 * add form (name input + model select + Add), and the GitHub
 * Copilot key row (saved state or password input + Save).
 *
 * These tests render SettingsPanel with @testing-library/react
 * (client render, following the add-on install-flow tests):
 * zustand under SSR returns the initial snapshot, so a
 * setState before an SSR render never reaches the panel — the
 * state-dependent assertions (list, saved key, the real Add /
 * Remove clicks) need the live store.
 *
 * Run with: npx vitest run tests/settingsCopilotsTab.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';
import type { CopilotConfig } from '../src/types';

const LOCAL: CopilotConfig = { id: 'c-local', name: 'Local', model: 'local-planner' };

describe('Copilots section (Settings > AI)', () => {
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: {
        set: mockSet,
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        hasCopilotApiKey: vi.fn(async () => false),
        setCopilotApiKey: vi.fn(async () => undefined),
        deleteCopilotApiKey: vi.fn(async () => undefined),
        getRunOnStartup: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
    };
    mockSet.mockClear();
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, copilots: [] },
      hasCopilotApiKey: false,
    }));
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  function renderAiTab() {
    return render(<SettingsPanel onClose={() => undefined} initialTab="ai" />);
  }

  it('renders the Copilots section with the add form and the key row', () => {
    renderAiTab();
    expect(screen.getByText('Copilots')).toBeTruthy();
    expect(screen.getByPlaceholderText('Copilot name')).toBeTruthy();
    expect(screen.getByPlaceholderText('GitHub Copilot key')).toBeTruthy();
    // The model select offers both models.
    expect(screen.getByLabelText('Copilot model')).toBeTruthy();
    // The key help names the token kind and the classic-PAT trap —
    // the "connection lands in a later build" note is gone (D9).
    expect(screen.getByText(/cloud, metered/i)).toBeTruthy();
    expect(screen.getByText(/ghp_/)).toBeTruthy();
    expect(screen.queryByText(/lands in a later build/i)).toBeNull();
  });

  it('Add puts the copilot in the list with its model label', async () => {
    renderAiTab();
    fireEvent.change(screen.getByPlaceholderText('Copilot name'), {
      target: { value: 'Local' },
    });
    fireEvent.click(screen.getByTestId('copilot-add'));
    await waitFor(() => {
      expect(screen.getByTestId('copilot-settings-row')).toBeTruthy();
    });
    expect(screen.getByTestId('copilot-settings-row').textContent).toContain('Local');
    // The label changed with the agent-loop join (6703a22): the
    // local planner was deleted and the brain is LLMBuilderBrain,
    // labeled "LLMBuilder brain" — the old "Local planner"
    // expectation was stale since that deploy.
    expect(screen.getByTestId('copilot-settings-row').textContent).toContain('LLMBuilder brain');
    // The setting was persisted, not just shown.
    expect(mockSet).toHaveBeenCalledWith(
      'copilots',
      expect.arrayContaining([expect.objectContaining({ name: 'Local', model: 'local-planner' })]),
    );
  });

  it('Remove takes the copilot out of the list', async () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, copilots: [LOCAL] },
    }));
    renderAiTab();
    expect(screen.getByTestId('copilot-settings-row')).toBeTruthy();
    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => {
      expect(screen.queryByTestId('copilot-settings-row')).toBeNull();
    });
    expect(mockSet).toHaveBeenCalledWith('copilots', []);
  });

  it('shows the saved key state when the Copilot key is stored', () => {
    useSettingsStore.setState({ hasCopilotApiKey: true });
    renderAiTab();
    expect(screen.getByText('GitHub Copilot key saved')).toBeTruthy();
  });

  it('Save stores the Copilot key and flips to the saved state', async () => {
    renderAiTab();
    fireEvent.change(screen.getByPlaceholderText('GitHub Copilot key'), {
      target: { value: 'ghp-test-key' },
    });
    fireEvent.click(screen.getByTestId('copilot-key-save'));
    await waitFor(() => {
      expect(screen.getByText('GitHub Copilot key saved')).toBeTruthy();
    });
  });
});
