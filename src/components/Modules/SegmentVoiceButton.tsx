import { useRef, useState } from 'react';
import { Pause, Volume2 } from 'lucide-react';

interface SegmentVoiceButtonProps {
  /** Category id, e.g. 'computer-control' — for the data attribute. */
  categoryId: string;
  /** Category title, for the button label. */
  categoryTitle: string;
  /** The mp3 path, e.g. './segments/computer-control.mp3'. */
  src: string;
}

/**
 * Play button for a Segments category's voice explanation (Gary,
 * 2026-11-07 ~02:50 PST): each categorised section has an info
 * explanatory page and a voice that reads the EXACT words on that
 * page. Same pattern as AddonVoiceButton: a small speaker icon,
 * click to play, click again to pause, never auto-plays. The Audio
 * element is created lazily on the first click, so this renders
 * safely under SSR (no Audio at render).
 */
export function SegmentVoiceButton({ categoryId, categoryTitle, src }: SegmentVoiceButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) {
      const audio = new Audio(src);
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
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        data-segment-voice={categoryId}
        onClick={toggle}
        className="btn btn-secondary text-xs shrink-0"
        title={`Listen: ${categoryTitle} explanation`}
        aria-label={playing ? `Pause ${categoryTitle} explanation` : `Play ${categoryTitle} explanation`}
      >
        {playing ? <Pause size={14} /> : <Volume2 size={14} />}
      </button>
      <span className="text-xs text-[var(--text-muted)]">Listen</span>
    </span>
  );
}
