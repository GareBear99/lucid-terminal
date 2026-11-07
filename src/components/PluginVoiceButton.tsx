import { useRef, useState } from 'react';
import { Pause, Volume2 } from 'lucide-react';

interface PluginVoiceButtonProps {
  /** Voice id, e.g. 'synth-main' — for the data attribute. */
  voiceId: string;
  /** Plugin/page title, for the button label. */
  title: string;
  /** The mp3 path, e.g. './plugins/synth-main.mp3'. */
  src: string;
}

/**
 * Play button for a plugin page's voice explanation (Gary,
 * 2026-11-07 ~02:54 PST): plugins have voice recordings all
 * throughout, explaining what you are looking at on the page.
 * Same pattern as AddonVoiceButton / SegmentVoiceButton: a small
 * speaker icon, click to play, click again to pause, never
 * auto-plays. The Audio element is created lazily on the first
 * click, so this renders safely under SSR (no Audio at render).
 */
export function PluginVoiceButton({ voiceId, title, src }: PluginVoiceButtonProps) {
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
        data-plugin-voice={voiceId}
        onClick={toggle}
        className="btn btn-secondary text-xs shrink-0"
        title={`Listen: ${title} explanation`}
        aria-label={playing ? `Pause ${title} explanation` : `Play ${title} explanation`}
      >
        {playing ? <Pause size={14} /> : <Volume2 size={14} />}
      </button>
      <span className="text-xs text-[var(--text-muted)]">Listen</span>
    </span>
  );
}
