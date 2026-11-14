import { Sparkles, Globe, Bot, X } from 'lucide-react';
import AIChat from './AIChat';
import { CopilotView } from './CopilotView';
import BrowserPanel from '../Browser/BrowserPanel';
import { Tooltip } from '../Tooltip/Tooltip';
import { useBrowserStore } from '../../stores/browserStore';
import type { SettingsTab } from '../Settings/SettingsPanel';

/**
 * The right-hand panel, tabbed: [AI Chat] [Copilot] [Browser].
 *
 * Switching tabs is free and preserves state on all sides:
 * - AI Chat stays mounted when another tab is active — it is
 *   hidden, not unmounted (same pattern as the Terminal tabs in
 *   App.tsx). Its session/messages live in aiStore, and its mount-time
 *   probe (loadSessions + checkBackendStatus) must not re-run on every
 *   tab switch. AIChat itself is untouched, including its gate logic.
 * - The Copilot tab stays mounted the same way: its threads live
 *   in copilotStore (memory only), and a run in flight is not
 *   interrupted by switching away and back.
 * - The browser keeps its pages: switching tabs only attaches/detaches
 *   the active BrowserView in the main process, never destroys it.
 *
 * The panel is still toggled as a whole by the StatusBar AI button
 * (App.tsx `showAI`); this component only owns which tab is showing.
 */

interface AIPanelProps {
  onClose: () => void;
  /** Open Settings at a tab (the copilot tab's empty state uses it). */
  onOpenSettings?: (tab: SettingsTab) => void;
}

function AIPanel({ onClose, onOpenSettings }: AIPanelProps) {
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
        <Tooltip content="Switch to AI Chat">
          <button
            onClick={() => setPanelTab('ai')}
            className={tabButton(panelTab === 'ai')}
          >
            <Sparkles size={14} className="text-[var(--accent)]" />
            AI Chat
          </button>
        </Tooltip>
        <Tooltip content="Switch to Copilot">
          <button
            onClick={() => setPanelTab('copilot')}
            className={tabButton(panelTab === 'copilot')}
          >
            <Bot size={14} className="text-[var(--accent)]" />
            Copilot
          </button>
        </Tooltip>
        <Tooltip content="Switch to Browser">
          <button
            onClick={() => setPanelTab('browser')}
            className={tabButton(panelTab === 'browser')}
          >
            <Globe size={14} className="text-[var(--accent)]" />
            Browser
          </button>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip content="Close panel">
          <button
            onClick={onClose}
            className="btn-ghost p-1 rounded"
          >
            <X size={16} />
          </button>
        </Tooltip>
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
          panelTab === 'copilot' ? 'flex flex-col' : 'hidden'
        }`}
      >
        <CopilotView onOpenSettings={onOpenSettings} />
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
