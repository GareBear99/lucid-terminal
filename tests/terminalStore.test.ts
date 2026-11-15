/**
 * Terminal tab store tests — tab numbering reuse + rename.
 *
 * Gary's bug (2026-11-05): adding terminal tabs kept recounting
 * upwards forever — deleting a tab never brought the count back down,
 * so the next new tab got an even higher number. New tabs now reuse
 * the lowest free number: deleting a tab frees its number, existing
 * tabs are never renumbered, and deleting all tabs restarts at 1.
 *
 * The number is keyed off the tab id (`terminal-N`), not the title,
 * so renaming a tab (double-click, see tests/terminalTabsRename.test.tsx)
 * does not change which number a new tab reuses.
 *
 * The store runs in node here (vitest `environment: 'node'`), so
 * `window.lucidAPI` is stubbed — createTab only calls it to resolve
 * the home dir and drive the main-process PTY, which the stubs swallow.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { useTerminalStore } from '../src/stores/terminalStore';

const terminalStub = () => ({
  create: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
});

let stub: ReturnType<typeof terminalStub>;
let homeDir: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stub = terminalStub();
  homeDir = vi.fn().mockResolvedValue('/home/test');
  vi.stubGlobal('window', {
    lucidAPI: {
      fs: { getHomeDir: homeDir },
      terminal: stub,
    },
  });
  // Close every tab through the store API so its number is released,
  // then clear any leftover state.
  const { tabs, closeTab } = useTerminalStore.getState();
  tabs.forEach((t) => closeTab(t.id));
  useTerminalStore.setState({ tabs: [], activeTabId: null, createErrors: {} });
  // The home-dir cache is module-level (zero-latency F5): without this,
  // a test that stubs getHomeDir to reject would still read the dir
  // cached from an earlier test's stub and never see the rejection.
  useTerminalStore.getState().resetForTests();
});

const titles = () => useTerminalStore.getState().tabs.map((t) => t.title);
const ids = () => useTerminalStore.getState().tabs.map((t) => t.id);

describe('useTerminalStore — tab numbering', () => {
  test('creates tabs numbered from 1', async () => {
    const api = useTerminalStore.getState();
    await api.createTab();
    await api.createTab();
    await api.createTab();
    expect(titles()).toEqual(['Terminal 1', 'Terminal 2', 'Terminal 3']);
    expect(ids()).toEqual(['terminal-1', 'terminal-2', 'terminal-3']);
  });

  test('deleting a middle tab frees its number: the next tab reuses it', async () => {
    const api = useTerminalStore.getState();
    await api.createTab();
    await api.createTab();
    await api.createTab();
    useTerminalStore.getState().closeTab('terminal-2');
    const id = await useTerminalStore.getState().createTab();
    expect(id).toBe('terminal-2');
    expect(titles()).toEqual(['Terminal 1', 'Terminal 3', 'Terminal 2']);
  });

  test('deleting the highest-numbered tab reuses it', async () => {
    const api = useTerminalStore.getState();
    await api.createTab();
    await api.createTab();
    await api.createTab();
    useTerminalStore.getState().closeTab('terminal-3');
    await useTerminalStore.getState().createTab();
    expect(titles()).toEqual(['Terminal 1', 'Terminal 2', 'Terminal 3']);
  });

  test('deleting all tabs restarts at 1', async () => {
    const api = useTerminalStore.getState();
    await api.createTab();
    await api.createTab();
    useTerminalStore.getState().closeTab('terminal-1');
    useTerminalStore.getState().closeTab('terminal-2');
    const id = await useTerminalStore.getState().createTab();
    expect(id).toBe('terminal-1');
    expect(titles()).toEqual(['Terminal 1']);
  });

  test('existing tabs are not renumbered on delete', async () => {
    const api = useTerminalStore.getState();
    await api.createTab();
    await api.createTab();
    await api.createTab();
    useTerminalStore.getState().closeTab('terminal-1');
    expect(titles()).toEqual(['Terminal 2', 'Terminal 3']);
    expect(ids()).toEqual(['terminal-2', 'terminal-3']);
  });

  test('two creates fired back-to-back get distinct numbers', async () => {
    const api = useTerminalStore.getState();
    const [idA, idB] = await Promise.all([api.createTab(), api.createTab()]);
    expect(idA).not.toBe(idB);
    expect([...titles()].sort()).toEqual(['Terminal 1', 'Terminal 2']);
  });

  test('a create that fails before the tab exists releases its number', async () => {
    const api = useTerminalStore.getState();
    homeDir.mockRejectedValueOnce(new Error('no home'));
    await expect(api.createTab()).rejects.toThrow('no home');
    const id = await useTerminalStore.getState().createTab();
    expect(id).toBe('terminal-1');
    expect(titles()).toEqual(['Terminal 1']);
  });
});

describe('useTerminalStore — renaming does not touch numbering', () => {
  test('a renamed tab keeps its title and its number stays taken', async () => {
    const api = useTerminalStore.getState();
    await api.createTab();
    await api.createTab();
    useTerminalStore.getState().updateTabTitle('terminal-1', 'My Shell');
    // Closing tab 2 frees 2, not 1 — the renamed tab still holds 1.
    useTerminalStore.getState().closeTab('terminal-2');
    const id = await useTerminalStore.getState().createTab();
    expect(id).toBe('terminal-2');
    expect(titles()).toEqual(['My Shell', 'Terminal 2']);
  });

  test('renaming does not change what the next new tab is numbered', async () => {
    const api = useTerminalStore.getState();
    await api.createTab();
    await api.createTab();
    useTerminalStore.getState().updateTabTitle('terminal-2', 'Build');
    await useTerminalStore.getState().createTab();
    expect(titles()).toEqual(['Terminal 1', 'Build', 'Terminal 3']);
  });
});

describe('useTerminalStore — reopen closed tab (⌘⇧T)', () => {
  test('reopens the most recently closed tab in its old cwd', async () => {
    const api = useTerminalStore.getState();
    await api.createTab('/home/test/work');
    await api.createTab('/home/test/other');
    useTerminalStore.getState().closeTab('terminal-2');
    const reopened = await useTerminalStore.getState().reopenClosedTab();
    expect(reopened).toBe('terminal-2');
    const tab = useTerminalStore.getState().tabs.find((t) => t.id === reopened);
    expect(tab?.cwd).toBe('/home/test/other');
  });

  test('reopen pops most-recent-first', async () => {
    const api = useTerminalStore.getState();
    await api.createTab('/home/test/a');
    await api.createTab('/home/test/b');
    useTerminalStore.getState().closeTab('terminal-1');
    useTerminalStore.getState().closeTab('terminal-2');
    const first = await useTerminalStore.getState().reopenClosedTab();
    expect(useTerminalStore.getState().tabs.find((t) => t.id === first)?.cwd).toBe('/home/test/b');
    const second = await useTerminalStore.getState().reopenClosedTab();
    expect(useTerminalStore.getState().tabs.find((t) => t.id === second)?.cwd).toBe('/home/test/a');
  });

  test('reopen with an empty stack returns null and creates nothing', async () => {
    expect(await useTerminalStore.getState().reopenClosedTab()).toBeNull();
    expect(stub.create).not.toHaveBeenCalled();
  });

  test('closing an unknown id remembers nothing', async () => {
    useTerminalStore.getState().closeTab('terminal-99');
    expect(await useTerminalStore.getState().reopenClosedTab()).toBeNull();
  });

  test('the stack holds at most 10 — the oldest close is forgotten', async () => {
    const api = useTerminalStore.getState();
    for (let i = 0; i < 11; i++) {
      await api.createTab(`/home/test/dir-${i}`);
    }
    // Close all 11 (most recent close is dir-10, oldest is dir-0).
    for (let i = 1; i <= 11; i++) {
      useTerminalStore.getState().closeTab(`terminal-${i}`);
    }
    const cwds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const id = await useTerminalStore.getState().reopenClosedTab();
      cwds.push(useTerminalStore.getState().tabs.find((t) => t.id === id)?.cwd ?? '');
    }
    expect(cwds[0]).toBe('/home/test/dir-10');
    expect(cwds).not.toContain('/home/test/dir-0');
    expect(await useTerminalStore.getState().reopenClosedTab()).toBeNull();
  });
});

describe('useTerminalStore — closeTabs (tab context menu)', () => {
  test('closeTabs closes the listed tabs and lands the active tab on the survivor', async () => {
    const api = useTerminalStore.getState();
    await api.createTab('/home/test/a');
    await api.createTab('/home/test/b');
    await api.createTab('/home/test/c');
    useTerminalStore.getState().setActiveTab('terminal-2');
    useTerminalStore.getState().closeTabs(['terminal-1', 'terminal-3']);
    const tabs = useTerminalStore.getState().tabs;
    expect(tabs.map((t) => t.id)).toEqual(['terminal-2']);
    expect(useTerminalStore.getState().activeTabId).toBe('terminal-2');
  });

  test('closeTabs skips unknown ids and pushes each closed cwd onto the reopen stack', async () => {
    const api = useTerminalStore.getState();
    await api.createTab('/home/test/a');
    await api.createTab('/home/test/b');
    useTerminalStore.getState().closeTabs(['terminal-1', 'terminal-99']);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-2']);
    const reopened = await useTerminalStore.getState().reopenClosedTab();
    expect(useTerminalStore.getState().tabs.find((t) => t.id === reopened)?.cwd).toBe('/home/test/a');
  });

  test('closeTabs with an empty list changes nothing', async () => {
    const api = useTerminalStore.getState();
    await api.createTab('/home/test/a');
    useTerminalStore.getState().closeTabs([]);
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
  });
});
