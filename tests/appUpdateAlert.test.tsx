// @vitest-environment jsdom
/**
 * App update alert dialog tests (Gary, 2026-11-16).
 *
 * When a new Lucid version is out, a message shows at the
 * beginning (startup) — in addition to the snapshot-off
 * message. The alert shows what is new (version + publish
 * date + release notes) and what is installed, with a "Do not
 * show again" checkbox (saved profiles only — a guest never
 * sees it), View release, and Not now.
 *
 * Covers: the dialog names the new version and what is
 * installed; View release calls onViewRelease; Not now calls
 * onDismiss with the checkbox state (false unchecked, true
 * checked); the checkbox is unchecked by default; a guest
 * (showDontAsk false) gets NO checkbox.
 *
 * Run with: npx vitest run tests/appUpdateAlert.test.tsx
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppUpdateAlertDialog } from '../src/components/Settings/AppUpdateAlertDialog';
import type { AppRelease } from '../src/lib/appUpdate';

const RELEASE: AppRelease = {
  version: '1.2.0',
  tagName: 'v1.2.0',
  name: 'v1.2.0',
  htmlUrl: 'https://github.com/GareBear99/lucid-terminal/releases/tag/v1.2.0',
  publishedAt: '2026-11-16T10:00:00Z',
  notes: 'The Updates section lands.',
  downloadUrl:
    'https://github.com/GareBear99/lucid-terminal/releases/download/v1.2.0/Lucid.Terminal-1.2.0.dmg',
};

function renderDialog(
  props?: Partial<React.ComponentProps<typeof AppUpdateAlertDialog>>,
) {
  const onViewRelease = vi.fn();
  const onDismiss = vi.fn();
  render(
    <AppUpdateAlertDialog
      release={RELEASE}
      installedVersion="1.1.0"
      showDontAsk
      onViewRelease={onViewRelease}
      onDismiss={onDismiss}
      {...props}
    />,
  );
  return { onViewRelease, onDismiss };
}

describe('AppUpdateAlertDialog', () => {
  test('names the new version, the publish date, the notes, and what is installed', () => {
    renderDialog();
    expect(screen.getByTestId('app-update-alert')).toBeTruthy();
    expect(screen.getByText(/A new version of Lucid is available/)).toBeTruthy();
    expect(screen.getByText(/Lucid v1\.2\.0 is out/)).toBeTruthy();
    expect(screen.getByText(/The Updates section lands/)).toBeTruthy();
    expect(screen.getByText(/You are on 1\.1\.0/)).toBeTruthy();
  });

  test('View release calls onViewRelease', () => {
    const { onViewRelease } = renderDialog();
    fireEvent.click(screen.getByTestId('app-update-view-release'));
    expect(onViewRelease).toHaveBeenCalledTimes(1);
  });

  test('Not now calls onDismiss with false when the checkbox is unchecked', () => {
    const { onDismiss } = renderDialog();
    fireEvent.click(screen.getByTestId('app-update-not-now'));
    expect(onDismiss).toHaveBeenCalledWith(false);
  });

  test('Not now calls onDismiss with true when "Do not show again" is checked', () => {
    const { onDismiss } = renderDialog();
    fireEvent.click(screen.getByTestId('app-update-dont-ask'));
    fireEvent.click(screen.getByTestId('app-update-not-now'));
    expect(onDismiss).toHaveBeenCalledWith(true);
  });

  test('the checkbox is unchecked by default', () => {
    renderDialog();
    const box = screen.getByTestId('app-update-dont-ask') as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  test('a guest gets NO "Do not show again" checkbox — Guest always sees the message', () => {
    renderDialog({ showDontAsk: false });
    expect(screen.queryByTestId('app-update-dont-ask')).toBeNull();
    expect(screen.getByTestId('app-update-alert')).toBeTruthy();
  });

  test('says Lucid does not update itself and points at the release page', () => {
    renderDialog();
    expect(screen.getByText(/Lucid does not update itself yet/)).toBeTruthy();
  });
});
