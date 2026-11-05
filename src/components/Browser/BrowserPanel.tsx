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
import { useBrowserStore, QUICK_TABS } from '../../stores/browserStore';
import { resolveInputToUrl } from '../../stores/browserUrl';
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
          <div
            key={tab.id}
            onClick={() => activateTab(tab.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-t-md text-xs cursor-pointer whitespace-nowrap max-w-[160px] ${
              tab.id === activeTabId
                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
            }`}
            title={tab.url}
          >
            {tab.loading ? (
              <Loader size={12} className="animate-spin shrink-0" />
            ) : (
              <Globe size={12} className="shrink-0" />
            )}
            <span className="truncate">{tab.title || tab.url}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] shrink-0"
              title="Close tab"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          onClick={() => createTab()}
          className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"
          title="New tab"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Nav bar */}
      <form
        onSubmit={submit}
        className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] shrink-0"
      >
        <button
          type="button"
          onClick={goBack}
          disabled={!activeTab?.canGoBack}
          className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
          title="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          onClick={goForward}
          disabled={!activeTab?.canGoForward}
          className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
          title="Forward"
        >
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          onClick={reload}
          className="p-1.5 rounded hover:bg-[var(--bg-secondary)]"
          title="Reload"
        >
          <RotateCw size={16} />
        </button>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search or type a URL"
          className="input flex-1 min-w-0 text-xs"
        />
      </form>

      {/* Quick tabs — anchored pinned pages */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] shrink-0">
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mr-1">
          Quick
        </span>
        {QUICK_TABS.map((q) => (
          <button
            key={q.id}
            onClick={() => openQuickTab(q.url)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-xs"
            title={q.url}
          >
            <Smartphone size={13} className="text-[var(--accent)]" />
            {q.label}
          </button>
        ))}
      </div>

      {/* The BrowserView is positioned over this container by the main
          process. White underneath so the viewport reads as a browser
          while a page loads. */}
      <div ref={containerRef} className="flex-1 min-h-0 bg-white" />
    </div>
  );
}

export default BrowserPanel;
