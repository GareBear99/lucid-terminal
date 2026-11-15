// @vitest-environment jsdom
/**
 * FuzzyModal tests (Atom steal #1/#2 — the shared select-list
 * modal, Atom's atom-select-list shape).
 *
 * The modal is the one host for the command palette, the fuzzy
 * file finder, go-to-symbol and go-to-line: typing filters the
 * list with the fuzzy scorer, arrows move, Enter confirms,
 * Esc cancels, and the matched characters are bolded.
 *
 * Run with: npx vitest run tests/fuzzyModal.test.tsx
 */
import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FuzzyModal } from '../src/components/FuzzyModal/FuzzyModal';
import type { FuzzyModalItem } from '../src/components/FuzzyModal/FuzzyModal';

const ITEMS: FuzzyModalItem[] = [
  { id: 'alpha', label: 'Alpha file', secondary: 'src/alpha.ts' },
  { id: 'beta', label: 'Beta file', secondary: 'src/beta.ts' },
  { id: 'gamma', label: 'Gamma file', secondary: 'src/gamma.ts' },
];

function renderModal(props: Partial<React.ComponentProps<typeof FuzzyModal>> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <FuzzyModal
      open
      items={ITEMS}
      onSelect={onSelect}
      onClose={onClose}
      placeholder="Search…"
      emptyText="No matches"
      {...props}
    />,
  );
  return { ...utils, onSelect, onClose };
}

describe('FuzzyModal', () => {
  test('renders all items with an empty query', () => {
    const { getByText } = renderModal();
    expect(getByText('Alpha file')).toBeTruthy();
    expect(getByText('Beta file')).toBeTruthy();
    expect(getByText('Gamma file')).toBeTruthy();
  });

  test('typing filters the list with the fuzzy scorer', () => {
    const { getByPlaceholderText } = renderModal();
    fireEvent.change(getByPlaceholderText('Search…'), { target: { value: 'beta' } });
    // The matched label is split across spans (one per
    // character), and the modal renders through a portal into
    // document.body — so count rows by their test ids across
    // the whole document.
    const rows = Array.from(
      document.querySelectorAll('[data-testid^="fuzzy-modal-item-"]'),
    ).map((row) => row.textContent);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Beta file');
  });

  test('no match shows the empty text', () => {
    const { getByPlaceholderText, getByText } = renderModal();
    fireEvent.change(getByPlaceholderText('Search…'), { target: { value: 'zzz' } });
    expect(getByText('No matches')).toBeTruthy();
  });

  test('arrow down + Enter selects the highlighted item', () => {
    const { getByPlaceholderText, onSelect } = renderModal();
    const input = getByPlaceholderText('Search…');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('beta');
  });

  test('Enter with no arrow selects the first item', () => {
    const { getByPlaceholderText, onSelect } = renderModal();
    fireEvent.keyDown(getByPlaceholderText('Search…'), { key: 'Enter' });
    expect(onSelect.mock.calls[0][0].id).toBe('alpha');
  });

  test('Escape calls onClose without selecting', () => {
    const { getByPlaceholderText, onSelect, onClose } = renderModal();
    fireEvent.keyDown(getByPlaceholderText('Search…'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('clicking an item selects it', () => {
    const { getByText, onSelect } = renderModal();
    fireEvent.click(getByText('Gamma file'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('gamma');
  });

  test('matched characters are bolded', () => {
    const { getByPlaceholderText } = renderModal();
    fireEvent.change(getByPlaceholderText('Search…'), { target: { value: 'bet' } });
    // The modal renders through a portal into document.body,
    // and matched characters are per-character spans with the
    // font-semibold class (not <strong>).
    const bolded = Array.from(document.querySelectorAll('span.font-semibold')).map(
      (span) => span.textContent,
    );
    expect(bolded).toEqual(['B', 'e', 't']);
  });
});
