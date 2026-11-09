// @vitest-environment jsdom
/**
 * Snapshot update alert dialog tests (Gary, 2026-11-09 ~14:51 PST).
 *
 * When training is done and a new snapshot is published, the
 * alert shows what is new (version + what changed) and what is
 * installed, with a "Do not show again" checkbox, Update
 * snapshot, and Not now. Mirrors the summon variant ask dialog
 * pattern (Gary's "don't ask again" wording, already approved).
 *
 * Covers: the dialog names the new version and what changed;
 * Update snapshot calls onUpdate; Not now calls onDismiss with
 * the checkbox state (false unchecked, true checked); the
 * checkbox is unchecked by default.
 *
 * Run with: npx vitest run tests/snapshotUpdateAlert.test.tsx
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SnapshotUpdateAlertDialog } from '../src/components/Settings/SnapshotUpdateAlert';
import type { SnapshotManifest } from '../src/lib/snapshotUpdate';

const MANIFEST: SnapshotManifest = {
  version: 'v2',
  sha256: 'b'.repeat(64),
  downloadUrl: 'https://example.invalid/snapshot-v2.gguf',
  whatChanged: 'Retrained on the bigger corpus.',
};

function renderDialog(props?: Partial<React.ComponentProps<typeof SnapshotUpdateAlertDialog>>) {
  const onUpdate = vi.fn();
  const onDismiss = vi.fn();
  render(
    <SnapshotUpdateAlertDialog
      manifest={MANIFEST}
      installedVersion="v1"
      onUpdate={onUpdate}
      onDismiss={onDismiss}
      {...props}
    />,
  );
  return { onUpdate, onDismiss };
}

describe('SnapshotUpdateAlertDialog', () => {
  test('names the new version and what changed, and what is installed', () => {
    renderDialog();
    expect(screen.getByTestId('snapshot-update-alert')).toBeTruthy();
    expect(screen.getByText(/A new snapshot is required/)).toBeTruthy();
    expect(screen.getByText(/snapshot v2 is published/)).toBeTruthy();
    expect(screen.getByText(/Retrained on the bigger corpus/)).toBeTruthy();
    expect(screen.getByText(/snapshot v1/)).toBeTruthy();
  });

  test('says no snapshot is installed when there is none', () => {
    renderDialog({ installedVersion: null });
    expect(screen.getByText(/no installed snapshot/)).toBeTruthy();
  });

  test('Update snapshot calls onUpdate', () => {
    const { onUpdate, onDismiss } = renderDialog();
    fireEvent.click(screen.getByTestId('snapshot-update-confirm'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test('Not now without the box calls onDismiss(false)', () => {
    const { onDismiss } = renderDialog();
    fireEvent.click(screen.getByTestId('snapshot-update-not-now'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(false);
  });

  test('Not now with "Do not show again" checked calls onDismiss(true)', () => {
    const { onDismiss } = renderDialog();
    const checkbox = screen.getByTestId('snapshot-update-dont-ask') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    fireEvent.click(screen.getByTestId('snapshot-update-not-now'));
    expect(onDismiss).toHaveBeenCalledWith(true);
  });
});
