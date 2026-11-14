/**
 * The copilot tab — a tab in the AI chat (Gary, 2026-11-13).
 *
 * One thread per copilot, picked from the dropdown. A copilot
 * runs the agent loop in the tab (read, edit, checkEdit-verify,
 * fix) with the driving-intelligence gate on every tool call
 * and every edit shown for Keep/Reject review — the same loop,
 * tools, and review card the terminal path uses, with the
 * copilot's model as the brain.
 *
 * The tab is the Files-tab copilot agent's surface, so it
 * works in guest too (Gary's carve-out): the runner is called
 * directly with isGuest, never through the terminal guards.
 * The guest blank-slate rule stands — the thread is memory
 * only, and the veil drops it on guest exit.
 *
 * A copilot with no key configured shows that it is
 * unconfigured, never an error in the user's face; the local
 * planner needs no key at all.
 */
import { useEffect, useRef, useState } from 'react';
import { Bot, Send, StopCircle } from 'lucide-react';
import { useCopilotStore, type CopilotMessage } from '../../stores/copilotStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useFileStore } from '../../stores/fileStore';
import { useHistoryStore } from '../../stores/historyStore';
import {
  copilotModelLabel,
  copilotUnconfiguredReason,
} from '../../lib/copilotModels';
import { AgentReviewBlock } from '../Terminal/AgentReviewBlock';
import type { SettingsTab } from '../Settings/SettingsPanel';

function RunMessage({ message }: { message: CopilotMessage }) {
  return (
    <div data-testid="copilot-run" className="px-3 py-2">
      {message.inFlight && (
        <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          Working…
        </div>
      )}
      <div className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.5] text-[var(--text-primary)]">
        {message.text}
      </div>
    </div>
  );
}

export function CopilotView({
  onOpenSettings,
}: {
  onOpenSettings?: (tab: SettingsTab) => void;
}) {
  const copilots = useSettingsStore((s) => s.settings.copilots);
  const hasCopilotKey = useSettingsStore((s) => s.hasCopilotApiKey);
  const activeCopilotId = useCopilotStore((s) => s.activeCopilotId);
  const threads = useCopilotStore((s) => s.threads);
  const runningCopilotId = useCopilotStore((s) => s.runningCopilotId);
  const selectCopilot = useCopilotStore((s) => s.selectCopilot);
  const runPrompt = useCopilotStore((s) => s.runPrompt);
  const stopRun = useCopilotStore((s) => s.stopRun);
  const workspaceRoot = useFileStore((s) => s.currentDir);
  const isGuest = useHistoryStore((s) => s.guestSessionActive);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // The review card in this thread flips to kept/rejected
  // through the store's resolution-listener subscription
  // (copilotStore.ts) — the feed re-render does not reach here,
  // and the store's subscription survives the panel closing.

  // The active copilot is the picked one when it still exists,
  // else the first in the list (a removed copilot never leaves
  // the tab pointing at nothing).
  const activeCopilot = copilots.find((c) => c.id === activeCopilotId) ?? copilots[0] ?? null;
  const thread = activeCopilot ? (threads[activeCopilot.id] ?? []) : [];
  const isRunning = activeCopilot !== null && runningCopilotId === activeCopilot.id;
  const unconfiguredReason = activeCopilot
    ? copilotUnconfiguredReason(activeCopilot, hasCopilotKey)
    : null;

  useEffect(() => {
    // jsdom has no scrollIntoView — the optional call is a
    // no-op there and smooth-scrolls in the real panel.
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [thread.length]);

  const send = () => {
    const text = input.trim();
    if (!activeCopilot || !text || isRunning || unconfiguredReason || !workspaceRoot) return;
    setInput('');
    void runPrompt(activeCopilot.id, text);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header: the picker + the model badge. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Bot size={16} className="shrink-0 text-[var(--text-muted)]" />
        {copilots.length === 0 ? (
          <span className="font-mono text-[12px] text-[var(--text-muted)]">No copilots yet</span>
        ) : (
          <>
            <select
              data-testid="copilot-picker"
              aria-label="Pick a copilot"
              value={activeCopilot?.id ?? ''}
              onChange={(e) => selectCopilot(e.target.value)}
              className="min-w-0 flex-1 truncate rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-1 font-mono text-[12px] text-[var(--text-primary)] outline-none"
            >
              {copilots.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {activeCopilot && (
              <span
                data-testid="copilot-model"
                className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-muted)]"
                title={activeCopilot.model}
              >
                {copilotModelLabel(activeCopilot.model)}
              </span>
            )}
          </>
        )}
      </div>

      {/* The thread. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {copilots.length === 0 ? (
          <div className="px-3 py-4 font-mono text-[12px] leading-[1.6] text-[var(--text-muted)]">
            <p>Add one in Settings &gt; AI, then pick it here.</p>
            <p className="mt-2">
              A copilot runs the agent loop in this tab: it reads files, makes edits, checks each
              edit, and shows every edit for Keep/Reject first. The local planner needs no key.
            </p>
            {onOpenSettings && (
              <button
                type="button"
                data-testid="copilot-open-settings"
                onClick={() => onOpenSettings('ai')}
                className="mt-3 rounded border border-[var(--border)] px-2 py-1 font-mono text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-primary)]"
              >
                Open Settings &gt; AI
              </button>
            )}
          </div>
        ) : (
          <>
            {isGuest && (
              <p
                data-testid="copilot-guest-note"
                className="border-b border-[var(--border)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]"
              >
                Guest — the copilot works on this workspace and keeps nothing.
              </p>
            )}
            {thread.length === 0 && !unconfiguredReason && (
              <p className="px-3 py-4 font-mono text-[12px] text-[var(--text-muted)]">
                Ask {activeCopilot?.name} to build or change something in the open workspace —
                every edit is shown for Keep/Reject first.
              </p>
            )}
            {thread.map((message) =>
              message.kind === 'user' ? (
                <div
                  key={message.id}
                  data-testid="copilot-user-message"
                  className="border-b border-[var(--border)] px-3 py-2"
                >
                  <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    You
                  </div>
                  <div className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.5] text-[var(--text-primary)]">
                    {message.text}
                  </div>
                </div>
              ) : message.kind === 'review' && message.review ? (
                <div
                  key={message.id}
                  data-testid="copilot-review-message"
                  className="border-b border-[var(--border)]"
                >
                  <AgentReviewBlock
                    review={message.review}
                    timestamp={message.timestamp}
                    blockId={message.id}
                  />
                </div>
              ) : message.kind === 'run' ? (
                <div key={message.id} className="border-b border-[var(--border)]">
                  <RunMessage message={message} />
                </div>
              ) : (
                <p
                  key={message.id}
                  className="border-b border-[var(--border)] px-3 py-2 font-mono text-[12px] text-[var(--text-muted)]"
                >
                  {message.text}
                </p>
              ),
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* The unconfigured state: a state, never an error. */}
      {activeCopilot && unconfiguredReason && (
        <div className="shrink-0 border-t border-[var(--border)] px-3 py-2">
          <p data-testid="copilot-unconfigured" className="font-mono text-[12px] text-[var(--text-muted)]">
            {unconfiguredReason}
          </p>
          {activeCopilot.model === 'github-copilot' && onOpenSettings && (
            <button
              type="button"
              data-testid="copilot-open-settings-key"
              onClick={() => onOpenSettings('ai')}
              className="mt-2 rounded border border-[var(--border)] px-2 py-1 font-mono text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-primary)]"
            >
              Open Settings &gt; AI
            </button>
          )}
        </div>
      )}

      {/* No workspace: the copilot works on a workspace. */}
      {activeCopilot && !unconfiguredReason && !workspaceRoot && (
        <p className="shrink-0 border-t border-[var(--border)] px-3 py-2 font-mono text-[12px] text-[var(--text-muted)]">
          Open a folder in the Files tab first — the copilot works on a workspace.
        </p>
      )}

      {/* Input: Enter sends, Shift+Enter is a newline. */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] p-2">
        <textarea
          data-testid="copilot-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            !activeCopilot
              ? 'Add a copilot in Settings > AI to start'
              : unconfiguredReason
                ? 'This copilot is not configured yet'
                : !workspaceRoot
                  ? 'Open a folder in the Files tab first'
                  : `Ask ${activeCopilot.name}…`
          }
          disabled={!activeCopilot || isRunning || unconfiguredReason !== null || !workspaceRoot}
          rows={2}
          className="min-w-0 flex-1 resize-none rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 font-mono text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50"
        />
        {isRunning ? (
          <button
            type="button"
            data-testid="copilot-stop"
            aria-label="Stop the copilot run"
            onClick={() => activeCopilot && stopRun(activeCopilot.id)}
            className="shrink-0 rounded border border-[var(--border)] p-1.5 text-[var(--text-primary)] hover:bg-[var(--bg-primary)]"
          >
            <StopCircle size={18} />
          </button>
        ) : (
          <button
            type="button"
            data-testid="copilot-send"
            aria-label="Send to the copilot"
            onClick={send}
            disabled={!activeCopilot || !input.trim() || unconfiguredReason !== null || !workspaceRoot}
            className="shrink-0 rounded border border-[var(--border)] p-1.5 text-[var(--text-primary)] hover:bg-[var(--bg-primary)] disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
