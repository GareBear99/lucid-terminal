import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Plus,
  X,
  Globe,
  Loader,
  Smartphone,
} from 'lucide-react';
import { useBrowserStore, PHONE_CONTROL_URL } from '../../stores/browserStore';
import { getPhoneEntries, type PhoneEntry } from '../../phone/streaming';
import { usePhoneStore } from '../../stores/phoneStore';
import PhoneView from '../Phone/PhoneView';
import { resolveInputToUrl } from '../../stores/browserUrl';
import { Tooltip } from '../Tooltip/Tooltip';
import type { BrowserBounds } from '../../types';

/**
 * The Browser tab of the AI panel: tab strip, nav bar, quick tabs,
 * and the container the main process positions a BrowserView over.
 *
 * The BrowserView itself lives in the main process (one per browser
 * tab). This component only reports where it goes: whenever the
 * Browser tab is visible, it activates the active tab's view at the
 * container's window-relative rect, and keeps the bounds in step with
 * the container (panel drag-resize, window resize) via ResizeObserver.
 * When the Browser tab hides — AI tab, panel closed, unmount — the
 * cleanup detaches the view so it never paints over the terminal.
 * The view is not destroyed on hide, so the page keeps running.
 */

export interface PhoneQuickTabsProps {
  entries: PhoneEntry[];
  onOpenExternal: () => void;
  onOpenInternal: () => void;
}

/**
 * The two separate Phone entries. The external entry always works
 * and is never gated; the internal entry only exists when the
 * Android add-on is installed, and is greyed out with its hover
 * reason when the GPU gate is closed. Kept as its own component
 * so the entry -> button mapping is testable on its own.
 */
export function PhoneQuickTabs({ entries, onOpenExternal, onOpenInternal }: PhoneQuickTabsProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] shrink-0">
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mr-1">
        Quick
      </span>
      {entries.map((q) =>
        q.kind === 'external' ? (
          <Tooltip key={q.id} content={`Open the external phone-control app (${PHONE_CONTROL_URL})`}>
            <button
              onClick={onOpenExternal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-xs"
            >
              <Smartphone size={13} className="text-[var(--accent)]" />
              {q.label}
            </button>
          </Tooltip>
        ) : (
          <Tooltip
            key={q.id}
            content={q.disabledReason ?? 'In-app phone stream (Android add-on)'}
          >
            <button
              onClick={() => {
                if (!q.disabled) onOpenInternal();
              }}
              disabled={q.disabled}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Smartphone size={13} className="text-[var(--accent)]" />
              {q.label}
            </button>
          </Tooltip>
        ),
      )}
    </div>
  );
}

function BrowserPanel() {
  const panelTab = useBrowserStore((s) => s.panelTab);
  const tabs = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const createTab = useBrowserStore((s) => s.createTab);
  const closeTab = useBrowserStore((s) => s.closeTab);
  const activateTab = useBrowserStore((s) => s.activateTab);
  const navigate = useBrowserStore((s) => s.navigate);
  const goBack = useBrowserStore((s) => s.goBack);
  const goForward = useBrowserStore((s) => s.goForward);
  const reload = useBrowserStore((s) => s.reload);
  const openQuickTab = useBrowserStore((s) => s.openQuickTab);
  const applyTabUpdate = useBrowserStore((s) => s.applyTabUpdate);

  // Phone entries: the external app always, the in-app (internal)
  // stream only when the Android add-on is installed — and greyed
  // out with its hover reason when the GPU gate is closed.
  const androidAddonInstalled = usePhoneStore((s) => s.androidAddonInstalled);
  const gpuGate = usePhoneStore((s) => s.gpuGate);
  const activeInternalSerial = usePhoneStore((s) => s.activeInternalSerial);
  const setActiveInternalSerial = usePhoneStore((s) => s.setActiveInternalSerial);
  const refreshGpuGate = usePhoneStore((s) => s.refreshGpuGate);
  const phoneEntries = getPhoneEntries({ androidAddonInstalled, gpuGate });
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Ask main for the real GPU check once the panel mounts.
  useEffect(() => {
    void refreshGpuGate();
  }, [refreshGpuGate]);

  // Opening the internal stream hides the BrowserView; closing it
  // re-attaches the active browser tab at the container's rect.
  useEffect(() => {
    if (activeInternalSerial) {
      void window.lucidAPI.browser.hide();
      return;
    }
    if (panelTab !== 'browser' || !activeTabId) return;
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    void window.lucidAPI.browser.activate(activeTabId, {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
  }, [activeInternalSerial, panelTab, activeTabId]);

  // Internal entry: stream the first connected device. The serial
  // comes from adb, not from a guess — no device, no stream.
  const openInternalPhone = async () => {
    const android = window.lucidAPI?.android;
    if (!android) {
      setPhoneError('Phone streaming IPC is not available in this build');
      return;
    }
    setPhoneError(null);
    const result = await android.listDevices().catch(() => ({
      devices: [],
      error: 'could not list devices',
    }));
    if (result.error) {
      setPhoneError(result.error);
      return;
    }
    const device = result.devices.find((d) => d.state === 'device');
    if (!device) {
      setPhoneError('No Android device connected — start the emulator or plug a phone in');
      return;
    }
    setActiveInternalSerial(device.serial);
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState(activeTab?.url ?? '');

  // Keep the address bar in step with the active tab — but never while
  // the user is typing in it (an in-flight navigation would clobber
  // their text).
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setInput(activeTab?.url ?? '');
    }
  }, [activeTab?.url, activeTabId]);

  // Live tab state from the main process (url/title/loading/nav state),
  // and new-window requests (target=_blank, window.open) as new tabs.
  useEffect(() => {
    const cleanupUpdated = window.lucidAPI.browser.onUpdated(
      (tabId, state) => {
        applyTabUpdate(tabId, state);
      },
    );
    const cleanupOpenUrl = window.lucidAPI.browser.onOpenUrl((url) => {
      createTab(url);
      // A page explicitly opening a window should be seen.
      useBrowserStore.getState().setPanelTab('browser');
    });
    return () => {
      cleanupUpdated();
      cleanupOpenUrl();
    };
  }, [applyTabUpdate, createTab]);

  // Attach the active view at the container's rect, and keep it there.
  useEffect(() => {
    if (panelTab !== 'browser' || !activeTabId) return;
    const el = containerRef.current;
    if (!el) return;
    const bounds = (): BrowserBounds => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    void window.lucidAPI.browser.activate(activeTabId, bounds());
    const observer = new ResizeObserver(() => {
      void window.lucidAPI.browser.setBounds(bounds());
    });
    observer.observe(el);
    const onWindowResize = () => {
      void window.lucidAPI.browser.setBounds(bounds());
    };
    window.addEventListener('resize', onWindowResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
      void window.lucidAPI.browser.hide();
    };
  }, [panelTab, activeTabId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = resolveInputToUrl(input);
    if (url) navigate(url);
    inputRef.current?.blur();
  };

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      {/* Browser tab strip */}
      <div className="flex items-center gap-1 px-2 pt-1.5 border-b border-[var(--border)] overflow-x-auto shrink-0">
        {tabs.map((tab) => (
          <Tooltip key={tab.id} content={tab.url || tab.title || 'Browser tab'} placement="bottom">
            <div
              onClick={() => activateTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-t-md text-xs cursor-pointer whitespace-nowrap max-w-[160px] ${
                tab.id === activeTabId
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
              }`}
            >
              {tab.loading ? (
                <Loader size={12} className="animate-spin shrink-0" />
              ) : (
                <Globe size={12} className="shrink-0" />
              )}
              <span className="truncate">{tab.title || tab.url}</span>
              <Tooltip content="Close tab">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] shrink-0"
                >
                  <X size={12} />
                </button>
              </Tooltip>
            </div>
          </Tooltip>
        ))}
        <Tooltip content="New tab">
          <button
            onClick={() => createTab()}
            className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"
          >
            <Plus size={14} />
          </button>
        </Tooltip>
      </div>

      {/* Nav bar */}
      <form
        onSubmit={submit}
        className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] shrink-0"
      >
        <Tooltip content="Back">
          <button
            type="button"
            onClick={goBack}
            disabled={!activeTab?.canGoBack}
            className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
          >
            <ArrowLeft size={16} />
          </button>
        </Tooltip>
        <Tooltip content="Forward">
          <button
            type="button"
            onClick={goForward}
            disabled={!activeTab?.canGoForward}
            className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
          >
            <ArrowRight size={16} />
          </button>
        </Tooltip>
        <Tooltip content="Reload">
          <button
            type="button"
            onClick={reload}
            className="p-1.5 rounded hover:bg-[var(--bg-secondary)]"
          >
            <RotateCw size={16} />
          </button>
        </Tooltip>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search or type a URL"
          className="input flex-1 min-w-0 text-xs"
        />
      </form>

      {/* Quick tabs — the two separate Phone entries. The external
          entry always works and is never gated; the internal entry
          only exists when the Android add-on is installed, and is
          greyed out with its hover reason when the GPU gate is
          closed. */}
      <PhoneQuickTabs
        entries={phoneEntries}
        onOpenExternal={() => {
          setActiveInternalSerial(null);
          openQuickTab(PHONE_CONTROL_URL);
        }}
        onOpenInternal={() => void openInternalPhone()}
      />
      {phoneError ? (
        <div className="px-3 py-1.5 text-xs text-red-300 bg-red-950 shrink-0">
          {phoneError}
        </div>
      ) : null}

      {/* The in-app stream replaces the BrowserView container while
          it is open; otherwise the BrowserView is positioned over
          this container by the main process. White underneath so
          the viewport reads as a browser while a page loads. */}
      {activeInternalSerial ? (
        <div className="flex-1 min-h-0">
          <PhoneView
            serial={activeInternalSerial}
            onClose={() => setActiveInternalSerial(null)}
          />
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 min-h-0 bg-white" />
      )}
    </div>
  );
}

export default BrowserPanel;
