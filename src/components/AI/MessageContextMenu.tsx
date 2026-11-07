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
 */
import { useEffect } from 'react';
import { Volume2, Copy } from 'lucide-react';

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
}

export function MessageContextMenu({
  x,
  y,
  showSpeak,
  onSpeak,
  onCopy,
  onClose,
}: MessageContextMenuProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const itemClass =
    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded';

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
          <button
            data-message-speak
            onClick={() => {
              onSpeak();
              onClose();
            }}
            className={itemClass}
            role="menuitem"
          >
            <Volume2 size={14} />
            Speak
          </button>
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
