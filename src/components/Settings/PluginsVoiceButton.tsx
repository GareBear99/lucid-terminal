import { PluginVoiceButton } from '../PluginVoiceButton';
import { pluginVoiceSrc } from '../../lib/pluginVoice';

/**
 * Play button for the Plugins tab's flagship voice explanation
 * (Gary, 2026-11-07 ~05:38 PST): Plugins needs one flagship voice
 * recording too, like Devices has — a single main explanation of
 * what plugins are, what lives on this page, and how installing
 * works.
 *
 * Wiring (one line in the Plugins tab, SettingsPanel.tsx):
 *   import { PluginsVoiceButton } from './PluginsVoiceButton';
 *   <PluginsVoiceButton />
 * placed in the Plugins tab header, next to "Core plugins".
 * Kept as its own component so the Plugins tab wires it with a
 * single import — the button itself lives here, not in the panel.
 */
export function PluginsVoiceButton() {
  return (
    <PluginVoiceButton
      voiceId="plugins-explanation"
      title="Plugins"
      src={pluginVoiceSrc('plugins-explanation')}
    />
  );
}
