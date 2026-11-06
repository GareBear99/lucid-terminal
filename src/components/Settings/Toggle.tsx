/**
 * Toggle — the one shared iPhone-style switch for Settings.
 *
 * Gary (2026-11-05): "change them all to clean iphone style toggles
 * unless you have a better unique design for us". Every toggle in
 * Settings is this component — no inline `<input type="checkbox">`
 * anywhere in SettingsPanel (the one exception is the Ping Server
 * enable checkbox, which lives inside the uncommitted ping section
 * and stays an inline checkbox until that section lands).
 *
 * Geometry is the iPhone switch: 51×31 track, 27px knob, smooth
 * 200ms slide, unambiguous on/off. The ON state uses Lucid's own
 * accent — the shared `.lucid-color-shift` iridescent gradient
 * (violet → blue → teal, the same gradient as the accent lines and
 * wordmarks) — not iOS green, so the switch reads as Lucid. OFF is
 * a flat grey track. The gradient is vivid against the grey, so the
 * state reads clearly without green.
 *
 * A real <button role="switch">, not a checkbox: keyboard-activatable
 * (Enter/Space, native button behaviour), aria-checked for screen
 * readers, and disabled support for rows that cannot be toggled right
 * now (e.g. the Synth / AI Chat toolbar toggles while LuciferAI is
 * disabled). Call sites keep their <label> wrapper, so clicking the
 * row text still flips the switch — the button is a labelable element.
 */
interface ToggleProps {
  /** Current state. */
  checked: boolean;
  /** Called with the flipped value. */
  onChange: (checked: boolean) => void;
  /** Accessible name when the Toggle is not inside a <label> with
   *  visible text. Omit it when the label text already names it. */
  ariaLabel?: string;
  /** When true the switch cannot be flipped (greyed out). */
  disabled?: boolean;
  /** Tooltip on hover. */
  title?: string;
}

export function Toggle({ checked, onChange, ariaLabel, disabled = false, title }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full',
        'transition-colors duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        // ON: Lucid's iridescent accent gradient. OFF: flat grey.
        checked ? 'lucid-color-shift' : 'bg-[var(--bg-tertiary)]',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'inline-block h-[27px] w-[27px] rounded-full bg-white shadow-md',
          'transition-transform duration-200 ease-in-out',
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
        ].join(' ')}
      />
    </button>
  );
}
