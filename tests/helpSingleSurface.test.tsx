// @vitest-environment jsdom
/**
 * Help: one surface (sweep item 11).
 *
 * The audit found two help surfaces with the same content
 * (HelpPanel vs HelpModal). The real state was worse — and
 * better: a shared HelpContent component ALREADY existed
 * (HelpModal.tsx, shared by the App-level modal AND the
 * blood-drop tab), and HelpPanel.tsx was a THIRD copy of the
 * same browser with its own divergent search/filter logic.
 * The fix: HelpPanel.tsx is deleted; Terminal's standalone
 * fallback renders the same shared HelpModal. One browser,
 * three entry points (Cmd+//F1 modal, blood-drop tab,
 * Terminal fallback) — the content lives once, in
 * HelpContent.
 *
 * Run with: npx vitest run tests/helpSingleSurface.test.tsx
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpModal, HelpContent } from '../src/components/Help/HelpModal';
import { LuciferAITabPanel } from '../src/components/Help/LuciferAITabPanel';

describe('help: one surface — sweep item 11', () => {
  test('the shared HelpContent is exported from the modal module', () => {
    expect(typeof HelpContent).toBe('function');
  });

  test('the modal and the blood-drop tab render the same browser', () => {
    const { unmount } = render(<HelpModal isOpen onClose={() => undefined} />);
    expect(screen.getByPlaceholderText('Search commands, examples, or tags...')).not.toBeNull();
    expect(screen.getByText('LuciferAI Command Reference')).not.toBeNull();
    unmount();

    render(<LuciferAITabPanel />);
    expect(screen.getByPlaceholderText('Search commands, examples, or tags...')).not.toBeNull();
    // The tab is the same browser without the modal chrome.
    expect(screen.queryByText('Press')).toBeNull();
  });

  test('the modal keeps its Sovereign Points section (modal-only, Gary 2026-11-08)', () => {
    render(<HelpModal isOpen onClose={() => undefined} />);
    expect(screen.getAllByText(/Sovereign Points/i).length).toBeGreaterThan(0);
  });
});
