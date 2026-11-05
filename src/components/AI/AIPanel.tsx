import { Sparkles, Globe, X } from 'lucide-react';
import AIChat from './AIChat';
import BrowserPanel from '../Browser/BrowserPanel';
import { useBrowserStore } from '../../stores/browserStore';

/**
 * The right-hand panel, tabbed: [AI Chat] [Browser].
 *
 * Switching tabs is free and preserves state on both sides:
 * - AI Chat stays mounted when the Browser tab is active — it is
 *   hidden, not unmounted (same pattern as the Terminal tabs in
 *   App.tsx). Its session/messages live in aiStore, and its mount-time
 *   probe (loadSessions + checkBackendStatus) must not re-run on every
 *   tab switch. AIChat itself is untouched, including its gate logic.
 * - The browser keeps its pages: switching tabs only attaches/detaches
 *   the active BrowserView in the main process, never destroys it.
 *
 * The panel is still toggled as a whole by the StatusBar AI button
 * (App.tsx `showAI`); this component only owns which tab is showing.
 */

interface AIPanelProps {
  onClose: () => void;
}

function AIPanel({ onClose }: AIPanelProps) {
  const panelTab = useBrowserStore((s) => s.panelTab);
  const setPanelTab = useBrowserStore((s) => s.setPanelTab);

  const tabButton = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-sm ${
      active
        ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-semibold'
        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
    }`;

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      {/* Panel tab bar — same header style as the "Lucid AI" header */}
      <div className="flex items-center gap-1 px-2 pt-2 border-b border-[var(--border)] shrink-0">
        <button
          onClick={() => setPanelTab('ai')}
          className={tabButton(panelTab === 'ai')}
        >
          <Sparkles size={14} className="text-[var(--accent)]" />
          AI Chat
        </button>
        <button
          onClick={() => setPanelTab('browser')}
          className={tabButton(panelTab === 'browser')}
        >
          <Globe size={14} className="text-[var(--accent)]" />
          Browser
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="btn-ghost p-1 rounded"
          title="Close panel"
        >
          <X size={16} />
        </button>
      </div>

      <div
        className={`flex-1 min-h-0 ${
          panelTab === 'ai' ? 'flex flex-col' : 'hidden'
        }`}
      >
        <AIChat onClose={onClose} />
      </div>
      <div
        className={`flex-1 min-h-0 ${
          panelTab === 'browser' ? 'flex flex-col' : 'hidden'
        }`}
      >
        <BrowserPanel />
      </div>
    </div>
  );
}

export default AIPanel;
