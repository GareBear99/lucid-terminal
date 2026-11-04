import { useEffect, useRef, useState } from 'react';
import { Loader } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';
import { useLoadingStore } from '../../stores/loadingStore';
import { MODEL_TIERS } from '../../data/tiers';

interface ModelMissingBannerProps {
  /** "Not now" — dismiss for this session only. The banner comes back
   *  on the next launch while no model is installed. */
  onDismiss: () => void;
  /** Called after a successful install, so the parent re-checks whether
   *  a model is installed now and hides the banner. */
  onInstalled: () => void;
  /** Open Help on the Model Tiers section (the "?" click target). */
  onShowTiers: () => void;
}

/**
 * Startup disclaimer: no local model is installed.
 *
 * Shown once per launch while no model file is installed anywhere
 * (~/.lucid/models or LUCID-BACKEND/models). A local model is needed to
 * run command passes (and AI chat), and a small model (up to Tier 2) is
 * also required for access to LuciferAI's capabilities, which are
 * integral to neural growth — in the short term and the long term. The
 * banner offers to install the bundled TinyLlama. Dismissing hides it
 * for this session only — it comes back on the next launch until a model
 * is installed.
 *
 * The small "?" next to the offer explains the model tiers on hover and
 * opens Help › Model Tiers on click. It is a helper, not a headline:
 * quiet, inline, and it never covers the Install / Not now buttons.
 */
export function ModelMissingBanner({ onDismiss, onInstalled, onShowTiers }: ModelMissingBannerProps) {
  const [installing, setInstalling] = useState(false);
  const [progressLine, setProgressLine] = useState('');
  const [installError, setInstallError] = useState<string | null>(null);
  const [tiersOpen, setTiersOpen] = useState(false);
  const tiersRef = useRef<HTMLSpanElement | null>(null);
  const { success: toastSuccess, error: toastError } = useToastStore();

  // Click-away (and Escape) dismiss the tiers overlay. No fullscreen
  // backdrop: one would sit over the Install / Not now buttons while the
  // overlay is open. A document listener closes the overlay when the
  // click lands outside the "?" wrapper instead.
  useEffect(() => {
    if (!tiersOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (tiersRef.current && !tiersRef.current.contains(e.target as Node)) {
        setTiersOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTiersOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [tiersOpen]);

  const installTinyLlama = async () => {
    if (installing) return;
    setInstalling(true);
    // A model install is real background loading — the top-left dot
    // swirls for the whole ~3.5 min download.
    useLoadingStore.getState().start('model-install');
    setInstallError(null);
    setProgressLine('Starting installer…');
    const unsubscribe = window.lucidAPI.lucid.onInstallTinyLlamaProgress((line) => {
      setProgressLine(line);
    });
    try {
      const result = await window.lucidAPI.lucid.installTinyLlama();
      if (result.success) {
        toastSuccess('TinyLlama installed — command passes and AI chat can now use the local model.');
        onInstalled();
      } else {
        const reason = result.error ?? 'Install failed for an unknown reason.';
        setInstallError(reason);
        toastError(`TinyLlama install failed: ${reason}`);
      }
    } catch (error: any) {
      const reason = error?.message ?? String(error);
      setInstallError(reason);
      toastError(`TinyLlama install failed: ${reason}`);
    } finally {
      unsubscribe();
      setInstalling(false);
      useLoadingStore.getState().finish('model-install');
      setProgressLine('');
    }
  };

  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2 bg-[#79c0ff]/10 border-b border-[#79c0ff]/40 text-[#c8e1ff] text-xs">
      <div className="min-w-0">
        <p>
          <span className="font-semibold">No local model installed</span>
          {' — Lucid needs one to run command passes (and AI chat). '}
          A small model (up to Tier 2) is also required for access to LuciferAI&rsquo;s capabilities, which are integral to neural growth &mdash; in the short term and the long term.{' '}
          Install TinyLlama (Tier 1){' '}
          <span
            ref={tiersRef}
            className="relative inline-block"
            onMouseEnter={() => setTiersOpen(true)}
            onMouseLeave={() => setTiersOpen(false)}
          >
            <button
              type="button"
              aria-label="What are the model tiers?"
              title="What are the model tiers?"
              onClick={() => {
                setTiersOpen(false);
                onShowTiers();
              }}
              className="inline-flex items-center justify-center w-4 h-4 -translate-y-px rounded-full border border-[#79c0ff]/60 text-[#79c0ff] text-[10px] leading-none hover:bg-[#79c0ff]/20 cursor-help align-middle"
            >
              ?
            </button>
            {tiersOpen && (
              <span className="absolute left-0 top-full mt-2 z-50 w-[430px] max-w-[90vw] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-left shadow-2xl normal-case">
                <span className="block text-[13px] font-semibold text-[var(--text-primary)] mb-2">
                  Model tiers (0–5)
                </span>
                {MODEL_TIERS.map((t) => (
                  <span key={t.tier} className="block text-xs text-[var(--text-secondary)] leading-relaxed mb-1.5">
                    <span className="font-mono font-semibold text-[var(--text-primary)]">
                      Tier {t.tier} — {t.name}:
                    </span>{' '}
                    {t.line}
                  </span>
                ))}
                <span className="block text-[11px] text-[var(--text-muted)] mt-2">
                  Click ? to open the full list in Help › Model Tiers.
                </span>
              </span>
            )}
          </span>{' '}
          — the bundled model, about 700 MB.
        </p>
        {installing && (
          <p className="mt-1 text-[var(--text-muted)]">
            Installing TinyLlama… (downloads about 700 MB — this can take a few minutes)
            {progressLine && (
              <span className="block font-mono truncate" title={progressLine}>
                {progressLine}
              </span>
            )}
          </p>
        )}
        {installError && (
          <p className="mt-1 text-red-300">
            Install failed: {installError}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={installTinyLlama}
          disabled={installing}
          className="btn btn-primary text-xs px-3 py-1 flex items-center gap-1.5 disabled:opacity-60"
        >
          {installing ? (
            <>
              <Loader size={12} className="animate-spin" />
              Installing…
            </>
          ) : installError ? (
            'Retry install'
          ) : (
            'Install TinyLlama'
          )}
        </button>
        <button
          onClick={onDismiss}
          disabled={installing}
          className="rounded px-2 py-1 hover:bg-white/10 disabled:opacity-60"
          title="Dismiss for this session"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
