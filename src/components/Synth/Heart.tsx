/**
 * Heart — the flaming heart, standalone.
 *
 * The heart shape, kept separate from any avatar. Fixed magenta palette,
 * no customization props. Parked for later: Gary (2026-11-04) will use
 * it to "like" comments in chat, like a reaction. Not wired into any UI
 * yet — this file just preserves the piece.
 *
 * Pure presentational component — no IPC, no store access.
 */

export function Heart({ size = 28 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="Heart"
    >
      <g transform="translate(-44,-3)">
        <path
          d="M60,26 c-6,-6 -16,1 -11,9 c3,5 11,8 11,8 c0,0 8,-3 11,-8 c5,-8 -5,-15 -11,-9"
          fill="#d7a0ff"
        />
        <path
          d="M60,14 c3,-4 1,-8 -2,-10 c0,4 -3,5 -2,9 c1,3 3,3 4,1"
          fill="#d7a0ff"
          fillOpacity="0.7"
        />
      </g>
    </svg>
  );
}
