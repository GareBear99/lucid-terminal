import { useRef, useState } from 'react';
import { Pause, Volume2 } from 'lucide-react';
import {
  SP_INFO_SECTIONS,
  SP_INFO_VOICE_SRC,
} from '../../lib/sovereignPoints';

/**
 * Sovereign Points (SP) — the info section on the Help (info) page
 * (Gary, 2026-11-08 ~07:20 PST): "this needs to be in info page
 * heavily well explained and voice audio for it."
 *
 * Renders the canonical SP explanation verbatim (sovereignPoints.ts)
 * — the whole system, numbers front and center — with a voice
 * button that reads the exact words on the page. Same voice pattern
 * as the segment voice buttons: a small speaker icon, click to
 * play, click again to pause, never auto-plays. The Audio element
 * is created lazily on the first click, so this renders safely
 * under SSR (no Audio at render).
 *
 * Shown at the top of the Help page (HelpContent grid view) in both
 * the Help modal and the blood-drop tab — the two surfaces share
 * the same content.
 */
export function SovereignPointsInfo() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) {
      const audio = new Audio(SP_INFO_VOICE_SRC);
      audio.onended = () => setPlaying(false);
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  };

  return (
    <section
      data-testid="sovereign-points-info"
      className="mb-6 rounded-lg bg-[var(--bg-primary)]/60 backdrop-blur-md border border-[var(--border)] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Sovereign Points (SP)
          </h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]" style={{ lineHeight: 1.5 }}>
            Your budget for talking to the ping server, explained in full.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-sp-voice="sovereign-points"
            onClick={toggle}
            className="btn btn-secondary text-xs shrink-0"
            title="Listen: Sovereign Points explanation"
            aria-label={playing ? 'Pause Sovereign Points explanation' : 'Play Sovereign Points explanation'}
          >
            {playing ? <Pause size={14} /> : <Volume2 size={14} />}
          </button>
          <span className="text-xs text-[var(--text-muted)]">Listen</span>
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {SP_INFO_SECTIONS.map((section) => (
          <div key={section.heading}>
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
              {section.heading}
            </h4>
            {section.paragraphs.map((paragraph, idx) => (
              <p
                key={idx}
                className="mt-2 text-sm text-[var(--text-secondary)]"
                style={{ lineHeight: 1.5 }}
              >
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
