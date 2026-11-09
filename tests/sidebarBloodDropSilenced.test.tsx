// @vitest-environment jsdom
/**
 * Toolbar blood drop while LuciferAI is silenced (Gary, 2026-11-09 ~10:26 PST).
 *
 * While LuciferAI is SILENCED (enabled, but silenced), the toolbar
 * blood drop button disappears entirely — silently, no toast, no
 * error, just absent (the same silent-filter pattern the toolbar
 * already uses when the plugin is fully off). The Synth button
 * STAYS while silenced: the homunculi still show and are active
 * while silenced (Gary, 2026-11-09 ~02:30 PST).
 *
 * The prompt-bar silencer drop (LuciferStatusIndicator) is NOT
 * covered here — it stays visible and grey while silenced so Gary
 * can click it to un-silence.
 *
 * Same harness as tests/toolbarOrder.test.tsx: render the real
 * Sidebar with the settings store set, then query the toolbar
 * slots by data-toolbar-icon.
 *
 * Run with: npx vitest run tests/sidebarBloodDropSilenced.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import Sidebar from '../src/components/Layout/Sidebar';
import { useSettingsStore } from '../src/stores/settingsStore';
import { BLOOD_COLOR } from '../src/components/Synth/blood';

describe('Sidebar toolbar blood drop while silenced', () => {
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
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
    };
    mockSet.mockClear();
    // All plugin buttons on, LuciferAI enabled, default order.
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        toolbarPlugins: { synth: true, 'ai-chat': true, llmbuilder: true },
        luciferAiEnabled: true,
        toolbarOrder: [],
      },
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  function renderSidebar(bloodDropDisabled?: boolean) {
    return render(
      <Sidebar
        width={250}
        onWidthChange={vi.fn()}
        currentView="terminal"
        onViewChange={vi.fn()}
        showAI={false}
        onToggleAI={vi.fn()}
        onOpenBloodDrop={vi.fn()}
        bloodDropDisabled={bloodDropDisabled}
        onToggleForge={vi.fn()}
      />,
    );
  }

  test('silenced: the toolbar blood drop is GONE, silently — Synth stays (Gary, 2026-11-09 ~10:26 PST)', () => {
    renderSidebar(true);
    expect(document.querySelector('[data-toolbar-icon="help"]')).toBeNull();
    expect(document.querySelector(`path[fill="${BLOOD_COLOR}"]`)).toBeNull();
    // The Synth button (Orbit) MUST stay while silenced — the
    // homunculi still show and are active while silenced
    // (Gary, 2026-11-09 ~02:30 PST).
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    expect(synth).not.toBeNull();
    expect(synth.querySelector('svg.lucide-orbit')).not.toBeNull();
    // AI Chat and Forge are untouched by the silence.
    expect(document.querySelector('[data-toolbar-icon="ai-chat"]')).not.toBeNull();
    expect(document.querySelector('[data-toolbar-icon="llmbuilder"]')).not.toBeNull();
  });

  test('speaking: the toolbar blood drop is present (bloodDropDisabled=false)', () => {
    renderSidebar(false);
    const help = document.querySelector('[data-toolbar-icon="help"]') as HTMLElement;
    expect(help).not.toBeNull();
    expect(help.querySelector(`path[fill="${BLOOD_COLOR}"]`)).not.toBeNull();
    expect(document.querySelector('[data-toolbar-icon="synth"]')).not.toBeNull();
  });

  test('speaking by default: no bloodDropDisabled prop — the blood drop is present', () => {
    renderSidebar(undefined);
    expect(document.querySelector('[data-toolbar-icon="help"]')).not.toBeNull();
    expect(document.querySelector('[data-toolbar-icon="synth"]')).not.toBeNull();
  });
});
