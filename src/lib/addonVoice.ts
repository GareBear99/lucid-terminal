/**
 * Add-on voice messages (Gary, 2026-11-06): every add-on has a
 * short spoken message, like the Forge does (public/forge/*.mp3).
 * Each message is synthesized in Lily's voice and saved as an mp3
 * under public/addons/, named after the add-on id. The Add-ons
 * list in Settings > Plugins plays the message when the user
 * clicks the speaker button next to the add-on — never auto-play.
 */

/** The voice-message audio path for an add-on, e.g. './addons/persona-plex.mp3'. */
export function addonVoiceSrc(addonId: string): string {
  return `./addons/${addonId}.mp3`;
}
