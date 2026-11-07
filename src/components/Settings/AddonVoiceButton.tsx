import { useRef, useState } from 'react';
import { Pause, Volume2 } from 'lucide-react';
import { addonVoiceSrc } from '../../lib/addonVoice';

interface AddonVoiceButtonProps {
  /** Add-on id, e.g. 'persona-plex' — selects the mp3. */
  addonId: string;
  /** Add-on display name, for the button label. */
  addonName: string;
}

/**
 * Play button for an add-on's voice message (Gary, 2026-11-06).
 * A small speaker icon next to the add-on in Settings > Plugins >
 * Add-ons. Click to play the message, click again to pause. Never
 * auto-plays. The Audio element is created lazily on the first
 * click, so this renders safely under SSR (no Audio at render).
 */
export function AddonVoiceButton({ addonId, addonName }: AddonVoiceButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) {
      const audio = new Audio(addonVoiceSrc(addonId));
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
    <button
      type="button"
      data-addon-voice={addonId}
      onClick={toggle}
      className="btn btn-secondary text-xs shrink-0"
      title={`Listen: ${addonName} voice message`}
      aria-label={playing ? `Pause ${addonName} voice message` : `Play ${addonName} voice message`}
    >
      {playing ? <Pause size={14} /> : <Volume2 size={14} />}
    </button>
  );
}
