/**
 * OnlineIndicator Component (Gary, 2026-11-09 ~02:51 PST).
 *
 * A circle + label on the FixNet line, top-right, opposite the
 * FixNet stats: green circle + "online" while the terminal is
 * active within the system to the computer, blackened circle +
 * "offline" when it is not.
 *
 * The state is NOT a timer and NOT a guess: `isOnline` comes from
 * the terminal store's real PTY state (see isActiveTerminalOnline
 * in src/stores/terminalStore.ts) — the active tab's shell is alive
 * (spawned, never exited, no spawn error). The store learns a shell
 * died from the main process's real `terminal:exit` event, relayed
 * through App's onExit listener.
 *
 * Purely presentational: it takes the boolean and renders. No store
 * read, no IPC, no timer here, so the two states are trivially
 * testable in isolation.
 */

export function OnlineIndicator({ isOnline }: { isOnline: boolean }) {
  return (
    <span
      data-testid="online-indicator"
      data-online={isOnline ? 'true' : 'false'}
      title={isOnline ? 'Terminal connected to this computer' : 'Terminal not connected'}
      className="flex items-center gap-1.5 font-mono text-xs"
    >
      <span
        data-testid="online-dot"
        aria-hidden="true"
        className={
          isOnline
            ? 'inline-block h-2 w-2 rounded-full bg-green-500'
            : // Blackened (Gary, 2026-11-09 ~02:52 PST): a black dot.
              // The border keeps it visible against the black screen —
              // without it a black dot on black is invisible.
              'inline-block h-2 w-2 rounded-full bg-black border border-neutral-700'
        }
      />
      <span className={isOnline ? 'text-green-400' : 'text-gray-500'}>
        {isOnline ? 'online' : 'offline'}
      </span>
    </span>
  );
}
