/**
 * Devices — the anchor plugin.
 *
 * Devices is an ANCHORED plugin: built in, always present, no
 * install step, no toolbar button. It detects connected devices
 * (USB, Android, this Mac) and nothing else — detection only, it
 * never controls or communicates with a device.
 *
 * The anchor is what other pieces hang off: Android Connect (the
 * android-emulator add-on) is an add-on OF Devices, anchor-installed
 * with it — see src/data/pluginAddons.ts. Its installed state
 * derives from this anchor, not from a user install.
 *
 * This file is the one place the anchor's identity lives: the
 * plugin id, the display name, and the icon. The Settings Plugins
 * tab lists it as a built-in anchored row; the Devices tab is where
 * it lives.
 */

import { Usb, type LucideIcon } from 'lucide-react';

export interface AnchoredPlugin {
  /** Stable id, e.g. 'devices'. Used as the Settings tab id and as
   * the add-on anchor id. */
  id: string;
  /** Display name, e.g. 'Devices'. */
  name: string;
  /** One short line for the Settings lists. */
  description: string;
  /** Icon for the Settings tab and the plugin rows. */
  icon: LucideIcon;
}

export const DEVICES_PLUGIN: AnchoredPlugin = {
  id: 'devices',
  name: 'Devices',
  description:
    'Detect connected devices — USB, Android, and this Mac. Detection only; it never controls a device.',
  icon: Usb,
};
