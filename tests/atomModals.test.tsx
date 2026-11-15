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
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
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
    // The keydown handler dispatches through the registry now
    // (Atom steal #13) — the builtins must be registered, the
    // way App does it once at startup. Without them the keymap
    // names a command the registry has never heard of and the
    // dispatch returns null.
    registerBuiltinCommands({
      switchView: vi.fn(),
      toggleAI: vi.fn(),
      openHelp: vi.fn(),
    });
  });

  test('renders nothing when no modal is open', () => {
    const { container } = render(
      <AtomModals context={CONTEXT} switchView={vi.fn()} />,
    );
    expect(container.querySelector('.fuzzy-modal-backdrop')).toBeNull();
  });

  test('⌘⇧P opens the command palette', () => {
    const { getByPlaceholderText, getByText } = render(
      <AtomModals context={CONTEXT} switchView={vi.fn()} />,
    );
    act(() => {
      fireEvent.keyDown(window, { key: 'P', metaKey: true, shiftKey: true });
    });
    expect(getByPlaceholderText('Type a command')).toBeTruthy();
    // The palette's keystroke labels come from the keymap
    // (Atom steal #13): the Quick Open row shows the macOS
    // glyph label from the keymap, not a static string.
    expect(getByText('⌘P')).toBeTruthy();
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

describe('AtomModals menu events (Atom steal #13 — menus)', () => {
  // The application menu sends 'menu:open-modal' through the
  // preload bridge; AtomModals subscribes and opens the modal.
  // The bridge is mocked on window.lucidAPI here.
  type MenuCallback = (kind: string) => void;
  let captured: MenuCallback | null = null;
  let originalLucidAPI: unknown;

  beforeEach(() => {
    useModalStore.setState({ openModal: null });
    captured = null;
    originalLucidAPI = (window as unknown as { lucidAPI?: unknown }).lucidAPI;
    (window as unknown as { lucidAPI?: unknown }).lucidAPI = {
      menu: {
        onOpenModal: (cb: MenuCallback) => {
          captured = cb;
          return () => {};
        },
      },
    };
  });

  afterEach(() => {
    (window as unknown as { lucidAPI?: unknown }).lucidAPI = originalLucidAPI;
  });

  test('menu palette event opens the command palette', () => {
    const { getByPlaceholderText } = render(
      <AtomModals context={CONTEXT} switchView={vi.fn()} />,
    );
    expect(captured).not.toBeNull();
    act(() => {
      captured!('palette');
    });
    expect(getByPlaceholderText('Type a command')).toBeTruthy();
  });

  test('menu finder event opens the fuzzy file finder', () => {
    const { getByPlaceholderText } = render(
      <AtomModals context={CONTEXT} switchView={vi.fn()} />,
    );
    act(() => {
      captured!('finder');
    });
    expect(getByPlaceholderText('Open a file… (type :12 to jump to a line)')).toBeTruthy();
  });

  test('menu symbols event opens go-to-symbol only with an active file', () => {
    const { queryByPlaceholderText, unmount } = render(
      <AtomModals context={CONTEXT} switchView={vi.fn()} />,
    );
    act(() => {
      captured!('symbols');
    });
    // CONTEXT has hasActiveFile: false — nothing opens.
    expect(queryByPlaceholderText('Go to symbol in file…')).toBeNull();
    // Both renders share the modal store, so the first must
    // unmount before the second renders the same modal.
    unmount();

    const { getByPlaceholderText } = render(
      <AtomModals
        context={{ ...CONTEXT, view: 'editor', hasActiveFile: true }}
        switchView={vi.fn()}
      />,
    );
    act(() => {
      captured!('symbols');
    });
    expect(getByPlaceholderText('Go to symbol in file…')).toBeTruthy();
  });
});
