/**
 * DatasetImport — JSONL import for training data (decision E).
 *
 * Gary's workflow: ChatGPT generates the training data, LLMBuilder
 * trains on it. Paste JSONL records ({"input","target"} and the other
 * schemas the trainer accepts) or a name for the dataset; the import
 * lands in ~/.lucid/llmbuilder/datasets/ via the main process and
 * comes back with a record count and the domains found — those feed
 * the capability records, so a Homunculus only ever claims what its
 * data actually covers.
 */

import { useState } from 'react';
import type { ImportDatasetResult } from '../../lib/llmbuilderApi';

interface DatasetImportProps {
  datasets: ImportDatasetResult[];
  onImport: (name: string, jsonl: string) => Promise<ImportDatasetResult | null>;
}

export function DatasetImport({ datasets, onImport }: DatasetImportProps) {
  const [name, setName] = useState('');
  const [jsonl, setJsonl] = useState('');
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleImport = async () => {
    const trimmedName = name.trim();
    const trimmedJsonl = jsonl.trim();
    if (!trimmedName || !trimmedJsonl) return;
    setImporting(true);
    setMessage(null);
    try {
      const result = await onImport(trimmedName, trimmedJsonl);
      if (result) {
        setMessage(
          `Imported ${result.recordCount} records as ${result.datasetId}.`,
        );
        setName('');
        setJsonl('');
      } else {
        setMessage('Import failed — nothing was saved.');
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
      <h3 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
        Training data
      </h3>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        Paste ChatGPT-generated JSONL — one record per line
        ({"{"}"input", "target"{"}"}). Without imported data a run trains
        on the repo text default instead.
      </p>
      <label className="mb-2 block">
        <span className="mb-1 block text-xs text-[var(--text-muted)]">
          Dataset name
        </span>
        <input
          className="w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="lucifer-v1"
          aria-label="Dataset name"
        />
      </label>
      <label className="mb-2 block">
        <span className="mb-1 block text-xs text-[var(--text-muted)]">
          JSONL records
        </span>
        <textarea
          className="w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-xs text-[var(--text-primary)]"
          rows={5}
          value={jsonl}
          onChange={(e) => setJsonl(e.target.value)}
          placeholder='{"input": "Who are you?", "target": "I am Lucifer."}'
          aria-label="JSONL records"
        />
      </label>
      <button
        type="button"
        onClick={handleImport}
        disabled={importing || !name.trim() || !jsonl.trim()}
        className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {importing ? 'Importing…' : 'Import dataset'}
      </button>
      {message && (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">{message}</p>
      )}
      {datasets.length > 0 && (
        <ul className="mt-3 space-y-1">
          {datasets.map((d) => (
            <li
              key={d.datasetId}
              className="text-xs text-[var(--text-secondary)]"
            >
              {d.datasetId} — {d.recordCount} records
              {d.domains.length > 0 ? ` — ${d.domains.join(', ')}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
