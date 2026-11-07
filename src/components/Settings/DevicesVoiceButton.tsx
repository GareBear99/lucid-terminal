import { PluginVoiceButton } from '../PluginVoiceButton';
import { pluginVoiceSrc } from '../../lib/pluginVoice';

/**
 * Play button for the Devices plugin's flagship voice explanation
 * (Gary, 2026-11-07 ~02:54 PST): Devices gets one good one — a
 * single main explanation of what Devices is, what it does, and
 * how to use it.
 *
 * Wiring (one line in the Devices tab, SettingsPanel.tsx):
 *   import { DevicesVoiceButton } from './DevicesVoiceButton';
 *   <DevicesVoiceButton />
 * placed in the Devices tab header, next to "Detected devices".
 * Kept as its own component so the Devices tab wires it with a
 * single import — the button itself lives here, not in the panel.
 */
export function DevicesVoiceButton() {
  return (
    <PluginVoiceButton
      voiceId="devices-explanation"
      title="Devices"
      src={pluginVoiceSrc('devices-explanation')}
    />
  );
}
