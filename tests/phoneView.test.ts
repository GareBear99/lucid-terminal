/**
 * Phone view + panel tests.
 *
 * - BrowserPanel renders the two separate Phone entries; the
 *   internal entry is greyed out with its hover reason when the
 *   GPU gate is closed, and does not exist at all when the Android
 *   add-on is not installed. The external entry is never gated.
 * - StaleBadge shows WAITING before the first frame, LIVE while
 *   fresh, STALE with the age once old.
 * - PhoneView renders its header + waiting badge server-side
 *   (effects do not run under SSR).
 * - The phone BrowserView is created with backgroundThrottling:
 *   false, so its timers keep running when the panel switches
 *   tabs (the cheap mitigation from the research report).
 * - phoneStore derives the entries and refreshes the gate from main.
 *
 * There is no @testing-library / jsdom in this repo, so rendering
 * uses react-dom/server's renderToStaticMarkup (effects never run
 * under SSR).
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The BrowserView test below drives electron/ipc/browser with a
// mocked Electron: the mock records every BrowserView's constructor
// options so the test can assert on backgroundThrottling.
vi.mock('electron', () => {
  const created: unknown[] = [];
  (globalThis as unknown as { __phoneViews: unknown[] }).__phoneViews = created;
  class BrowserView {
    webContents: Record<string, unknown>;
    constructor(opts: unknown) {
      created.push(opts);
      this.webContents = {
        on: () => undefined,
        setWindowOpenHandler: () => undefined,
        loadURL: () => undefined,
        getURL: () => '',
        getTitle: () => '',
        isLoading: () => false,
        canGoBack: () => false,
        canGoForward: () => false,
        destroy: () => undefined,
      };
    }
    setBounds(): void {
      // No-op in the mock.
    }
  }
  return { BrowserView, BrowserWindow: class {}, IpcMain: class {} };
});
import { useBrowserStore } from '../src/stores/browserStore';
import { usePhoneStore } from '../src/stores/phoneStore';
import {
  GPU_GATE_DISABLED_REASON,
  evaluateGpuGate,
  getPhoneEntries,
  type GpuGateStatus,
} from '../src/phone/streaming';
import BrowserPanel, { PhoneQuickTabs } from '../src/components/Browser/BrowserPanel';
import PhoneView, { StaleBadge } from '../src/components/Phone/PhoneView';

const closedGate: GpuGateStatus = evaluateGpuGate({ video_decode: 'software' }, []);
const openGate: GpuGateStatus = evaluateGpuGate(
  { video_decode: 'enabled' },
  [{ deviceName: 'Intel(R) UHD Graphics 630' }],
);

const renderPanel = () =>
  renderToStaticMarkup(React.createElement(BrowserPanel));

beforeEach(() => {
  useBrowserStore.setState({ panelTab: 'ai', tabs: [], activeTabId: null });
  usePhoneStore.setState({
    androidAddonInstalled: false,
    gpuGate: closedGate,
    activeInternalSerial: null,
    metrics: null,
  });
});

describe('BrowserPanel phone entries', () => {
  // Note: renderToStaticMarkup serves zustand's initial state, so
  // the panel itself is only asserted in its default (add-on not
  // installed) state here. The entry -> button mapping is asserted
  // on PhoneQuickTabs directly, with entries built by the same
  // getPhoneEntries the panel uses.
  it('shows the external entry in its default state', () => {
    const html = renderPanel();
    expect(html).toContain('Phone — External');
    expect(html).not.toContain('Android — Installed');
  });

  it('the external button itself is never disabled', () => {
    const html = renderPanel();
    const tag = html.match(/<button[^>]*title="http:\/\/127\.0\.0\.1:8090"[^>]*>/);
    expect(tag).not.toBeNull();
    expect(tag![0]).not.toContain('disabled');
  });
});

describe('PhoneQuickTabs', () => {
  const renderTabs = (installed: boolean, gate: GpuGateStatus) =>
    renderToStaticMarkup(
      React.createElement(PhoneQuickTabs, {
        entries: getPhoneEntries({ androidAddonInstalled: installed, gpuGate: gate }),
        onOpenExternal: () => undefined,
        onOpenInternal: () => undefined,
      }),
    );

  it('shows only the external entry when the add-on is not installed', () => {
    const html = renderTabs(false, openGate);
    expect(html).toContain('Phone — External');
    expect(html).not.toContain('Android — Installed');
  });

  it('greys out the internal entry with the hover reason when the gate is closed', () => {
    const html = renderTabs(true, closedGate);
    expect(html).toContain('Android — Installed');
    expect(html).toContain(GPU_GATE_DISABLED_REASON);
    const tag = html.match(/<button[^>]*title="[^"]*hardware video decoding[^"]*"[^>]*>/);
    expect(tag).not.toBeNull();
    expect(tag![0]).toContain('disabled');
  });

  it('enables the internal entry when the gate is open', () => {
    const html = renderTabs(true, openGate);
    expect(html).toContain('Android — Installed');
    expect(html).not.toContain(GPU_GATE_DISABLED_REASON);
    const tag = html.match(/<button[^>]*title="In-app phone stream[^"]*"[^>]*>/);
    expect(tag).not.toBeNull();
    // No disabled *attribute* (the class list still carries the
    // disabled: Tailwind variants — those are styling, not state).
    expect(tag![0]).not.toMatch(/ disabled(="")?[\s>]/);
  });
});

describe('StaleBadge', () => {
  const renderBadge = (age: number | null) =>
    renderToStaticMarkup(React.createElement(StaleBadge, { frameAgeMs: age }));

  it('waits before the first frame', () => {
    expect(renderBadge(null)).toContain('WAITING FOR FRAME');
  });

  it('shows LIVE while the frame is fresh', () => {
    expect(renderBadge(500)).toContain('LIVE');
  });

  it('shows STALE with the age once the frame is old', () => {
    expect(renderBadge(5000)).toContain('STALE 5.0s');
  });
});

describe('PhoneView', () => {
  it('renders the header and waiting badge before the first frame', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhoneView, {
        serial: 'emulator-5554',
        onClose: () => undefined,
      }),
    );
    expect(html).toContain('emulator-5554');
    expect(html).toContain('Android — Installed');
    expect(html).toContain('WAITING FOR FRAME');
  });
});

describe('phoneStore', () => {
  it('derives the two entries from the add-on state and the gate', () => {
    const store = usePhoneStore.getState();
    expect(store.phoneEntries()).toHaveLength(1);
    store.setAndroidAddonInstalled(true);
    store.setGpuGate(openGate);
    const entries = usePhoneStore.getState().phoneEntries();
    expect(entries).toHaveLength(2);
    expect(entries[1].disabled).toBe(false);
  });

  it('refreshes the gate from main when the IPC is there', async () => {
    vi.stubGlobal('window', {
      lucidAPI: {
        android: { getGpuGate: vi.fn().mockResolvedValue(openGate) },
      },
    });
    await usePhoneStore.getState().refreshGpuGate();
    expect(usePhoneStore.getState().gpuGate.hardwareDecode).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('phone BrowserView backgroundThrottling', () => {
  it('creates the view with backgroundThrottling: false', async () => {
    const { setupBrowserHandlers } = await import('../electron/ipc/browser');
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const mockIpcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers[channel] = handler;
      }),
    } as unknown as import('electron').IpcMain;
    const fakeWindow = {
      isDestroyed: () => false,
      getBrowserView: () => null,
      setBrowserView: () => undefined,
      webContents: { send: () => undefined },
    } as unknown as import('electron').BrowserWindow;
    setupBrowserHandlers(mockIpcMain, () => fakeWindow);
    (handlers['browser:create'] as (tabId: string, url: string) => void)(
      'tab-1',
      'https://example.com',
    );
    const created = (globalThis as unknown as { __phoneViews: unknown[] }).__phoneViews;
    expect(created).toHaveLength(1);
    const opts = created[0] as {
      webPreferences: { backgroundThrottling?: boolean; partition?: string };
    };
    expect(opts.webPreferences.backgroundThrottling).toBe(false);
    expect(opts.webPreferences.partition).toBe('persist:lucid-browser');
  });
});
