import { useState } from 'react';
import type { BrowserAuthRequest } from '../../types';
import { useEventLogStore } from '../../stores/eventLogStore';

/**
 * HTTP-auth prompt for the in-panel browser.
 *
 * A page asked for basic-auth credentials (the main process `login`
 * event). Gary types them here; Sign in sends them back to main,
 * which hands them to the page. Cancel sends null — the page then
 * shows its own auth failure, and nothing is retried silently.
 * Credentials travel main -> page only; they are never stored, never
 * logged, and never enter the AI chat.
 */
export function BrowserAuthPrompt({
  request,
  onDone,
}: {
  request: BrowserAuthRequest;
  onDone: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void window.lucidAPI.browser.authResponse(request.id, {
      username,
      password,
    });
    // Track + diagnose the answer: WHEN Gary answered the
    // page's sign-in ask. Credentials are never logged — only
    // that the prompt was answered. The arrival was logged by
    // BrowserPanel as pending; this closes it.
    // (Gary, 2026-11-08 — track when + why.)
    useEventLogStore.getState().logBrowserAuthPrompt(request.host, 'completed', 'submitted');
    onDone();
  };

  const cancel = () => {
    void window.lucidAPI.browser.authResponse(request.id, null);
    // Track + diagnose the answer: WHEN Gary cancelled the
    // page's sign-in ask. (Gary, 2026-11-08 — track when + why.)
    useEventLogStore.getState().logBrowserAuthPrompt(request.host, 'dismissed', 'cancelled');
    onDone();
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
      <form
        onSubmit={submit}
        className="w-[320px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-xl"
      >
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Sign in to {request.host}
        </h3>
        <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
          {request.url}
        </p>
        {request.realm ? (
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Realm: {request.realm}
          </p>
        ) : null}
        <label className="mt-3 block text-xs text-[var(--text-muted)]">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            className="input mt-1 w-full text-xs"
          />
        </label>
        <label className="mt-2 block text-xs text-[var(--text-muted)]">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input mt-1 w-full text-xs"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            className="px-3 py-1.5 rounded-md bg-[var(--bg-tertiary)] text-xs hover:bg-[var(--bg-secondary)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-md bg-[var(--accent)] text-xs font-semibold text-white"
          >
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
}
