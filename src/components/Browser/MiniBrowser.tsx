import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  Globe,
  Loader,
  CornerUpLeft,
  Hand,
  Lock,
  Square,
  Undo2,
  Unlock,
} from 'lucide-react';
import { PhoneQuickTabs } from './BrowserPanel';
import { PHONE_CONTROL_URL } from '../../stores/browserStore';
import { getPhoneEntries } from '../../phone/streaming';
import { usePhoneStore } from '../../stores/phoneStore';
import { resolveInputToUrl } from '../../stores/browserUrl';
import { focusAddressBar } from '../../lib/browserAddressBar';
import { Tooltip } from '../Tooltip/Tooltip';
import { useBrowserAgentStore } from '../../stores/browserAgentStore';
import { AgentMouseCursor } from './AgentMouseCursor';
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
  // Agent browser (Phase B): the live agent mouse, the glass
  // splash, and Gary's stop / take-control surface.
  const agentMouse = useBrowserAgentStore((s) => s.mouse);
  const agentInUse = useBrowserAgentStore((s) => s.inUse);
  const agentFullscreen = useBrowserAgentStore((s) => s.fullscreen);
  const agentHolder = useBrowserAgentStore((s) => s.holder);
  const garyHasControl = useBrowserAgentStore((s) => s.garyHasControl);
  const fingerLocked = useBrowserAgentStore((s) => s.fingerLocked);
  const luciferAiEnabled = useBrowserAgentStore((s) => s.luciferAiEnabled);
  // The agent-state snapshot has arrived at least once: before
  // that the store is a placeholder, and the LuciferAI-off bar
  // must not flash on a default.
  const agentHydrated = useBrowserAgentStore((s) => s.hydrated);
  // No glass splash here: a BrowserView paints ABOVE its host
  // window's DOM, so any overlay inside the container below (the
  // splash, the fullscreen badge, the DOM agent cursor) is
  // invisible while the page is attached. The splash lives on the
  // browser tab in the main window instead — the view is detached
  // there during an agent burst, so the splash is visible while
  // the mini goes fullscreen. The visible agent mouse is the
  // in-page cursor (CDP, electron/services/browserCdp.ts); the
  // DOM cursor below only shows while no view is attached.
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

  // Agent-browser state from the main process (in use, splash,
  // mouse, holder, Gary's control, finger lock, LuciferAI).
  useEffect(() => {
    const cleanup = window.lucidAPI.browser.onAgentState((state) => {
      useBrowserAgentStore.getState().applyAgentState(state);
    });
    void window.lucidAPI.browser
      .getAgentState()
      .then((r) => {
        if (r.state) useBrowserAgentStore.getState().applyAgentState(r.state);
      })
      .catch(() => undefined);
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
            {agentFullscreen && (
              <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm whitespace-nowrap">
                Fullscreen — agent browsing
              </span>
            )}
            <Tooltip
              content={
                fingerLocked
                  ? 'Browser finger locked — no agent can browse (click to unlock)'
                  : 'Browser finger unlocked (click to lock it — no agent can browse)'
              }
            >
              <button
                type="button"
                aria-label={
                  fingerLocked
                    ? 'Unlock the browser finger'
                    : 'Lock the browser finger'
                }
                onClick={() =>
                  void window.lucidAPI.browser.setBrowserFingerLocked(
                    !fingerLocked,
                  )
                }
                className="p-1.5 rounded hover:bg-[var(--bg-secondary)]"
              >
                {fingerLocked ? <Lock size={16} /> : <Unlock size={16} />}
              </button>
            </Tooltip>
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

      {/* LuciferAI-disabled control (Phase B): when LuciferAI is
          off, the mini window is there for Gary to stop the agent
          or take the mouse. The Stop button ends the agent's
          browsing (and any running flow); Take control hands Gary
          the mouse and refuses agent tools until he gives it back. */}
      {!luciferAiEnabled && agentHydrated && (
        <div
          data-testid="agent-control-bar"
          className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)] text-xs"
        >
          {garyHasControl ? (
            <>
              <span className="font-semibold">You have the mouse</span>
              <span className="text-[var(--text-muted)]">
                Agent browsing is paused.
              </span>
              <button
                type="button"
                onClick={() =>
                  void window.lucidAPI.browser.giveBackAgentControl()
                }
                className="ml-auto flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--bg-primary)]"
              >
                <Undo2 size={14} />
                Give back
              </button>
            </>
          ) : (
            <>
              <span className="font-semibold">LuciferAI off</span>
              <span className="text-[var(--text-muted)]">
                {agentInUse || agentHolder
                  ? `Agent ${agentHolder ?? ''} is browsing.`
                  : 'The browser is yours.'}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  disabled={!agentInUse && !agentHolder}
                  onClick={() =>
                    void window.lucidAPI.browser.stopAgentBrowser()
                  }
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--bg-primary)] disabled:opacity-30"
                >
                  <Square size={14} />
                  Stop agent
                </button>
                <button
                  type="button"
                  disabled={!agentInUse && !agentHolder}
                  onClick={() =>
                    void window.lucidAPI.browser.takeAgentControl()
                  }
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--bg-primary)] disabled:opacity-30"
                >
                  <Hand size={14} />
                  Take control
                </button>
              </span>
            </>
          )}
        </div>
      )}

      {/* The popped-out tab's view is positioned over this container
          by the main process. White underneath so the viewport reads
          as a browser while a page loads. */}
      <div ref={containerRef} className="flex-1 min-h-0 bg-white relative">
        <AgentMouseCursor mouse={agentMouse} />
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
