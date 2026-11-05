/**
 * ForgeView — the Forge (LLMBuilder plugin): where Homunculi are trained.
 *
 * Three areas: the Homunculi roster (left), the pipeline (centre:
 * Data → Train → Benchmark → Gate → Promote), and the registry /
 * scoreboard (right). Plus a small "Ask the brain" verification box —
 * verification only, NOT a chat surface.
 *
 * Honest scale, stated in plain text below: the tiny/small models do
 * toy text completion, not conversation. A Homunculus brain is a bot
 * with a gaining growth of intelligence — each promotion grows its
 * lineage and its knowledge — not a conversational model.
 *
 * The surface that talks to an installed brain (AI chat? Synth view?)
 * is post-v1 and is NOT wired here.
 */

import { useEffect, useState } from 'react';
import { useForgeStore } from '../../stores/forgeStore';
import { getLlmbuilderApi } from '../../lib/llmbuilderApi';
import type { HomunculusColor } from '../../lib/homunculi';
import { RosterCard } from './RosterCard';
import { PipelinePanel } from './PipelinePanel';
import { ScoreboardPanel } from './ScoreboardPanel';
import { BiographyEditor } from './BiographyEditor';

export function ForgeView() {
  const roster = useForgeStore((s) => s.roster);
  const selectedId = useForgeStore((s) => s.selectedId);
  const setupStatus = useForgeStore((s) => s.setupStatus);
  const setupProgress = useForgeStore((s) => s.setupProgress);
  const lastError = useForgeStore((s) => s.lastError);
  const askResult = useForgeStore((s) => s.askResult);
  const askError = useForgeStore((s) => s.askError);
  const loadRoster = useForgeStore((s) => s.loadRoster);
  const loadScoreboard = useForgeStore((s) => s.loadScoreboard);
  const loadStatus = useForgeStore((s) => s.loadStatus);
  const selectHomunculus = useForgeStore((s) => s.selectHomunculus);
  const createHomunculus = useForgeStore((s) => s.createHomunculus);
  const updateBiography = useForgeStore((s) => s.updateBiography);
  const subscribeProgress = useForgeStore((s) => s.subscribeProgress);
  const askBrain = useForgeStore((s) => s.askBrain);

  const [creating, setCreating] = useState(false);
  const [newColor, setNewColor] = useState<HomunculusColor>('purple');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [askPrompt, setAskPrompt] = useState('Who are you?');
  const [asking, setAsking] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  useEffect(() => {
    void loadRoster();
    void loadStatus();
    void loadScoreboard();
    const unsubscribe = subscribeProgress();
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = roster.find((h) => h.id === selectedId) ?? null;
  const editing = editingId
    ? roster.find((h) => h.id === editingId) ?? null
    : null;

  const handleSetup = async () => {
    const api = getLlmbuilderApi();
    if (!api) return;
    setSettingUp(true);
    try {
      await api.setup();
      await loadStatus();
    } finally {
      setSettingUp(false);
    }
  };

  const handleAsk = async () => {
    if (!selected || !askPrompt.trim()) return;
    setAsking(true);
    try {
      await askBrain(selected.id, askPrompt.trim());
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-primary)] p-4">
      <header className="mb-3 shrink-0">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          Forge
        </h1>
        <p className="text-xs text-[var(--text-muted)]">
          Train your Homunculi — build, benchmark, and promote small
          models. A Homunculus is a bot with a gaining growth of
          intelligence: each promotion grows what it knows.
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Honest scale: the tiny and small models do toy text completion,
          not conversation. A Homunculus brain answers from its training
          records — it says what it can&apos;t answer rather than making
          something up.
        </p>
      </header>

      {setupStatus && !setupStatus.ready && (
        <p
          role="alert"
          className="mb-3 shrink-0 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
        >
          {setupStatus.message ?? 'The Forge is not set up yet.'}{' '}
          <button
            type="button"
            onClick={() => void handleSetup()}
            disabled={settingUp}
            className="underline disabled:opacity-50"
          >
            {settingUp ? 'Setting up…' : 'Run first-time setup'}
          </button>
          {settingUp && setupProgress && (
            <span className="mt-1 block text-[var(--text-secondary)]">
              {setupProgress.message}
            </span>
          )}
        </p>
      )}
      {lastError && (
        <p
          role="alert"
          className="mb-3 shrink-0 rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {lastError}
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Roster (left) */}
        <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
          {roster.length === 0 ? (
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-sm text-[var(--text-secondary)]">
                No Homunculi yet.
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Choose your Homunculus color in the Synth view first —
                the first Homunculus is seeded from that choice.
              </p>
            </div>
          ) : (
            roster.map((h) => (
              <RosterCard
                key={h.id}
                homunculus={h}
                selected={h.id === selectedId}
                onSelect={selectHomunculus}
                onEditBiography={setEditingId}
              />
            ))
          )}
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            className="rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
          >
            + New Homunculus
          </button>
          {creating && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <label className="mb-3 block">
                <span className="mb-1 block text-xs text-[var(--text-muted)]">
                  Colour
                </span>
                <select
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]"
                  value={newColor}
                  onChange={(e) =>
                    setNewColor(e.target.value as HomunculusColor)
                  }
                  aria-label="Colour"
                >
                  <option value="purple">Purple</option>
                  <option value="pink">Pink</option>
                </select>
              </label>
              <BiographyEditor
                name=""
                biography={null}
                onSave={(name, biography) => {
                  void createHomunculus(name, newColor, biography).then(
                    () => setCreating(false),
                  );
                }}
                onCancel={() => setCreating(false)}
              />
            </div>
          )}
          {editing && (
            <BiographyEditor
              name={editing.name}
              biography={editing.biography}
              onSave={(name, biography) => {
                void updateBiography(editing.id, { name, biography }).then(
                  () => setEditingId(null),
                );
              }}
              onCancel={() => setEditingId(null)}
            />
          )}
        </div>

        {/* Pipeline (centre) */}
        <PipelinePanel />

        {/* Registry / scoreboard (right) */}
        <ScoreboardPanel />
      </div>

      {/* Ask the brain — verification only, NOT a chat surface. */}
      <footer className="mt-3 shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <h3 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
          Ask the brain
        </h3>
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          Verification only — checks what the installed brain answers
          from its training records. It is not a chat surface.
        </p>
        {!selected ? (
          <p className="text-xs text-[var(--text-muted)]">
            Select a Homunculus first.
          </p>
        ) : !selected.modelPath ? (
          <p className="text-xs text-[var(--text-muted)]">
            No brain installed — {selected.name} has no model installed
            yet. Promote a candidate and install it as the brain first.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]"
                value={askPrompt}
                onChange={(e) => setAskPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAsk();
                }}
                placeholder="Who are you?"
                aria-label="Ask the brain"
              />
              <button
                type="button"
                onClick={() => void handleAsk()}
                disabled={asking || !askPrompt.trim()}
                className="shrink-0 rounded bg-[var(--accent)] px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                {asking ? 'Asking…' : 'Ask'}
              </button>
            </div>
            {askError && (
              <p className="mt-2 text-xs text-red-300">{askError}</p>
            )}
            {askResult && (
              <div className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                <p>{askResult.answer}</p>
                {askResult.noMatch && (
                  <p className="mt-1 text-[var(--text-muted)]">
                    No strong match in its training records — the honest
                    fallback.
                  </p>
                )}
                {askResult.matchedCapabilities.length > 0 && (
                  <p className="mt-1 text-[var(--text-muted)]">
                    Matched capabilities:{' '}
                    {askResult.matchedCapabilities.join(', ')}
                    {askResult.confidence
                      ? ` — ${askResult.confidence}`
                      : ''}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </footer>
    </div>
  );
}
