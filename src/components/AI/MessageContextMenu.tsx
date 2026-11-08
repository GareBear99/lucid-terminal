/**
 * Message context menu — the right-click menu on an AI chat message.
 *
 * Copy is ALWAYS here (Gary: Copy is a basic function, it must not
 * be gated behind Persona Plex — it works with or without Persona
 * Plex installed, Speak toggle on or off). Speak shows only when
 * `showSpeak` is true — that is the Speak gate (Persona Plex
 * installed AND the Speak toggle on AND the active persona's own
 * Speak on; see shouldShowSpeakOption in src/lib/personaPlex.ts).
 * The menu is always the custom one now: AIChat always prevents
 * the browser's default menu on a message right-click, so Copy is
 * never lost to an unreliable default menu in Electron. Closes on
 * any click outside the menu, on Escape, or after picking an option.
 *
 * Speak actor dropdown (Gary, 2026-11-07): a dropdown arrow sits
 * next to Speak. Clicking it opens the actor list — the voices
 * this machine can speak (the Persona Plex cast first). Picking an
 * actor speaks the message in that actor's voice right away AND
 * remembers the pick (AIChat persists it as `speakActorVoice`),
 * so later Speaks use that actor. The Default row clears the pick:
 * Speak then uses the default — the ACTIVE HOMUNCULUS's voice
 * (see resolveDefaultSpeakVoice in src/lib/personaPlex.ts). When
 * no actor is picked, the Speak row shows the voice it will use.
 * Clicking Speak itself (not the arrow) speaks with the current
 * selection and never opens the list.
 */
import { useEffect, useState } from 'react';
import { Volume2, Copy, ChevronRight, ChevronDown, Check } from 'lucide-react';

interface MessageContextMenuProps {
  /** Screen position of the right-click. */
  x: number;
  y: number;
  /** Whether the Speak option shows (the Persona Plex Speak gate). */
  showSpeak: boolean;
  /** Read the message aloud in the active persona's voice. */
  onSpeak: () => void;
  /** Copy the message text. */
  onCopy: () => void;
  /** Close the menu without picking anything. */
  onClose: () => void;
  /** Actors to pick from — voice names, cast first (see
   *  speakActorOptions). Empty / omitted = only the Default row. */
  speakActors?: string[];
  /** The picked actor's voice name, or null = none picked (the
   *  default — the active Homunculus's voice). */
  selectedActor?: string | null;
  /** What the Default row says, e.g. "Lucifer's voice · Karen". */
  defaultActorLabel?: string;
  /** The voice Speak will use right now (the picked actor, else
   *  the default voice) — shown as a hint on the Speak row. */
  currentSpeakVoice?: string | null;
  /** Pick an actor: persist the pick AND speak the message in
   *  that voice now. Null = pick the Default (clear the pick)
   *  and speak in the default voice. The menu closes after. */
  onPickActor?: (voice: string | null) => void;
}

export function MessageContextMenu({
  x,
  y,
  showSpeak,
  onSpeak,
  onCopy,
  onClose,
  speakActors = [],
  selectedActor = null,
  defaultActorLabel = 'Active Homunculus voice',
  currentSpeakVoice = null,
  onPickActor,
}: MessageContextMenuProps) {
  // The actor list is closed until the arrow is clicked — opening
  // the menu never opens the list on its own.
  const [actorsOpen, setActorsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const itemClass =
    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded';

  const pickActor = (voice: string | null) => {
    onPickActor?.(voice);
    onClose();
  };

  return (
    <>
      {/* Click-catcher — any click outside the menu closes it. */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        aria-hidden="true"
      />
      <div
        data-message-context-menu
        className="fixed z-50 min-w-40 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg p-1"
        style={{ left: x, top: y }}
        role="menu"
      >
        {showSpeak && (
          <>
            <div className="flex items-center gap-0.5" role="none">
              <button
                data-message-speak
                onClick={() => {
                  onSpeak();
                  onClose();
                }}
                className={`${itemClass} flex-1`}
                role="menuitem"
                title={
                  selectedActor
                    ? `Speak in ${selectedActor}'s voice`
                    : `Speak in the default voice — ${defaultActorLabel}`
                }
              >
                <Volume2 size={14} />
                <span>Speak</span>
                {currentSpeakVoice && (
                  <span className="ml-auto text-xs text-[var(--text-muted)]">
                    {selectedActor ? selectedActor : `Default · ${currentSpeakVoice}`}
                  </span>
                )}
              </button>
              <button
                data-message-speak-actors
                onClick={() => setActorsOpen((open) => !open)}
                className="shrink-0 p-2 rounded text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                role="menuitem"
                aria-label="Choose speaking voice"
                aria-expanded={actorsOpen}
                title="Choose speaking voice — pick an actor, or Default for the active Homunculus's voice"
              >
                {actorsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            </div>
            {actorsOpen && (
              <div
                data-message-speak-actor-list
                // The list can be long (every voice on the machine) —
                // cap its height and scroll it, so rows below the
                // window's bottom edge stay reachable instead of
                // being clipped away with no way to get to them.
                className="mt-1 pt-1 border-t border-[var(--border)] max-h-72 overflow-y-auto"
                role="menu"
                aria-label="Speaking voices"
              >
                <button
                  data-speak-actor-default
                  onClick={() => pickActor(null)}
                  className={itemClass}
                  role="menuitem"
                  title={`Use the default voice — ${defaultActorLabel}`}
                >
                  <span className="w-4 shrink-0">
                    {selectedActor === null && <Check size={14} />}
                  </span>
                  <span className="truncate">Default — {defaultActorLabel}</span>
                </button>
                {speakActors.map((voice) => (
                  <button
                    key={voice}
                    data-message-speak-actor
                    data-voice={voice}
                    onClick={() => pickActor(voice)}
                    className={itemClass}
                    role="menuitem"
                    title={`Speak in ${voice}'s voice`}
                  >
                    <span className="w-4 shrink-0">
                      {selectedActor === voice && <Check size={14} />}
                    </span>
                    <span className="truncate">{voice}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <button
          data-message-copy
          onClick={() => {
            onCopy();
            onClose();
          }}
          className={itemClass}
          role="menuitem"
        >
          <Copy size={14} />
          Copy
        </button>
      </div>
    </>
  );
}
