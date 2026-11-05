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
  Search,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Copy,
  ExternalLink,
  KeyRound,
  Undo2,
} from 'lucide-react';
import { useBrowserStore, PHONE_CONTROL_URL } from '../../stores/browserStore';
import { useAIStore } from '../../stores/aiStore';
import { buildPageSummaryPrompt } from '../../lib/browserActions';
import {
  useBrowserHistory,
  matchHistoryEntries,
} from '../../stores/browserHistory';
import { useBrowserDownloads } from '../../stores/browserDownloads';
import { DownloadShelf } from './DownloadShelf';
import { useBrowserCredentials } from '../../stores/browserCredentials';
import { SaveLoginPrompt } from './SaveLoginPrompt';
import { SavedLoginsPanel } from './SavedLoginsPanel';
import { getPhoneEntries, type PhoneEntry } from '../../phone/streaming';
import { usePhoneStore } from '../../stores/phoneStore';
import PhoneView from '../Phone/PhoneView';
import { resolveInputToUrl } from '../../stores/browserUrl';
import { Tooltip } from '../Tooltip/Tooltip';
import { BrowserAuthPrompt } from './BrowserAuthPrompt';
import type {
  BrowserAuthRequest,
  BrowserBounds,
  BrowserFindResult,
} from '../../types';

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
  const closedTabs = useBrowserStore((s) => s.closedTabs);
  const restoreClosedTab = useBrowserStore((s) => s.restoreClosedTab);
  const zoomIn = useBrowserStore((s) => s.zoomIn);
  const zoomOut = useBrowserStore((s) => s.zoomOut);
  const resetZoom = useBrowserStore((s) => s.resetZoom);
  const historyEntries = useBrowserHistory((s) => s.entries);
  const applyDownloadUpdate = useBrowserDownloads((s) => s.applyUpdate);
  const loadDownloads = useBrowserDownloads((s) => s.load);

  // Credentials (Area 3): the save offer from main, shown as a bar
  // under the nav bar until Gary answers it.
  const loginOffer = useBrowserCredentials((s) => s.offer);
  const setLoginOffer = useBrowserCredentials((s) => s.setOffer);
  const clearLoginOffer = useBrowserCredentials((s) => s.clearOffer);
  const [loginsOpen, setLoginsOpen] = useState(false);

  // Downloads (Area 2): live progress from main, plus the current
  // list on mount (a download started before the panel opened).
  useEffect(() => {
    loadDownloads();
    const cleanupDownloads = window.lucidAPI.browser.onDownloadUpdated(
      (update) => {
        applyDownloadUpdate(update);
      },
    );
    return () => {
      cleanupDownloads();
    };
  }, [applyDownloadUpdate, loadDownloads]);

  // Save-login offers from main (a sign-in was captured on a page
  // Gary just left). The latest offer replaces any earlier one.
  useEffect(() => {
    const cleanupLoginDetected =
      window.lucidAPI.browser.onLoginDetected((offer) => {
        setLoginOffer(offer);
      });
    return () => {
      cleanupLoginDetected();
    };
  }, [setLoginOffer]);

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
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState(activeTab?.url ?? '');
  // HTTP-auth challenges, queued in arrival order. The prompt shows
  // the first one; answering it (sign in or cancel) shows the next.
  const [authQueue, setAuthQueue] = useState<BrowserAuthRequest[]>([]);

  // Find-in-page bar (Ctrl+F). `findResult` is the last count pushed
  // by main; null means no search is running.
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [findResult, setFindResult] = useState<BrowserFindResult | null>(null);

  // Address-bar history dropdown: open while the input has focus.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const suggestions = matchHistoryEntries(historyEntries, input, 8);

  // "Copied" feedback on the copy-link button, cleared shortly after.
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

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
    const cleanupAuth = window.lucidAPI.browser.onAuthRequired((request) => {
      // Ignore a duplicate challenge for a request already queued.
      setAuthQueue((prev) =>
        prev.some((r) => r.id === request.id) ? prev : [...prev, request],
      );
    });
    const cleanupFind = window.lucidAPI.browser.onFindUpdated(
      (tabId, result) => {
        // Only the active tab's counts belong in the find bar.
        if (tabId === useBrowserStore.getState().activeTabId) {
          setFindResult(result);
        }
      },
    );
    return () => {
      cleanupUpdated();
      cleanupOpenUrl();
      cleanupAuth();
      cleanupFind();
    };
  }, [applyTabUpdate, createTab]);

  // Find-in-page: run the search in the active tab. A fresh query
  // starts at the top (findNext: false); Enter steps through matches.
  const runFind = (
    text: string,
    options?: { forward?: boolean; findNext?: boolean },
  ) => {
    if (!activeTabId || !text) return;
    void window.lucidAPI.browser.findInPage(activeTabId, text, options);
  };

  const closeFind = () => {
    setFindOpen(false);
    setFindText('');
    setFindResult(null);
    if (activeTabId) {
      void window.lucidAPI.browser.stopFindInPage(
        activeTabId,
        'clearSelection',
      );
    }
  };

  // Opening the find bar focuses its input; switching tabs re-runs
  // the open search in the new tab (or clears the stale count).
  useEffect(() => {
    if (findOpen) findInputRef.current?.focus();
  }, [findOpen]);

  useEffect(() => {
    if (findOpen && findText) runFind(findText);
    else setFindResult(null);
    // Deliberately only on tab switch: typing re-runs the search
    // from the input handler, so it is not a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // Panel shortcuts, only while focus is inside the browser panel —
  // the terminal keeps its own Ctrl+F / Ctrl+T behaviour otherwise.
  useEffect(() => {
    if (panelTab !== 'browser') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'f') {
        e.preventDefault();
        setFindOpen(true);
      } else if (key === '=' || key === '+') {
        e.preventDefault();
        zoomIn();
      } else if (key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (key === '0') {
        e.preventDefault();
        resetZoom();
      } else if (key === 't' && e.shiftKey) {
        e.preventDefault();
        restoreClosedTab();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panelTab, zoomIn, zoomOut, resetZoom, restoreClosedTab]);

  // Ask the AI about this page (Area 5): read the active tab's
  // text through the page-action API, queue it as a prompt for the
  // AI chat (capped for the chat context), and switch to the AI
  // tab — the chat sends it as the next user message. A blank tab
  // or a failed read does nothing.
  const askAiAboutPage = async () => {
    if (!activeTabId || !activeTab?.url || activeTab.url === 'about:blank') {
      return;
    }
    const result = await window.lucidAPI.browser
      .readText(activeTabId)
      .catch(() => null);
    if (!result || !result.ok || !result.text) return;
    useAIStore.getState().queueAiPrompt(
      buildPageSummaryPrompt(result.text.url, result.text.text),
    );
    useBrowserStore.getState().setPanelTab('ai');
  };

  // Copy the active page's URL (clipboard API, with a textarea
  // fallback for contexts where it is unavailable).
  const copyCurrentUrl = async () => {
    const url = activeTab?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
  };

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
    // A highlighted history suggestion wins over the raw input.
    if (historyOpen && historyIndex >= 0 && suggestions[historyIndex]) {
      navigate(suggestions[historyIndex].url);
      setHistoryOpen(false);
      setHistoryIndex(-1);
      inputRef.current?.blur();
      return;
    }
    const url = resolveInputToUrl(input);
    if (url) navigate(url);
    setHistoryOpen(false);
    inputRef.current?.blur();
  };

  // Arrow keys walk the history dropdown; Esc closes it.
  const onAddressKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHistoryOpen(true);
      setHistoryIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHistoryIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setHistoryOpen(false);
      setHistoryIndex(-1);
    }
  };

  return (
    <div
      ref={panelRef}
      className="relative h-full flex flex-col bg-[var(--bg-primary)]"
    >
      {/* Browser tab strip */}
      <div className="flex items-center gap-1 px-2 pt-1.5 border-b border-[var(--border)] overflow-x-auto shrink-0">
        {tabs.map((tab) => (
          <Tooltip key={tab.id} content={tab.url || tab.title || 'Browser tab'} placement="bottom">
            <div
              onClick={() => activateTab(tab.id)}
              onMouseDown={(e) => {
                // Middle-click closes the tab, like every other browser.
                if (e.button === 1) {
                  e.preventDefault();
                  closeTab(tab.id);
                }
              }}
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
        <Tooltip content="Reopen closed tab (Ctrl+Shift+T)">
          <button
            onClick={restoreClosedTab}
            disabled={closedTabs.length === 0}
            className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 shrink-0"
          >
            <Undo2 size={14} />
          </button>
        </Tooltip>
      </div>

      {/* Nav bar + address-bar history dropdown */}
      <div className="relative shrink-0">
        <form
          onSubmit={submit}
          className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)]"
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
            onChange={(e) => {
              setInput(e.target.value);
              setHistoryOpen(true);
              setHistoryIndex(-1);
            }}
            onFocus={() => setHistoryOpen(true)}
            onBlur={() => {
              // Let a dropdown mousedown land before the list closes.
              setTimeout(() => setHistoryOpen(false), 120);
            }}
            onKeyDown={onAddressKeyDown}
            placeholder="Search or type a URL"
            className="input flex-1 min-w-0 text-xs"
          />
          <Tooltip content="Find in page (Ctrl+F)">
            <button
              type="button"
              onClick={() => setFindOpen((open) => !open)}
              className={`p-1.5 rounded hover:bg-[var(--bg-secondary)] ${
                findOpen ? 'bg-[var(--bg-tertiary)]' : ''
              }`}
            >
              <Search size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Zoom out (Ctrl+-)">
            <button
              type="button"
              onClick={zoomOut}
              disabled={!activeTab}
              className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
            >
              <ZoomOut size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Zoom level — click to reset to 100% (Ctrl+0)">
            <button
              type="button"
              onClick={resetZoom}
              disabled={!activeTab}
              className="px-1 py-1.5 rounded hover:bg-[var(--bg-secondary)] text-xs text-[var(--text-muted)] disabled:opacity-30 min-w-[42px]"
            >
              {Math.round((activeTab?.zoomFactor ?? 1) * 100)}%
            </button>
          </Tooltip>
          <Tooltip content="Zoom in (Ctrl+=)">
            <button
              type="button"
              onClick={zoomIn}
              disabled={!activeTab}
              className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
            >
              <ZoomIn size={16} />
            </button>
          </Tooltip>
          <Tooltip content={copied ? 'Copied!' : 'Copy page URL'}>
            <button
              type="button"
              onClick={() => void copyCurrentUrl()}
              disabled={!activeTab?.url || activeTab.url === 'about:blank'}
              className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
            >
              <Copy size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Open this page in the system browser">
            <button
              type="button"
              onClick={() => {
                if (activeTab?.url) {
                  void window.lucidAPI.browser.openExternal(activeTab.url);
                }
              }}
              disabled={!activeTab?.url || activeTab.url === 'about:blank'}
              className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
            >
              <ExternalLink size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Saved logins">
            <button
              type="button"
              onClick={() => setLoginsOpen((open) => !open)}
              className={`p-1.5 rounded hover:bg-[var(--bg-secondary)] ${
                loginsOpen ? 'bg-[var(--bg-tertiary)]' : ''
              }`}
            >
              <KeyRound size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Ask the AI about this page">
            <button
              type="button"
              onClick={() => void askAiAboutPage()}
              disabled={!activeTab?.url || activeTab.url === 'about:blank'}
              className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
            >
              <Sparkles size={16} />
            </button>
          </Tooltip>
        </form>

        {/* Saved-logins panel: origin + username only, with Fill /
            Delete per login. */}
        {loginsOpen ? (
          <SavedLoginsPanel onClose={() => setLoginsOpen(false)} />
        ) : null}

        {/* Typed-URL history: recent pages first, filtered as Gary
            types. Arrow keys + Enter pick one; Esc closes. */}
        {historyOpen && suggestions.length > 0 ? (
          <div className="absolute left-2 right-2 top-full z-20 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg overflow-hidden">
            {suggestions.map((entry, i) => (
              <div
                key={entry.url}
                onMouseDown={(e) => {
                  e.preventDefault();
                  navigate(entry.url);
                  setHistoryOpen(false);
                  setHistoryIndex(-1);
                  inputRef.current?.blur();
                }}
                className={`flex flex-col px-2.5 py-1.5 cursor-pointer text-xs ${
                  i === historyIndex
                    ? 'bg-[var(--bg-tertiary)]'
                    : 'hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <span className="truncate text-[var(--text-primary)]">
                  {entry.title || entry.url}
                </span>
                <span className="truncate text-[var(--text-muted)]">
                  {entry.url}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Save-login offer (Area 3): main captured a sign-in on a
          page Gary just left; Save persists it in the vault, Not now
          drops the candidate. */}
      {loginOffer ? (
        <SaveLoginPrompt offer={loginOffer} onDone={clearLoginOffer} />
      ) : null}

      {/* Find-in-page bar */}
      {findOpen ? (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] shrink-0">
          <Search size={13} className="text-[var(--text-muted)] shrink-0" />
          <input
            ref={findInputRef}
            value={findText}
            onChange={(e) => {
              const text = e.target.value;
              setFindText(text);
              if (text) {
                runFind(text);
              } else {
                setFindResult(null);
                if (activeTabId) {
                  void window.lucidAPI.browser.stopFindInPage(
                    activeTabId,
                    'clearSelection',
                  );
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runFind(findText, { forward: !e.shiftKey, findNext: true });
              } else if (e.key === 'Escape') {
                e.preventDefault();
                closeFind();
              }
            }}
            placeholder="Find in page"
            className="input flex-1 min-w-0 text-xs"
          />
          <span className="text-xs text-[var(--text-muted)] whitespace-nowrap px-1">
            {findResult
              ? findResult.matches === 0
                ? 'No matches'
                : `${findResult.activeMatchOrdinal} / ${findResult.matches}`
              : findText
                ? 'Searching…'
                : ''}
          </span>
          <Tooltip content="Close find bar (Esc)">
            <button
              type="button"
              onClick={closeFind}
              className="p-1 rounded hover:bg-[var(--bg-secondary)]"
            >
              <X size={13} />
            </button>
          </Tooltip>
        </div>
      ) : null}

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

      {/* Download shelf (Area 2): renders only while a download
          exists; finished ones stay until Gary dismisses them. */}
      <DownloadShelf />

      {/* HTTP-auth prompt: a page asked for basic-auth credentials.
          Shows the first queued challenge; answering it shows the next. */}
      {authQueue.length > 0 ? (
        <BrowserAuthPrompt
          request={authQueue[0]}
          onDone={() => setAuthQueue((prev) => prev.slice(1))}
        />
      ) : null}
    </div>
  );
}

export default BrowserPanel;
