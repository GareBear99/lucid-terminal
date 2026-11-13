/**
 * The Seed card — the EXAMPLE custom widget (not native). It exists to
 * demonstrate the custom-widget extension point: a widget that does
 * not come with Lucid, written the way a user would write one, and
 * registered from customWidgets.ts. It shows the active shell's seed,
 * blueprint, tile and eye mode — a readout, nothing more. The seed
 * is the SESSION's loaded creation (ctx.seedHex) — null when nothing
 * is loaded in this session, and the card says so instead of showing
 * a seed: the store's default seed IS the owner's creation seed, so
 * rendering it for a session with nothing loaded would leak it
 * (guest leak, 2026-11-12 ~20:15 PST).
 *
 * To add your own: copy this file, give your widget a kebab-case id
 * and a component that takes SynthWidgetContext, export a definition
 * like SEED_WIDGET below, and register it in customWidgets.ts.
 */

import type {
  SynthWidgetContext,
  SynthWidgetDefinition,
} from '../../../lib/synthWidgets';

export function SeedWidget(ctx: SynthWidgetContext) {
  return (
    <div
      data-testid="seed-widget"
      className="pointer-events-auto rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-[var(--text-primary)]"
      title="Seed card — an example custom widget"
    >
      <div className="font-semibold">Seed card</div>
      <div>
        seed:{' '}
        {ctx.seedHex ?? 'no creation loaded'}
      </div>
      <div>shell: {ctx.shellId ?? 'none loaded'}</div>
      <div>
        tile: {ctx.selectedTileId} · eye: {ctx.eyeMode}
      </div>
    </div>
  );
}

/**
 * The example custom widget definition. Note: no `native` field —
 * registerSynthWidget always stores custom widgets as native: false.
 */
export const SEED_WIDGET: Omit<SynthWidgetDefinition, 'native'> = {
  id: 'seed-card',
  name: 'Seed card',
  description:
    'Example custom widget — the active shell seed, blueprint, tile and eye mode.',
  Component: SeedWidget,
};
