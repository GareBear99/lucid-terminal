/**
 * YOUR widgets live here — the custom-widget extension point (Gary,
 * 2026-11-12 ~16:48 PST: "a way to add your own custom widgets that
 * dont come natively").
 *
 * To add your own widget:
 *   1. Write a component that takes SynthWidgetContext (copy
 *      SeedWidget.tsx — it is the worked example).
 *   2. Export a definition: {id, name, description, Component}
 *      with a kebab-case id that no other widget uses.
 *   3. Import the definition here and call registerSynthWidget(def).
 *
 * The layer imports this file, so anything registered here appears in
 * the synth view (once the widget gate is met — a permanent creation
 * build has started). Custom widgets are data + render only: they
 * receive the widget context and render from it; they never touch the
 * stores or the shell iframe directly.
 *
 * Alternatives considered, not built: auto-discovery via
 * import.meta.glob over a widgets/custom/ folder (implicit — a stray
 * file would silently become a widget), and a settings-driven list of
 * enabled widget ids (a per-widget on/off toggle — a follow-up, not
 * the registration mechanism). This file is explicit: a widget shows
 * up because someone registered it here, by name.
 */

import { registerSynthWidget } from '../../../lib/synthWidgets';
import { SEED_WIDGET } from './SeedWidget';

// Example custom widget (not native): the seed card. Replace or
// extend with your own registrations below.
registerSynthWidget(SEED_WIDGET);
