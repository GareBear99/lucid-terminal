/**
 * LuciferAI tab panel — what the blood drop tab shows (Gary, 2026-11-07).
 *
 * The blood drop tab IS the LuciferAI tab: one tab in the terminal
 * tab strip, and this panel is what it opens — the LuciferAI prompt
 * command surface (the Help command reference), rendered inline as a
 * panel. NOT a modal overlay, NO splash screen: it is just the plugin.
 * The terminal stays a real, regular, usable terminal (plain shell);
 * LuciferAI's commands live here, behind the drop, never typed into
 * the terminal.
 *
 * The content is the shared HelpContent browser (also used by the Help
 * modal the toolbar blood drop opens) — same categories, same search,
 * same command cards. The tab passes no onClose: a tab is left by
 * picking another tab, never closed.
 */
import { BloodDropIcon } from '../Layout/BloodDropIcon';
import { HelpContent } from './HelpModal';

export function LuciferAITabPanel() {
  return (
    <div className="h-full flex flex-col" data-testid="lucifer-ai-tab-panel">
      <HelpContent title="LuciferAI" titleIcon={<BloodDropIcon size={20} />} />
    </div>
  );
}

export default LuciferAITabPanel;
