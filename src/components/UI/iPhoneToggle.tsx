import { useEffect, useRef } from 'react';

interface iPhoneToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  sublabel?: string;
  accentColor?: string;
  disabled?: boolean;
}

export function iPhoneToggle({
  checked,
  onChange,
  label,
  sublabel,
  accentColor = '#9c5fff',
  disabled = false
}: iPhoneToggleProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Apply accent color via CSS variable
  useEffect(() => {
    if (inputRef.current && accentColor) {
      const parent = inputRef.current.closest('.iphone-toggle-wrapper');
      if (parent instanceof HTMLElement) {
        parent.style.setProperty('--toggle-accent', accentColor);
      }
    }
  }, [accentColor]);

  return (
    <div className="iphone-toggle-row">
      {label && (
        <div className="iphone-toggle-label">
          <span className="iphone-toggle-main">{label}</span>
          {sublabel && <span className="iphone-toggle-sub">{sublabel}</span>}
        </div>
      )}
      <div className="iphone-toggle-wrapper">
        <input
          ref={inputRef}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="iphone-toggle-track">
          <span className="iphone-toggle-thumb" />
        </span>
      </div>
    </div>
  );
}

// CSS to be added to global styles
export const iPhoneToggleStyles = `
.iphone-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  padding: 8px 0;
}

.iphone-toggle-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.iphone-toggle-main {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.iphone-toggle-sub {
  font-size: 12px;
  color: var(--text-muted);
  opacity: 0.75;
}

.iphone-toggle-wrapper {
  --toggle-accent: #9c5fff;
  position: relative;
  width: 51px;
  height: 31px;
  flex-shrink: 0;
}

.iphone-toggle-wrapper input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  margin: 0;
  z-index: 2;
}

.iphone-toggle-wrapper input:disabled {
  cursor: not-allowed;
}

.iphone-toggle-track {
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(120, 120, 134, 0.24);
  border: 1.5px solid rgba(120, 120, 134, 0.12);
  box-shadow: 
    inset 0 1px 2px rgba(0, 0, 0, 0.15),
    0 1px 3px rgba(0, 0, 0, 0.12);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.iphone-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffffff 0%, #f8f8f8 100%);
  box-shadow: 
    0 3px 8px rgba(0, 0, 0, 0.15),
    0 1px 1px rgba(0, 0, 0, 0.16),
    0 3px 1px rgba(0, 0, 0, 0.1);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Checked state */
.iphone-toggle-wrapper input:checked + .iphone-toggle-track {
  background: var(--toggle-accent);
  border-color: var(--toggle-accent);
  box-shadow: 
    inset 0 0 0 20px var(--toggle-accent),
    0 0 8px rgba(156, 95, 255, 0.35);
}

.iphone-toggle-wrapper input:checked + .iphone-toggle-track .iphone-toggle-thumb {
  transform: translateX(20px);
}

/* Focus state */
.iphone-toggle-wrapper input:focus-visible + .iphone-toggle-track {
  outline: 2px solid var(--toggle-accent);
  outline-offset: 2px;
}

/* Disabled state */
.iphone-toggle-wrapper input:disabled + .iphone-toggle-track {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Hover state */
.iphone-toggle-wrapper input:not(:disabled):hover + .iphone-toggle-track {
  filter: brightness(1.05);
}

/* Active state */
.iphone-toggle-wrapper input:not(:disabled):active + .iphone-toggle-track .iphone-toggle-thumb {
  width: 30px;
}

.iphone-toggle-wrapper input:not(:disabled):checked:active + .iphone-toggle-track .iphone-toggle-thumb {
  transform: translateX(17px);
}
`;
