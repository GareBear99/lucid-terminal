// @vitest-environment jsdom
/**
 * Feed density toggle (sweep item 20).
 *
 * A density setting (Settings > Customization > Terminal
 * customizations, "Feed density") drives the feed live:
 * comfortable is the current spacing (block px-3 py-2,
 * output p-1 leading 1.5); compact tightens it (block px-2
 * py-1, output p-0.5 leading 1.35). Default comfortable.
 *
 * Runtime version in block headers is NOT built here — the
 * audit says to add it only if Gary wants it (do NOT add
 * it on spec).
 *
 * Run with: npx vitest run tests/feedDensity.test.tsx
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockList } from '../src/components/Terminal/BlockList';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import type { TerminalBlock } from '../src/types';

function block(id: string): TerminalBlock {
  return {
    id,
    command: `cmd-${id}`,
    output: `out-${id}`,
    timestamp: 1000,
    isComplete: true,
  };
}

describe('feed density — sweep item 20', () => {
  beforeEach(() => {
    useHistoryStore.setState({ blocksByTab: {} });
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, feedDensity: 'comfortable' },
    });
  });

  function renderFeed() {
    render(
      <BlockList
        tabId="tab-1"
        blocks={[block('b1')]}
        onReinput={() => undefined}
      />,
    );
  }

  test('comfortable (default) keeps the current spacing', () => {
    renderFeed();
    const article = screen.getByTestId('terminal-block');
    expect(article.className).toContain('px-3');
    expect(article.className).toContain('py-2');
    const output = screen.getByTestId('block-output');
    expect(output.className).toContain('p-1');
    expect(output.className).toContain('leading-[1.5]');
  });

  test('compact tightens the block padding and the output leading', () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, feedDensity: 'compact' },
    });
    renderFeed();
    const article = screen.getByTestId('terminal-block');
    expect(article.className).toContain('px-2');
    expect(article.className).toContain('py-1');
    expect(article.className).not.toContain('px-3');
    const output = screen.getByTestId('block-output');
    expect(output.className).toContain('p-0.5');
    expect(output.className).toContain('leading-[1.35]');
  });

  test('the feedDensity key defaults to comfortable', () => {
    expect(useSettingsStore.getState().settings.feedDensity).toBe(
      'comfortable',
    );
  });

  test('the Settings toggle flips the density in the store', async () => {
    // updateSetting persists through window.lucidAPI first, then
    // writes the store — the persist is a no-op here, and the
    // store write lands after the awaited persist.
    const win = window as unknown as Record<string, unknown>;
    const prevLucidAPI = win.lucidAPI;
    win.lucidAPI = { settings: { set: vi.fn(async () => undefined) } };
    try {
      render(
        <SettingsPanel onClose={() => undefined} initialTab="customization" />,
      );
      const select = screen.getByTestId('feed-density') as HTMLSelectElement;
      expect(select.value).toBe('comfortable');
      fireEvent.change(select, { target: { value: 'compact' } });
      await waitFor(() => {
        expect(useSettingsStore.getState().settings.feedDensity).toBe(
          'compact',
        );
      });
    } finally {
      win.lucidAPI = prevLucidAPI;
    }
  });
});
