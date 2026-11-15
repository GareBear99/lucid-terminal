// @vitest-environment jsdom
/**
 * The copilot tab — a tab in the AI chat (Gary, 2026-11-13).
 * The dropdown picks the copilot, the thread shows the run
 * and its review cards, and a copilot with no key configured
 * shows that it is unconfigured, never an error.
 *
 * The loop itself is covered by the runner/store tests; this
 * file covers what the tab renders (empty state, picker, model
 * badge, unconfigured state, guest note, review card) and the
 * Keep path through the card (resolve -> listener -> the
 * thread's copy flips to kept).
 *
 * Run with: npx vitest run tests/copilotView.test.tsx
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CopilotView } from '../src/components/AI/CopilotView';
import { useCopilotStore } from '../src/stores/copilotStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useFileStore } from '../src/stores/fileStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { useAgentPermissionStore } from '../src/stores/agentPermissionStore';
import {
  createReviewRequest,
  getPendingAgentReviews,
  resetAgentReviewForTests,
} from '../src/lib/agentReview';
import { MemoryAgentHost, makeTestWorkspace } from './agentTestHost';
import type { CopilotConfig } from '../src/types';

const LOCAL: CopilotConfig = { id: 'c-local', name: 'Local', model: 'local-planner' };
const COPILOT: CopilotConfig = { id: 'c-copilot', name: 'Copilot', model: 'github-copilot' };

function resetStores(copilots: CopilotConfig[] = [LOCAL]) {
  useCopilotStore.getState().resetCopilotForTests();
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, copilots },
    hasCopilotApiKey: false,
  }));
  useFileStore.setState({ currentDir: '/ws' });
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
  useAgentPermissionStore.getState().resetAgentPermissionsForTests();
  resetAgentReviewForTests();
}

describe('CopilotView — the copilot tab', () => {
  beforeEach(() => {
    resetStores();
  });

  it('shows the picker with the copilot name and the model badge', () => {
    render(<CopilotView />);
    expect(screen.getByTestId('copilot-picker')).toBeTruthy();
    expect((screen.getByTestId('copilot-picker') as HTMLSelectElement).value).toBe('c-local');
    expect(screen.getByTestId('copilot-model').textContent).toBe('Local planner');
    expect(screen.getByTestId('copilot-input')).toBeTruthy();
  });

  it('with no copilots, the empty state points at Settings > AI', () => {
    resetStores([]);
    const onOpenSettings = vi.fn();
    render(<CopilotView onOpenSettings={onOpenSettings} />);
    expect(screen.getByText(/No copilots yet/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('copilot-open-settings'));
    expect(onOpenSettings).toHaveBeenCalledWith('ai');
  });

  it('a Copilot copilot with no key shows as unconfigured and the input is disabled', () => {
    resetStores([COPILOT]);
    render(<CopilotView />);
    expect(screen.getByTestId('copilot-unconfigured').textContent).toMatch(/Not configured/);
    expect(screen.getByTestId('copilot-model').textContent).toBe('GitHub Copilot');
    expect((screen.getByTestId('copilot-input') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByTestId('copilot-send') as HTMLButtonElement).disabled).toBe(true);
  });

  it('in guest, the tab says the copilot keeps nothing', () => {
    useHistoryStore.setState({ guestSessionActive: true });
    render(<CopilotView />);
    expect(screen.getByTestId('copilot-guest-note').textContent).toMatch(/keeps nothing/);
  });

  it('a thread renders the user prompt, the run reply, and a review card; Keep flips it to kept', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const created = await createReviewRequest({
      runId: 'copilot-run-1',
      tabId: 'copilot',
      call: {
        name: 'multi_edit',
        args: {
          filepath: 'src/app.ts',
          edits: [{ old_string: 'const answer = 42;', new_string: 'const answer = 43;' }],
        },
      },
      detail: { summary: 'edit src/app.ts' },
      host,
      workspaceRoot: '/ws',
      cwd: '/ws',
    });
    expect(created.kind).toBe('pending');
    if (created.kind !== 'pending') return;
    const store = useCopilotStore.getState();
    store.appendMessage('c-local', { id: 'm-user', timestamp: 1, kind: 'user', text: 'change the answer to 43' });
    store.appendMessage('c-local', { id: 'm-run', timestamp: 2, kind: 'run', text: 'Done.', runId: 'copilot-run-1' });
    store.appendMessage('c-local', {
      id: 'm-review',
      timestamp: 3,
      kind: 'review',
      review: created.blockData,
      runId: 'copilot-run-1',
    });
    render(<CopilotView />);
    expect(screen.getByTestId('copilot-user-message').textContent).toContain('change the answer to 43');
    expect(screen.getByTestId('copilot-run').textContent).toContain('Done.');
    expect(screen.getByTestId('agent-review')).toBeTruthy();
    expect(getPendingAgentReviews()).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId('agent-review-keep'));
    });
    expect(getPendingAgentReviews()).toHaveLength(0);
    expect(screen.getByTestId('agent-review').getAttribute('data-review-status')).toBe('kept');
    expect(screen.getByText(/Kept — the edit landed/)).toBeTruthy();
  });

  it('a keyed Copilot with listed models shows the model picker — the list is the API\'s, labelled cloud, metered', () => {
    resetStores([COPILOT]);
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        copilotApiModel: 'gpt-4o',
        copilotApiModels: ['gpt-4o', 'gpt-4o-mini'],
        copilotApiModelsFetchedAt: Date.now(),
      },
      hasCopilotApiKey: true,
    }));
    render(<CopilotView />);
    const picker = screen.getByTestId('copilot-model-picker') as HTMLSelectElement;
    expect(picker.value).toBe('gpt-4o');
    expect(Array.from(picker.options).map((o) => o.value)).toEqual(['gpt-4o', 'gpt-4o-mini']);
    expect(screen.getByText('Cloud, metered')).toBeTruthy();
    expect(screen.getByTestId('copilot-models-refresh')).toBeTruthy();
    // The input is enabled — a keyed Copilot with a model can run.
    expect((screen.getByTestId('copilot-input') as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('a keyed Copilot with no model listed yet shows as not-ready, not as the local planner', () => {
    resetStores([COPILOT]);
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, copilotApiModel: null, copilotApiModels: [], copilotApiModelsFetchedAt: null },
      hasCopilotApiKey: true,
    }));
    render(<CopilotView />);
    expect(screen.getByTestId('copilot-unconfigured').textContent).toMatch(/models not listed/i);
    expect((screen.getByTestId('copilot-input') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('Refresh calls the store\'s model refresh', async () => {
    resetStores([COPILOT]);
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        copilotApiModel: 'gpt-4o',
        copilotApiModels: ['gpt-4o'],
        copilotApiModelsFetchedAt: Date.now(),
      },
      hasCopilotApiKey: true,
    }));
    const orig = useSettingsStore.getState().refreshCopilotModels;
    const refresh = vi.fn(async () => ({ ok: true as const, models: ['gpt-4o'] }));
    useSettingsStore.setState({ refreshCopilotModels: refresh });
    try {
      render(<CopilotView />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('copilot-models-refresh'));
      });
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      useSettingsStore.setState({ refreshCopilotModels: orig });
    }
  });
});
