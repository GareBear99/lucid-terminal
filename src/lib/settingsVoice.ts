/**
 * Settings voice messages (Gary, 2026-11-07 ~05:38 PST): the
 * Appearance and Customization tabs each get one flagship voice
 * recording, like the Devices flagship — a single main explanation
 * of what the tab is, and how it differs from the other one.
 * Each message is synthesized in Lily's voice and saved as an mp3
 * under public/settings/, e.g.
 * './settings/appearance-explanation.mp3'. The voice button on
 * the tab plays it — never auto-play.
 *
 * Same pattern as the plugin voices (src/lib/pluginVoice.ts) and
 * the Permissions voice
 * (public/settings/permissions-explanation.mp3).
 */

/** The voice-message audio path for a Settings tab, e.g. './settings/appearance-explanation.mp3'. */
export function settingsVoiceSrc(voiceId: string): string {
  return `./settings/${voiceId}.mp3`;
}
