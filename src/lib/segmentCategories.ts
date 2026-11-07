/**
 * Segments categories — the categorised sections of the Segments
 * panel (Gary, 2026-11-07 ~02:50 PST): "then segments with
 * categoried sections doign the same" — the same as the Settings
 * tabs info page + voice: each category has an info explanatory
 * page and a voice that reads the EXACT words on that page.
 *
 * The info text below is the SINGLE source of truth: the panel
 * renders this exact string, and the voice mp3 for the category
 * is synthesized from this exact string. No paraphrase, no extra
 * words — the voice reads what the page says, word for word.
 * Keep the text speakable: no digits, no abbreviations, no
 * Markdown, no URLs.
 *
 * Categories reflect what the segments ARE — nothing is invented
 * here. About: the Segments add-on itself. Computer control: the
 * pre-installed, agent-only segment. Starship: whatever a
 * detected starship carries (nothing detected today). Forge: the
 * Forge ↔ Persona Plex bridge (only when Persona Plex is
 * installed).
 */

/** One categorised section of the Segments panel. */
export interface SegmentCategoryInfo {
  /** Stable id, e.g. 'computer-control' — also the mp3 file name. */
  id: string;
  /** Section heading, as shown in the panel. */
  title: string;
  /** The info explanatory text — rendered on the page AND read aloud by the voice. */
  info: string;
}

/** The categorised sections, in panel order. */
export const SEGMENT_CATEGORIES: readonly SegmentCategoryInfo[] = [
  {
    id: 'about',
    title: 'About segments',
    info: 'Segments are the pieces Lucid grows by. The Segments add-on is anchored to the Modules plugin, so there is no install step. It is just there. When a starship is detected, its segments show up here. Some segments are pre-installed and need no starship at all. Each category below has its own explanation, and each explanation has a voice button that reads it aloud.',
  },
  {
    id: 'computer-control',
    title: 'Computer control',
    info: 'Computer control is a pre-installed segment. It needs no starship, no install step, and no server. It is fully local. A trained, user-directed agent drives the Mac one verified action at a time. It is agent-only. Only a fairly advanced, heavily trained, directed agent can use it. The lock is the kill switch. When locked, every action is refused before anything runs. Every action is verified by reading the screen back afterwards. If the screen did not change, the action did not land. A timeout always frees the slot, and a watchdog force-releases a stuck action. It needs macOS Accessibility and Screen Recording to work. How the agent-only gate is enforced in code is Gary\u2019s call, and it is not decided yet.',
  },
  {
    id: 'starship',
    title: 'Starship segments',
    info: 'Starship segments appear here when a starship is detected. Right now, no starship is detected, because the detection mechanism is not wired yet. That is Gary\u2019s call. Gary builds the starship. Nothing here invents a detection mechanism, a purchase check, a store, or a license server. When Gary settles how the starship is detected, that mechanism plugs in here and nowhere else, and the segments the starship carries will show up here.',
  },
  {
    id: 'forge-persona-plex',
    title: 'Forge-to-Persona Plex segment',
    info: 'This segment is the bridge between Forge and Persona Plex. It appears only when Persona Plex is installed. Installing Persona Plex carries it with it, and removing Persona Plex hides it again. For each Homunculus in the Forge roster, it shows the persona paired to it and the voice for that pairing. The voice a persona speaks in is the voice Forge uses for its paired Homunculus. A Homunculus with no persona paired speaks in the default voice, Lily.',
  },
];

/** Find a category by id. */
export function segmentCategory(id: string): SegmentCategoryInfo | undefined {
  return SEGMENT_CATEGORIES.find((category) => category.id === id);
}

/** The voice-message audio path for a category, e.g. './segments/computer-control.mp3'. */
export function segmentVoiceSrc(categoryId: string): string {
  return `./segments/${categoryId}.mp3`;
}
