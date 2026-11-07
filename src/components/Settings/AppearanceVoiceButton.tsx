import { PluginVoiceButton } from '../PluginVoiceButton';
import { settingsVoiceSrc } from '../../lib/settingsVoice';

/**
 * Play button for the Appearance tab's flagship voice explanation
 * (Gary, 2026-11-07 ~05:38 PST): Appearance gets one flagship
 * voice recording, like Devices has — a single main explanation
 * of what Appearance is (theme + font, how Lucid looks), and how
 * it differs from Customization (behaviour and display, not looks).
 *
 * Wiring (one line in the Appearance tab, SettingsPanel.tsx):
 *   import { AppearanceVoiceButton } from './AppearanceVoiceButton';
 *   <AppearanceVoiceButton />
 * placed in the Appearance tab header, next to "Theme".
 * Kept as its own component so the Appearance tab wires it with a
 * single import — the button itself lives here, not in the panel.
 */
export function AppearanceVoiceButton() {
  return (
    <PluginVoiceButton
      voiceId="appearance-explanation"
      title="Appearance"
      src={settingsVoiceSrc('appearance-explanation')}
    />
  );
}
