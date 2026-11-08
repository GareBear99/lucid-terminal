/**
 * Speak — read text aloud, locally (Gary, 2026-11-06).
 *
 * The AI chat "Speak" option reads a message aloud with the Web
 * Speech API (window.speechSynthesis) — built into Chromium /
 * Electron, on-device, no server, no network, no port. The voice is
 * the active persona's voice (see src/lib/personaPlex.ts
 * getActivePersonaVoice + resolveSpeakVoice): the stored voice name
 * is matched to an available system voice, and when nothing matches
 * the system default voice speaks.
 *
 * Guards everywhere — speechSynthesis is absent under SSR and in
 * tests, and getVoices() can be empty until voices load, so every
 * function degrades to "no speech" instead of throwing. Call
 * waitForSpeakVoices() before speaking a persona's voice, so the
 * match is made against the real voice list instead of the
 * still-empty one (speaking too early silently fell back to the
 * system default for every persona — the old bad take).
 */

import { resolveSpeakVoice } from './personaPlex';

/** Whether this environment can speak at all. */
export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

/** The available speech-synthesis voice names on this machine.
 *  Empty when speech is unsupported or no voices have loaded yet
 *  (voices load async — listen for 'voiceschanged'). */
export function getAvailableSpeakVoices(): string[] {
  if (!isSpeechSupported()) return [];
  try {
    return window.speechSynthesis
      .getVoices()
      .map((v) => v.name)
      .filter((n) => n.length > 0);
  } catch {
    return [];
  }
}

/**
 * Read text aloud in the given voice (a stored voice name — the
 * active persona's voice). Volume (0-1) and rate (0.5-2) come from
 * the persona's voice settings. Returns true when speech started,
 * false when it could not (unsupported, empty text, or an error).
 * Any speech already in progress is cancelled first, so Speak
 * always reads the message you just asked for.
 */
export function speakText(
  text: string,
  voiceName: string,
  options?: { volume?: number; rate?: number; onEnd?: () => void },
): boolean {
  const clean = text.trim();
  if (!clean || !isSpeechSupported()) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(clean);
    const available = window.speechSynthesis.getVoices();
    const matchedName = resolveSpeakVoice(
      voiceName,
      available.map((v) => v.name),
    );
    if (matchedName) {
      const voice = available.find((v) => v.name === matchedName);
      if (voice) utterance.voice = voice;
    }
    if (typeof options?.volume === 'number' && Number.isFinite(options.volume)) {
      utterance.volume = Math.min(1, Math.max(0, options.volume));
    }
    if (typeof options?.rate === 'number' && Number.isFinite(options.rate)) {
      utterance.rate = Math.min(2, Math.max(0.5, options.rate));
    }
    // onEnd fires when the utterance finishes (or errors) — the
    // Hear-voice preview uses it to clear its playing state.
    if (typeof options?.onEnd === 'function') {
      utterance.onend = () => options.onEnd?.();
      utterance.onerror = () => options.onEnd?.();
    }
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/** Whether speech is in progress right now. */
export function isSpeaking(): boolean {
  if (!isSpeechSupported()) return false;
  try {
    return window.speechSynthesis.speaking;
  } catch {
    return false;
  }
}

/**
 * Wait until the system voices have loaded (or the timeout
 * passes). getVoices() is empty until the voices arrive — speaking
 * before that silently falls back to the system default even when
 * the persona's voice exists. Call this before speaking a
 * persona's voice (the Hear-voice preview does), so the voice
 * match is made against the real list. Resolves immediately when
 * voices are already there, and with whatever is there (possibly
 * empty) on timeout — never hangs, never throws.
 */
export function waitForSpeakVoices(timeoutMs = 2000): Promise<string[]> {
  const current = getAvailableSpeakVoices();
  if (current.length > 0) return Promise.resolve(current);
  if (!isSpeechSupported()) return Promise.resolve([]);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        window.speechSynthesis.removeEventListener(
          'voiceschanged',
          finish,
        );
      } catch {
        // Listener already gone — nothing to do.
      }
      resolve(getAvailableSpeakVoices());
    };
    try {
      window.speechSynthesis.addEventListener('voiceschanged', finish);
    } catch {
      // No listener support — fall through to the timeout.
    }
    setTimeout(finish, Math.max(0, timeoutMs));
  });
}
export function stopSpeaking(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Speech already stopped — nothing to do.
  }
}
