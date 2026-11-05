import { useEffect } from 'react';
import { KeyRound, Trash2, X } from 'lucide-react';
import { useBrowserCredentials } from '../../stores/browserCredentials';

/**
 * Saved-logins management for the in-panel browser (Area 3).
 *
 * Lists what the vault holds — origin + username only, never a
 * password. Fill re-fills the active tab's page from the vault;
 * Delete removes the login (after that, signing in on the site
 * offers to save it again). Opens as a popover from the key button
 * in the nav bar.
 */
export function SavedLoginsPanel({ onClose }: { onClose: () => void }) {
  const savedLogins = useBrowserCredentials((s) => s.savedLogins);
  const load = useBrowserCredentials((s) => s.load);
  const deleteLogin = useBrowserCredentials((s) => s.deleteLogin);
  const fillSavedLogin = useBrowserCredentials((s) => s.fillSavedLogin);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="absolute right-2 top-full z-20 w-[320px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <KeyRound size={13} className="text-[var(--accent)] shrink-0" />
        <span className="flex-1 text-xs font-semibold text-[var(--text-primary)]">
          Saved logins
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
        >
          <X size={13} />
        </button>
      </div>
      {savedLogins.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-[var(--text-muted)]">
          No saved logins yet. Sign in on a site and Lucid will offer
          to save it.
        </p>
      ) : (
        savedLogins.map((login) => (
          <div
            key={login.origin}
            className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] last:border-b-0 text-xs"
          >
            <div className="flex-1 min-w-0">
              <div className="truncate text-[var(--text-primary)] font-medium">
                {login.origin}
              </div>
              <div className="truncate text-[var(--text-muted)]">
                {login.username}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                fillSavedLogin();
                onClose();
              }}
              className="px-2 py-1 rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] shrink-0"
            >
              Fill
            </button>
            <button
              type="button"
              onClick={() => deleteLogin(login.origin)}
              title={`Delete saved login for ${login.origin}`}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-red-300 shrink-0"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
