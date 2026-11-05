import { KeyRound } from 'lucide-react';
import { useBrowserCredentials } from '../../stores/browserCredentials';
import type { BrowserLoginOffer } from '../../types';

/**
 * Save-login offer for the in-panel browser (Area 3).
 *
 * Main captured a sign-in on a page Gary just left (navigation
 * after a filled password field) and is holding the credentials in
 * its own memory. Save persists them in the encrypted vault;
 * Not now drops the candidate — nothing is written either way
 * until Gary chooses. Only the origin + username are shown here;
 * the password is never in the renderer.
 */
export function SaveLoginPrompt({
  offer,
  onDone,
}: {
  offer: BrowserLoginOffer;
  onDone: () => void;
}) {
  const saveLogin = useBrowserCredentials((s) => s.saveLogin);
  const dismissOffer = useBrowserCredentials((s) => s.dismissOffer);

  const save = () => {
    saveLogin(offer.origin, offer.username);
    onDone();
  };

  const dismiss = () => {
    dismissOffer(offer.origin);
    onDone();
  };

  let host = offer.origin;
  try {
    host = new URL(offer.origin).host;
  } catch {
    host = offer.origin;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)] text-xs shrink-0">
      <KeyRound size={13} className="text-[var(--accent)] shrink-0" />
      <span className="flex-1 min-w-0 truncate text-[var(--text-primary)]">
        Save login for <span className="font-semibold">{host}</span>
        {offer.username ? ` (${offer.username})` : ''}?
      </span>
      <button
        type="button"
        onClick={save}
        className="px-2.5 py-1 rounded-md bg-[var(--accent)] font-semibold text-white shrink-0"
      >
        Save
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="px-2.5 py-1 rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] shrink-0"
      >
        Not now
      </button>
    </div>
  );
}
