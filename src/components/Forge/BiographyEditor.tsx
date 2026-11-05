/**
 * BiographyEditor — set or edit a Homunculus's biography.
 *
 * Name, character (what kind of being it is), vibe (how it comes
 * across), and persona (how it thinks and talks). The biography is
 * Gary's (or the Homunculus's) own words — nothing here is
 * auto-generated, and leaving character, vibe, and persona all blank
 * saves NO biography (null), so an unwritten biography stays honestly
 * unwritten instead of becoming a placeholder.
 */

import { useState } from 'react';
import type { HomunculusBiography } from '../../lib/homunculi';

interface BiographyEditorProps {
  /** Current name (empty for a new Homunculus). */
  name: string;
  /** Current biography, or null when none is written yet. */
  biography: HomunculusBiography | null;
  onSave: (name: string, biography: HomunculusBiography | null) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]';
const labelClass = 'mb-1 block text-xs text-[var(--text-muted)]';

export function BiographyEditor({
  name: initialName,
  biography,
  onSave,
  onCancel,
}: BiographyEditorProps) {
  const [name, setName] = useState(initialName);
  const [character, setCharacter] = useState(biography?.character ?? '');
  const [vibe, setVibe] = useState(biography?.vibe ?? '');
  const [persona, setPersona] = useState(biography?.persona ?? '');

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const next: HomunculusBiography | null =
      character.trim() || vibe.trim() || persona.trim()
        ? {
            character: character.trim(),
            vibe: vibe.trim(),
            persona: persona.trim(),
          }
        : null;
    onSave(trimmedName, next);
  };

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Biography
      </h3>
      <div className="space-y-3">
        <label className="block">
          <span className={labelClass}>Name</span>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lucifer"
            aria-label="Name"
          />
        </label>
        <label className="block">
          <span className={labelClass}>
            Character — what kind of being is it?
          </span>
          <textarea
            className={inputClass}
            rows={2}
            value={character}
            onChange={(e) => setCharacter(e.target.value)}
            placeholder="Part siren, part magic succubus"
            aria-label="Character"
          />
        </label>
        <label className="block">
          <span className={labelClass}>Vibe — how does it come across?</span>
          <input
            className={inputClass}
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            placeholder="Sharp, warm, playful"
            aria-label="Vibe"
          />
        </label>
        <label className="block">
          <span className={labelClass}>
            Persona — how does it think and talk?
          </span>
          <textarea
            className={inputClass}
            rows={3}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="Direct, practical, shows the work"
            aria-label="Persona"
          />
        </label>
        <p className="text-xs text-[var(--text-muted)]">
          In its own words — nothing here is written for it. Leave
          character, vibe, and persona blank and no biography is saved.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            Save biography
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-secondary)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
