/**
 * Plugin voice messages (Gary, 2026-11-07 ~02:54 PST): plugins
 * should have voice recordings all throughout — every plugin, on
 * every page/view, explaining what you are looking at. Each message
 * is synthesized in Lily's voice and saved as an mp3 under
 * public/plugins/, named after the plugin page, e.g.
 * './plugins/synth-main.mp3'. The voice button on the plugin's
 * page plays it — never auto-play.
 *
 * Same pattern as the add-on voices (src/lib/addonVoice.ts) and
 * the Forge voices (public/forge/*.mp3).
 */

/** The voice-message audio path for a plugin page, e.g. './plugins/synth-main.mp3'. */
export function pluginVoiceSrc(voiceId: string): string {
  return `./plugins/${voiceId}.mp3`;
}
