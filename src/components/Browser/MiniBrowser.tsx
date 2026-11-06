import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  Globe,
  Loader,
  CornerUpLeft,
} from 'lucide-react';
import { PhoneQuickTabs } from './BrowserPanel';
import { PHONE_CONTROL_URL } from '../../stores/browserStore';
import { getPhoneEntries } from '../../phone/streaming';
import { usePhoneStore } from '../../stores/phoneStore';
import { resolveInputToUrl } from '../../stores/browserUrl';
import { focusAddressBar } from '../../lib/browserAddressBar';
import { Tooltip } from '../Tooltip/Tooltip';
import type { BrowserBounds, BrowserTabState } from '../../types';

/**
 * The mini browser window (Area 6): the compact floating window a
 * popped-out tab's BrowserView migrates to. Same renderer, `?mini=browser`
 * mode — no terminal, no AI chat, no synth, just one tab's chrome
 * (nav bar + Phone quick tabs) and the container the main process
 * positions the view over.
 *
 * The window is frameless, so the chrome bar is the drag region
 * (`-webkit-app-region: drag`; buttons and inputs opt out with
 * `no-drag`). The container reports its window-relative rect on
 * mount and on every resize, so the view tracks the window.
 *
 * Phone entries reuse the spike's `getPhoneEntries` + GPU gate
 * exactly like the panel's: the external entry navigates this tab
 * to the phone app, and the internal entry is gated identically —
 * clicking it pops the tab back into the panel and opens the stream
 * there (the stream's frames are delivered to the main window, so
 * it cannot live in the mini window).
 */

function MiniBrowser() {
  const [tabId, setTabId] = useState<string | null>(null);
  const [tabState, setTabState] = useState<BrowserTabState | null>(null);
  const [input, setInput] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Phone entries: the external app always, the in-app stream only
  // when the Android add-on is installed — greyed out with its
  // hover reason when the GPU gate is closed (same gate as the panel).
  const androidAddonInstalled = usePhoneStore((s) => s.androidAddonInstalled);
  const gpuGate = usePhoneStore((s) => s.gpuGate);
  const refreshGpuGate = usePhoneStore((s) => s.refreshGpuGate);
  const phoneEntries = getPhoneEntries({ androidAddonInstalled, gpuGate });

  useEffect(() => {
    void refreshGpuGate();
  }, [refreshGpuGate]);

  // Tab state from the main process (url/title/loading/nav state).
  // The main process pushes `browser:mini-state` on every view
  // update while this tab is popped out.
  useEffect(() => {
    const cleanup = window.lucidAPI.browser.onMiniState((id, state) => {
      setTabId(id);
      setTabState(state);
      if (document.activeElement !== inputRef.current) {
        setInput(state.url);
      }
    });
    return () => {
      cleanup();
    };
  }, []);

  // Cmd+L / Ctrl+L typed INSIDE the page: the BrowserView is a
  // separate webContents, so this window's keydown listener never
  // sees it — main intercepts it (before-input-event) and forwards
  // it here, since this window owns the popped-out view.
  useEffect(() => {
    const cleanup = window.lucidAPI.browser.onFocusAddressBar(() => {
      focusAddressBar(inputRef.current);
    });
    return () => {
      cleanup();
    };
  }, []);

  // Report the container's window-relative rect so the main process
  // can position the view under the chrome — on mount and on every
  // resize of the container or the window.
  useEffect(() => {
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
    void window.lucidAPI.browser.setMiniBounds(bounds());
    const observer = new ResizeObserver(() => {
      void window.lucidAPI.browser.setMiniBounds(bounds());
    });
    observer.observe(el);
    const onWindowResize = () => {
      void window.lucidAPI.browser.setMiniBounds(bounds());
    };
    window.addEventListener('resize', onWindowResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
    };
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tabId) return;
    const url = resolveInputToUrl(input);
    if (url) void window.lucidAPI.browser.navigate(tabId, url);
    inputRef.current?.blur();
  };

  const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties;
  const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-primary)] overflow-hidden">
      {/* Mini chrome: nav bar + pop-in + close. The bar is the drag
          region (frameless window); buttons and the input opt out. */}
      <div style={dragStyle} className="shrink-0 border-b border-[var(--border)]">
        <form
          onSubmit={submit}
          className="flex items-center gap-1 px-2 py-1.5"
        >
          <span style={noDragStyle} className="flex items-center gap-1">
            <Tooltip content="Back">
              <button
                type="button"
                onClick={() => {
                  if (tabId) void window.lucidAPI.browser.goBack(tabId);
                }}
                disabled={!tabState?.canGoBack}
                className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
              >
                <ArrowLeft size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Forward">
              <button
                type="button"
                onClick={() => {
                  if (tabId) void window.lucidAPI.browser.goForward(tabId);
                }}
                disabled={!tabState?.canGoForward}
                className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
              >
                <ArrowRight size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Reload">
              <button
                type="button"
                onClick={() => {
                  if (tabId) void window.lucidAPI.browser.reload(tabId);
                }}
                disabled={!tabId}
                className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
              >
                <RotateCw size={16} />
              </button>
            </Tooltip>
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search or type a URL"
            className="input flex-1 min-w-0 text-xs"
            style={noDragStyle}
          />
          <span style={noDragStyle} className="flex items-center gap-1">
            <Tooltip content="Pop back into the main window">
              <button
                type="button"
                onClick={() => {
                  if (tabId) void window.lucidAPI.browser.popIn(tabId);
                }}
                disabled={!tabId}
                className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
              >
                <CornerUpLeft size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Close mini window (tab pops back in)">
              <button
                type="button"
                onClick={() => void window.lucidAPI.browser.closeMini()}
                className="p-1.5 rounded hover:bg-[var(--bg-secondary)]"
              >
                <X size={16} />
              </button>
            </Tooltip>
          </span>
        </form>
      </div>

      {/* Phone quick tabs — same entries and same GPU gate as the
          panel. External opens the phone app in this tab; internal
          pops the tab back in and streams in the panel. */}
      <div style={noDragStyle}>
        <PhoneQuickTabs
          entries={phoneEntries}
          onOpenExternal={() => {
            if (tabId) {
              void window.lucidAPI.browser.navigate(tabId, PHONE_CONTROL_URL);
            }
          }}
          onOpenInternal={() => void window.lucidAPI.browser.miniOpenInternal()}
        />
      </div>

      {/* The popped-out tab's view is positioned over this container
          by the main process. White underneath so the viewport reads
          as a browser while a page loads. */}
      <div ref={containerRef} className="flex-1 min-h-0 bg-white relative">
        {!tabId ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] bg-white">
            <Loader size={14} className="animate-spin" />
            Waiting for the tab…
          </div>
        ) : tabState?.loading ? (
          <div className="absolute top-2 left-2 flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Globe size={12} />
            <span className="truncate max-w-[400px]">
              {tabState.title || tabState.url}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default MiniBrowser;
