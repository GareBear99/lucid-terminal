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

import { useEffect, useMemo, useState } from 'react';
import {
  allowedNewHomunculusColorsFor,
  useForgeStore,
} from '../../stores/forgeStore';
import { getLlmbuilderApi } from '../../lib/llmbuilderApi';
import type { HomunculusColor } from '../../lib/homunculi';
import { detectDualUnison } from '../../lib/dualUnison';
import { RosterCard } from './RosterCard';
import { PipelinePanel } from './PipelinePanel';
import { ScoreboardPanel } from './ScoreboardPanel';
import { BiographyEditor } from './BiographyEditor';
import { DualUnisonPanel } from './DualUnisonPanel';
import { HomunculusVoiceNote } from './HomunculusVoiceNote';
import { TailGeneratorPanel } from './TailGeneratorPanel';

type ForgeTab = 'forge' | 'dual' | 'tail';

export function ForgeView() {
  const roster = useForgeStore((s) => s.roster);
  const selectedId = useForgeStore((s) => s.selectedId);
  const setupStatus = useForgeStore((s) => s.setupStatus);
  const setupProgress = useForgeStore((s) => s.setupProgress);
  const lastError = useForgeStore((s) => s.lastError);
  const askResult = useForgeStore((s) => s.askResult);
  const askError = useForgeStore((s) => s.askError);
  const unison = useForgeStore((s) => s.unison);
  const loadRoster = useForgeStore((s) => s.loadRoster);
  const loadScoreboard = useForgeStore((s) => s.loadScoreboard);
  const loadStatus = useForgeStore((s) => s.loadStatus);
  const selectHomunculus = useForgeStore((s) => s.selectHomunculus);
  const activateHomunculus = useForgeStore((s) => s.activateHomunculus);
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
  // Forge tabs (Gary, 2026-11-06): the Forge itself, the Dual Unison
  // tab (unlocks when the pair is created), and the Tail Generator
  // tab (its requirement is "dual unison detected"). The tabs are
  // always visible so the requirements can be read; the Dual Unison
  // tab carries a Locked badge until the pair exists.
  const [activeTab, setActiveTab] = useState<ForgeTab>('forge');

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

  // Forge rule (Gary, 2026-11-06): a new Homunculus must be the
  // opposite colour of the active one — free choice only while the
  // face is still black / unformed (empty roster). The colour this
  // creation will actually have: the user's pick when it is allowed,
  // otherwise the only allowed colour.
  const allowedColors = useMemo(
    () => allowedNewHomunculusColorsFor(roster, selectedId),
    [roster, selectedId],
  );
  const effectiveColor = allowedColors.includes(newColor)
    ? newColor
    : allowedColors[0];
  // Naming lore (Gary, 2026-11-06): the second Homunculus is EVE, if
  // pink — pre-filled as a default the user can still change. A
  // purple second has no name given, so it gets no default.
  const defaultNewName =
    roster.length === 1 && effectiveColor === 'pink' ? 'EVE' : '';

  // Dual unison detection (derived from the roster, never stored).
  // STOP gate: once dual unison is unlocked, no more singles until
  // the first stop action is input in the Dual Unison tab. The store
  // enforces it too (createHomunculus rejects); the button below is
  // the UI half.
  const dualUnisonDetected = useMemo(
    () => detectDualUnison(roster).detected,
    [roster],
  );
  const stopGateActive =
    dualUnisonDetected && unison.stopAction === 'not-input';

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

  // Full-page scroll (Gary, 2026-11-07): the Forge is one flowing
  // page, not a fixed-height column. This root is a plain flow
  // container on purpose — it must NOT constrain height
  // (`h-full`) or clip (`overflow-hidden`), or the page bunches
  // into the viewport again and the bottom (Ask the brain, the
  // explanation audio) is unreachable. The page scroll lives in
  // the parent, in both mount points: the App main panel wraps
  // the Forge view in a scroll container, and the Settings content
  // area already scrolls. The three columns and the Dual Unison /
  // Tail Generator panels flow with the page the same way — no
  // inner scrolls except the bounded run log inside PipelinePanel.
  return (
    // No background here: the main screen is always splashscreen
    // misty black (Gary, 2026-11-07), so the App root's mist shows
    // through — the panels keep their own fills.
    <div className="p-4">
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

      {/* Forge tabs: Forge / Dual Unison / Tail Generator. */}
      <div
        role="tablist"
        aria-label="Forge tabs"
        className="mb-3 flex shrink-0 gap-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'forge'}
          onClick={() => setActiveTab('forge')}
          className={`rounded-md px-3 py-1.5 text-sm ${
            activeTab === 'forge'
              ? 'bg-[var(--accent)] text-white'
              : 'border border-[var(--border)] text-[var(--text-secondary)]'
          }`}
        >
          Forge
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'dual'}
          onClick={() => setActiveTab('dual')}
          className={`rounded-md px-3 py-1.5 text-sm ${
            activeTab === 'dual'
              ? 'bg-[var(--accent)] text-white'
              : 'border border-[var(--border)] text-[var(--text-secondary)]'
          }`}
        >
          Dual Unison {!dualUnisonDetected && '(Locked)'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tail'}
          onClick={() => setActiveTab('tail')}
          className={`rounded-md px-3 py-1.5 text-sm ${
            activeTab === 'tail'
              ? 'bg-[var(--accent)] text-white'
              : 'border border-[var(--border)] text-[var(--text-secondary)]'
          }`}
        >
          Tail Generator
        </button>
      </div>

      {activeTab === 'dual' ? (
        <DualUnisonPanel />
      ) : activeTab === 'tail' ? (
        <TailGeneratorPanel />
      ) : (
        <>
          <div className="mb-3 shrink-0">
            <p className="text-xs text-[var(--text-muted)]">
              Listen to the Forge page voice message:
            </p>
            <audio
              className="mt-1 w-full max-w-md"
              controls
              preload="metadata"
              src="./forge/forge-main.mp3"
              aria-label="Forge main page voice message"
            />
            <HomunculusVoiceNote />
          </div>
      {/* Three columns — roster, pipeline, scoreboard. They WRAP when the
          mount is narrow (Settings: the tab sidebar + p-6 leave ~700px),
          so the pipeline never crushes to a ~100px strip the way a
          fixed 288 + flex-1 + 320 row did. The pipeline's min-w-72
          (PipelinePanel) is what forces the wrap instead of the crush;
          the scoreboard drops to its own full-width row first. */}
      <div className="flex flex-wrap gap-3" data-testid="forge-columns">
        {/* Roster (left) */}
        <div className="flex w-72 shrink-0 flex-col gap-3">
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
                onActivate={activateHomunculus}
                onEditBiography={setEditingId}
              />
            ))
          )}
          {stopGateActive && (
            <p
              role="alert"
              className="rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
            >
              Dual unison is unlocked — set up the third type in the Dual
              Unison tab first (the first stop action) before making more
              singles.
            </p>
          )}
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            disabled={stopGateActive}
            className="rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--text-muted)] disabled:opacity-50"
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
                  value={effectiveColor}
                  onChange={(e) =>
                    setNewColor(e.target.value as HomunculusColor)
                  }
                  aria-label="Colour"
                >
                  {allowedColors.map((color) => (
                    <option key={color} value={color}>
                      {color === 'purple' ? 'Purple' : 'Pink'}
                    </option>
                  ))}
                </select>
                {allowedColors.length === 1 && (
                  <span className="mt-1 block text-xs text-[var(--text-muted)]">
                    Only {allowedColors[0] === 'purple' ? 'Purple' : 'Pink'}{' '}
                    — a new Homunculus must be the opposite colour of the
                    active one.
                  </span>
                )}
              </label>
              <BiographyEditor
                name={defaultNewName}
                biography={null}
                onSave={(name, biography) => {
                  void createHomunculus(name, effectiveColor, biography)
                    .then(() => setCreating(false))
                    .catch(() => {
                      // Rejected by the opposite-colour rule —
                      // lastError already says why; keep the form
                      // open so the user sees it.
                    });
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
        </>
      )}

      {/* First explanation (Gary, 2026-11-06): the Forge explanation
          and its audio live at the BOTTOM of the page, after all the
          Forge content — not at the top. */}
      <div className="mt-3 shrink-0 border-t border-[var(--border)] pt-3">
        <p className="text-xs text-[var(--text-muted)]">
          How does the Forge work? Listen to the explanation:
        </p>
        <audio
          className="mt-1 w-full max-w-md"
          controls
          preload="metadata"
          src="./forge/forge-explanation.mp3"
          aria-label="Forge explanation audio"
        />
        <HomunculusVoiceNote />
      </div>
    </div>
  );
}
