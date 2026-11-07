/**
 * Modules — the anchor plugin.
 *
 * Modules is an ANCHORED plugin (Gary, 2026-11-06): built in, always
 * present, no install step, no toolbar button. Its tab lives in the
 * Settings. It is the container for Segments — the starship's
 * segments appear in the Modules tab when a starship is detected
 * (see src/lib/starshipDetection.ts).
 *
 * The anchor is what other pieces hang off: Segments (the segments
 * add-on) is an add-on OF Modules, anchor-installed with it — see
 * src/data/pluginAddons.ts. Its installed state derives from this
 * anchor, not from a user install, and it has no install action.
 *
 * This file is the one place the anchor's identity lives: the plugin
 * id, the display name, and the icon. The Settings Plugins tab lists
 * it as a built-in anchored row; the Modules tab is where it lives.
 * (Parallel to src/data/devices.ts, which holds the Devices anchor.)
 */

import { Boxes } from 'lucide-react';
import type { AnchoredPlugin } from './devices';

export const MODULES_PLUGIN: AnchoredPlugin = {
  id: 'modules',
  name: 'Modules',
  description:
    'Container for Segments — the starship\u2019s segments appear in the Modules tab when a starship is detected.',
  icon: Boxes,
};
