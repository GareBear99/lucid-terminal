/**
 * The Compass widget — the FIRST demo widget (Gary, 2026-11-12
 * ~16:48 PST: "the first will be the compass i think is good").
 *
 * This is the EXACT compass from the demo (Gary ~16:49 PST: "the
 * exact compass from the demo but as a widget for any blueprint") —
 * the shell's own POLE / COMPASS, rendered as a Lucid-side widget
 * instead of the shell's in-canvas panel. The math is the shell's
 * (src/lib/synthCompass.ts, a port of v67 updatePoleState); the
 * display mirrors the shell's panel: a dial with the N/E/S/W poles,
 * a needle at the heading, and the shell's own compass line
 * (`hdg=…° X  lat=…°  poleOff=…`) plus pole + alignment.
 *
 * Blueprint-agnostic: it reads the direction from the widget context
 * — whatever blueprint/shell is active. Any blueprint's eye direction
 * gives a compass; a shell that reports no direction shows "No
 * heading", never a made-up one.
 */

import type {
  SynthWidgetContext,
  SynthWidgetDefinition,
} from '../../../lib/synthWidgets';
import {
  compassForDirection,
  formatCompassLine,
} from '../../../lib/synthCompass';

export const COMPASS_WIDGET_ID = 'compass';

/** Dial size, px. */
const DIAL_SIZE = 64;
const DIAL_CENTER = DIAL_SIZE / 2;
const DIAL_RADIUS = DIAL_SIZE / 2 - 4;
const NEEDLE_LEN = DIAL_RADIUS - 6;

export function CompassWidget(ctx: SynthWidgetContext) {
  const state = ctx.direction
    ? compassForDirection(ctx.direction)
    : null;
  return (
    <div
      data-testid="compass-widget"
      data-heading={state ? state.headingDeg.toFixed(1) : undefined}
      data-pole={state ? state.label : undefined}
      className="pointer-events-auto rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-[var(--text-primary)]"
      title="Compass — the demo's compass, for the active blueprint"
    >
      <div className="flex items-center gap-2">
        {/* Dial: N up, E right, S down, W left; the needle points
            at the heading (0° = N). */}
        <svg
          width={DIAL_SIZE}
          height={DIAL_SIZE}
          viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
          role="img"
          aria-label={
            state
              ? `Compass, heading ${state.headingDeg.toFixed(1)} degrees ${state.dominantCardinal}`
              : 'Compass, no heading'
          }
        >
          <circle
            cx={DIAL_CENTER}
            cy={DIAL_CENTER}
            r={DIAL_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.4"
          />
          <text
            x={DIAL_CENTER}
            y={10}
            textAnchor="middle"
            fontSize="9"
            fill="currentColor"
          >
            N
          </text>
          <text
            x={DIAL_SIZE - 4}
            y={DIAL_CENTER + 3}
            textAnchor="middle"
            fontSize="9"
            fill="currentColor"
          >
            E
          </text>
          <text
            x={DIAL_CENTER}
            y={DIAL_SIZE - 2}
            textAnchor="middle"
            fontSize="9"
            fill="currentColor"
          >
            S
          </text>
          <text
            x={4}
            y={DIAL_CENTER + 3}
            textAnchor="middle"
            fontSize="9"
            fill="currentColor"
          >
            W
          </text>
          {state && (
            <line
              x1={DIAL_CENTER}
              y1={DIAL_CENTER}
              x2={DIAL_CENTER}
              y2={DIAL_CENTER - NEEDLE_LEN}
              stroke="currentColor"
              strokeWidth="2"
              transform={`rotate(${state.headingDeg} ${DIAL_CENTER} ${DIAL_CENTER})`}
            />
          )}
          <circle
            cx={DIAL_CENTER}
            cy={DIAL_CENTER}
            r="2"
            fill="currentColor"
          />
        </svg>
        <div>
          <div className="font-semibold">Compass</div>
          {state ? (
            <>
              <div>{formatCompassLine(state)}</div>
              <div>
                pole {state.label} · {state.alignment}
              </div>
            </>
          ) : (
            <div>No heading — no direction from the active shell</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The native compass widget definition. */
export const COMPASS_WIDGET: SynthWidgetDefinition = {
  id: COMPASS_WIDGET_ID,
  name: 'Compass',
  description:
    "The demo's compass — heading, latitude and pole for the eye direction, for any blueprint.",
  native: true,
  Component: CompassWidget,
};
