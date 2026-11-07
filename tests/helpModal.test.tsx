// @vitest-environment jsdom
/**
 * Help modal render tests (Gary, 2026-11-06).
 *
 * Covers the last link in the blood-drop → Help chain: when App's
 * showHelp is true the modal renders the command reference, and when
 * it is false it renders nothing. The click itself (blood-drop button
 * → onOpenHelp) is covered in tests/synthToggle.test.tsx; the App
 * state in between (openHelp sets showHelp) is two lines verified by
 * reading, and this test pins the modal end of it.
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpModal } from '../src/components/Help/HelpModal';
import { helpCategories } from '../src/data/helpData';

describe('HelpModal', () => {
  test('renders nothing when closed', () => {
    const { container } = render(
      <HelpModal isOpen={false} onClose={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders the command reference when open', () => {
    render(<HelpModal isOpen={true} onClose={() => undefined} />);
    expect(screen.getByText('LuciferAI Command Reference')).not.toBeNull();
    // At least one category from the reference data is on screen.
    expect(screen.getByText(helpCategories[0].title)).not.toBeNull();
  });

  test('the close button calls onClose', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <HelpModal isOpen={true} onClose={onClose} />,
    );
    // The header close button is the one holding the X icon (lucide
    // renders svg.lucide-x). The category buttons hold no icon svg.
    const buttons = Array.from(container.querySelectorAll('button'));
    const closeButton = buttons.find((b) => b.querySelector('svg.lucide-x'));
    expect(closeButton).not.toBeUndefined();
    fireEvent.click(closeButton as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
