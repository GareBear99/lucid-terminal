// @vitest-environment jsdom
/**
 * AtomModals tests (Atom steals #1/#2/#8 — the command palette,
 * the fuzzy file finder, go-to-symbol, go-to-line).
 *
 * The four modals share one host and one modal store. The
 * palette lists the registered commands for the current
 * context and dispatches the chosen one; the global shortcuts
 * open the modals (⌘⇧P palette, ⌘P finder) — metaKey only,
 * so the terminal's Ctrl-R reverse-search and Ctrl-P history
 * are never hijacked.
 *
 * Run with: npx vitest run tests/atomModals.test.tsx
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { AtomModals } from '../src/components/CommandPalette/CommandPalette';
import { useModalStore } from '../src/stores/modalStore';
import { registerBuiltinCommands } from '../src/lib/builtinCommands';
import type { CommandContext } from '../src/lib/commandRegistry';

const CONTEXT: CommandContext = {
  view: 'terminal',
  hasActiveFile: false,
  hasOpenFiles: false,
  luciferAiEnabled: true,
  luciferAiSilenced: false,
};

describe('AtomModals', () => {
  beforeEach(() => {
    useModalStore.setState({ openModal: null });
  });

  test('renders nothing when no modal is open', () => {
    const { container } = render(
      <AtomModals context={CONTEXT} switchView={vi.fn()} />,
    );
    expect(container.querySelector('.fuzzy-modal-backdrop')).toBeNull();
  });

  test('⌘⇧P opens the command palette', () => {
    const { getByPlaceholderText } = render(
      <AtomModals context={CONTEXT} switchView={vi.fn()} />,
    );
    act(() => {
      fireEvent.keyDown(window, { key: 'P', metaKey: true, shiftKey: true });
    });
    expect(getByPlaceholderText('Type a command')).toBeTruthy();
  });

  test('⌘P opens the fuzzy file finder', () => {
    const { getByPlaceholderText } = render(
      <AtomModals context={CONTEXT} switchView={vi.fn()} />,
    );
    act(() => {
      fireEvent.keyDown(window, { key: 'p', metaKey: true });
    });
    // The placeholder has two spaces after the ellipsis in
    // the source; Testing Library normalizes the attribute
    // to one, so the matcher uses one space.
    expect(getByPlaceholderText('Open a file… (type :12 to jump to a line)')).toBeTruthy();
  });

  test('choosing a palette command dispatches it and closes the modal', () => {
    const switchView = vi.fn();
    registerBuiltinCommands({
      switchView,
      toggleAI: vi.fn(),
      openHelp: vi.fn(),
    });
    const { getByText, queryByPlaceholderText } = render(
      <AtomModals context={CONTEXT} switchView={switchView} />,
    );
    act(() => {
      useModalStore.getState().open('palette');
    });
    // The current view (terminal) is not listed; Editor is.
    fireEvent.click(getByText('Switch to Editor'));
    expect(switchView).toHaveBeenCalledWith('editor');
    expect(queryByPlaceholderText('Type a command')).toBeNull();
  });

  test('the finder shows the empty-index text when nothing is indexed', () => {
    const { getByText } = render(
      <AtomModals context={CONTEXT} switchView={vi.fn()} />,
    );
    act(() => {
      useModalStore.getState().open('finder');
    });
    expect(getByText('No files in this project')).toBeTruthy();
  });

  test('go-to-line opens its input-only modal', () => {
    const { getByPlaceholderText } = render(
      <AtomModals context={CONTEXT} switchView={vi.fn()} />,
    );
    act(() => {
      useModalStore.getState().open('goto-line');
    });
    expect(getByPlaceholderText('Go to line (e.g. 42 or 42:10)')).toBeTruthy();
  });
});
