import { BLOOD_COLOR } from '../Synth/blood';

interface BloodDropIconProps {
  /** Icon size in px (lucide-compatible). Default 20, the toolbar size. */
  size?: number | string;
  className?: string;
}

/**
 * Blood drop icon — the LuciferAI toolbar icon (Gary, 2026-11-06).
 *
 * A filled droplet in the face's blood colour (BLOOD_COLOR, #a4161a
 * — the same dark blood red as the blood that drips from the
 * Sentinel's fangs while LuciferAI is running, src/components/Synth/
 * blood.ts), with a small highlight so it reads as liquid, not flat.
 *
 * Shown ONLY when LuciferAI is enabled. The toolbar button is
 * filtered out entirely while the plugin is disabled (Sidebar), so
 * the drop is never visible in the disabled state — matching the
 * disable rule (src/lib/luciferAi.ts): when LuciferAI is off it is
 * COMPLETELY gone, no trace anywhere, not even a grey dot.
 */
export function BloodDropIcon({ size = 20, className }: BloodDropIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"
        fill={BLOOD_COLOR}
      />
      <ellipse
        cx="9.5"
        cy="14.5"
        rx="1.5"
        ry="2.4"
        fill="#ffffff"
        opacity="0.28"
        transform="rotate(-18 9.5 14.5)"
      />
    </svg>
  );
}
