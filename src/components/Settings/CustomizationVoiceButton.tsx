import { PluginVoiceButton } from '../PluginVoiceButton';
import { settingsVoiceSrc } from '../../lib/settingsVoice';

/**
 * Play button for the Customization tab's flagship voice
 * explanation (Gary, 2026-11-07 ~05:38 PST): Customization gets
 * one flagship voice recording, like Devices has — a single main
 * explanation of what Customization is (how Lucid behaves and
 * what it shows), and how it differs from Appearance (theme +
 * font, how Lucid looks, not behaviour).
 *
 * Wiring (one line in the Customization tab, SettingsPanel.tsx):
 *   import { CustomizationVoiceButton } from './CustomizationVoiceButton';
 *   <CustomizationVoiceButton />
 * placed in the Customization tab header, next to
 * "Processing Animation".
 * Kept as its own component so the Customization tab wires it with
 * a single import — the button itself lives here, not in the panel.
 */
export function CustomizationVoiceButton() {
  return (
    <PluginVoiceButton
      voiceId="customization-explanation"
      title="Customization"
      src={settingsVoiceSrc('customization-explanation')}
    />
  );
}
