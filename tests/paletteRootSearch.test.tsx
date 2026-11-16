/**
 * Root Search palette component tests.
 *
 * The palette (⌘⇧P — NOT ⌘U; ⌘U is terminal:unsplit at cea360f)
 * becomes Raycast's Root Search: one input searching commands,
 * quicklinks, files, tabs and settings, with a ⌘K Action Panel
 * on the highlighted row and inline argument fields for commands
 * that declare arguments (Raycast: arguments are entered in Root
 * Search, max 3, alias + space focuses the first field).
 *
 * Fails on unmodified cea360f (RootSearchPalette does not exist).
 * Needs the same VM-only shims as tests/atomModals.test.tsx (the
 * 11 Mac-only files) to collect — see REPORT.md.
 */
// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { RootSearchPalette } from '../src/components/CommandPalette/RootSearchPalette';
import {
  PaletteExtensionRegistry,
  QuicklinkRegistry,
  PalettePersonalization,
  type CommandContext,
} from '../src/lib/paletteExtensions';
import { CommandRegistry } from '../src/lib/commandRegistry';
import { usePaletteStore } from '../src/stores/paletteStore';

const CTX: CommandContext = {
  view: 'terminal',
  hasActiveFile: false,
  hasOpenFiles: false,
  luciferAiEnabled: true,
  luciferAiSilenced: false,
};

function setup() {
  const registry = new CommandRegistry();
  const extensions = new PaletteExtensionRegistry();
  const quicklinks = new QuicklinkRegistry();
  const personalization = new PalettePersonalization();
  const switchView = vi.fn();
  const copyText = vi.fn();
  const onClose = vi.fn();
  const actionDeps = {
    copyText,
    switchTab: vi.fn(),
    closeTab: vi.fn(),
    openFile: vi.fn(),
    revealFile: vi.fn(),
    searchProject: vi.fn(),
    toggleFavorite: vi.fn(),
    setAlias: vi.fn(),
    disableCommand: vi.fn(),
    deleteQuicklink: vi.fn(),
    toggleQuicklinkHidden: vi.fn(),
  };
  const fileEntries = [{ id: '/proj/alpha.ts', title: 'alpha.ts', subtitle: 'proj/alpha.ts', filePath: '/proj/alpha.ts' }];
  const tabEntries = [{ id: 'tab-1', title: 'Tab 1', subtitle: '~/proj', tabId: 'tab-1' }];
  return { registry, extensions, quicklinks, personalization, switchView, copyText, onClose, actionDeps, fileEntries, tabEntries };
}

function renderPalette(over: Partial<ReturnType<typeof setup>> = {}) {
  const s = { ...setup(), ...over };
  const utils = render(
    <RootSearchPalette
      context={CTX}
      switchView={s.switchView}
      onClose={s.onClose}
      registry={s.registry}
      extensions={s.extensions}
      quicklinks={s.quicklinks}
      personalization={s.personalization}
      copyText={s.copyText}
      actionDeps={s.actionDeps}
      fileEntries={s.fileEntries}
      tabEntries={s.tabEntries}
    />,
  );
  return { ...utils, ...s };
}

function renderWithExtensionCommand(run: (args: Record<string, string>) => void) {
  const s = setup();
  s.extensions.registerExtension({
    id: 'notes',
    title: 'Notes',
    commands: [{
      id: 'notes:new',
      title: 'New Note',
      mode: 'no-view',
      arguments: [{ name: 'title', placeholder: 'Title', type: 'text', required: true }],
      run: (_ctx, args) => run(args),
    }],
  });
  const utils = render(
    <RootSearchPalette
      context={CTX}
      switchView={s.switchView}
      onClose={s.onClose}
      registry={s.registry}
      extensions={s.extensions}
      quicklinks={s.quicklinks}
      personalization={s.personalization}
      copyText={s.copyText}
      actionDeps={s.actionDeps}
      fileEntries={[]}
      tabEntries={[]}
    />,
  );
  return { ...utils, ...s };
}

describe('RootSearchPalette', () => {
  beforeEach(() => {
    usePaletteStore.setState({ profileId: 'default' });
    localStorage.clear();
  });

  test('searches commands, quicklinks, files, tabs and settings from one input', () => {
    const { getByPlaceholderText } = renderPalette();
    const input = getByPlaceholderText(/Type a command or search/i);
    act(() => {
      fireEvent.change(input, { target: { value: 'alpha' } });
    });
    expect(document.querySelector('[data-testid="fuzzy-modal-item-/proj/alpha.ts"]')).toBeTruthy();
  });

  test('a file row is listed under Files and a tab row under Tabs', () => {
    const { getByText } = renderPalette();
    expect(getByText('Files')).toBeTruthy();
    expect(getByText('Tabs')).toBeTruthy();
    expect(getByText('Tab 1')).toBeTruthy();
  });

  test('a settings row is listed under Settings', () => {
    const { getByPlaceholderText } = renderPalette();
    const input = getByPlaceholderText(/Type a command or search/i);
    act(() => {
      fireEvent.change(input, { target: { value: 'appearance' } });
    });
    expect(document.querySelector('[data-testid="fuzzy-modal-item-settings:appearance"]')).toBeTruthy();
  });

  test('typing a calculation shows the calculator result first', () => {
    const { getByPlaceholderText, getByText } = renderPalette();
    const input = getByPlaceholderText(/Type a command or search/i);
    act(() => {
      fireEvent.change(input, { target: { value: '2+3*4' } });
    });
    expect(getByText('= 14')).toBeTruthy();
  });

  test('Enter on a command with arguments opens the argument prompt instead of running', () => {
    let ran: Record<string, string> | null = null;
    const { getByPlaceholderText, onClose } = renderWithExtensionCommand((args) => { ran = args; });
    const input = getByPlaceholderText(/Type a command or search/i);
    act(() => {
      fireEvent.change(input, { target: { value: 'new note' } });
    });
    expect(document.querySelector('[data-testid="fuzzy-modal-item-notes:new"]')).toBeTruthy();
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    // The argument form is showing, not the results list.
    expect(getByPlaceholderText('Title')).toBeTruthy();
    expect(ran).toBeNull();
    const titleInput = getByPlaceholderText('Title');
    act(() => {
      fireEvent.change(titleInput, { target: { value: 'Hello' } });
    });
    act(() => {
      fireEvent.keyDown(titleInput, { key: 'Enter' });
    });
    expect(ran).toEqual({ title: 'Hello' });
    expect(onClose).toHaveBeenCalled();
  });

  test('a required argument left empty blocks the run and shows the error', () => {
    let ran = false;
    const { getByPlaceholderText, getByText, queryByPlaceholderText } = renderWithExtensionCommand(() => { ran = true; });
    const input = getByPlaceholderText(/Type a command or search/i);
    act(() => { fireEvent.change(input, { target: { value: 'new note' } }); });
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }); });
    const titleInput = getByPlaceholderText('Title');
    act(() => { fireEvent.keyDown(titleInput, { key: 'Enter' }); });
    expect(ran).toBe(false);
    expect(getByText(/required/i)).toBeTruthy();
    expect(queryByPlaceholderText('Title')).toBeTruthy();
  });

  test('⌘K opens the Action Panel for the highlighted row; Esc returns', () => {
    const { getByPlaceholderText, getByText, queryByText, actionDeps } = renderPalette();
    const input = getByPlaceholderText(/Type a command or search/i);
    act(() => {
      fireEvent.change(input, { target: { value: 'tab 1' } });
    });
    expect(document.querySelector('[data-testid="fuzzy-modal-item-tab-1"]')).toBeTruthy();
    act(() => {
      fireEvent.keyDown(input, { key: 'k', metaKey: true });
    });
    expect(getByPlaceholderText('Search for actions…')).toBeTruthy();
    expect(getByText('Switch to Tab')).toBeTruthy();
    const actionsInput = getByPlaceholderText('Search for actions…');
    act(() => {
      fireEvent.keyDown(actionsInput, { key: 'Escape' });
    });
    expect(queryByText('Switch to Tab')).toBeNull();
    expect(getByPlaceholderText(/Type a command or search/i)).toBeTruthy();
    expect(actionDeps.switchTab).not.toHaveBeenCalled();
  });

  test('choosing Copy Path in the Action Panel copies the file path', () => {
    const { getByPlaceholderText, getByText, copyText } = renderPalette();
    const input = getByPlaceholderText(/Type a command or search/i);
    act(() => {
      fireEvent.change(input, { target: { value: 'alpha' } });
    });
    act(() => {
      fireEvent.keyDown(input, { key: 'k', metaKey: true });
    });
    expect(getByText('Copy Path')).toBeTruthy();
    act(() => {
      fireEvent.click(getByText('Copy Path'));
    });
    expect(copyText).toHaveBeenCalledWith('/proj/alpha.ts');
  });

  test('choosing Switch to Tab in the Action Panel switches through the tab API', () => {
    const { getByPlaceholderText, getByText, actionDeps } = renderPalette();
    const input = getByPlaceholderText(/Type a command or search/i);
    act(() => {
      fireEvent.change(input, { target: { value: 'tab 1' } });
    });
    act(() => {
      fireEvent.keyDown(input, { key: 'k', metaKey: true });
    });
    act(() => {
      fireEvent.click(getByText('Switch to Tab'));
    });
    expect(actionDeps.switchTab).toHaveBeenCalledWith('tab-1');
  });
});
