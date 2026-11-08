import { useEffect, useState } from 'react';
import { Shield, ShieldCheck, X } from 'lucide-react';
import type { BrowserPermissionRequest } from '../../types';
import { useEventLogStore } from '../../stores/eventLogStore';

/**
 * Per-site permission memory UI (Area 9).
 *
 * `BrowserPermissionPrompt` — a page wants a capability its
 * origin is not allowed yet, and the main process is holding
 * the request until Gary answers. Allow once grants it for
 * this session only; Allow always grants it and persists it
 * to the allowlist; Deny denies it.
 *
 * `BrowserPermissionsList` — the persisted allowlist, with a
 * Revoke per entry. Opened from the shield toggle in the tab
 * strip.
 */

export function BrowserPermissionPrompt({
  request,
  onDone,
}: {
  request: BrowserPermissionRequest;
  onDone: () => void;
}) {
  const answer = async (decision: 'once' | 'always' | 'deny') => {
    await window.lucidAPI.browser
      .answerPermission(request.origin, request.permission, decision)
      .catch(() => undefined);
    // Track + diagnose the answer: WHEN Gary answered the
    // page's ask and what the answer was. The arrival was
    // logged by BrowserPanel as pending; this closes it.
    // (Gary, 2026-11-08 — track when + why.)
    useEventLogStore.getState().logBrowserPermissionPrompt(
      request.origin,
      request.permission,
      decision === 'deny' ? 'denied' : 'granted',
      decision,
    );
    onDone();
  };

  return (
    <div className="px-3 py-2 text-xs bg-amber-950 border-b border-[var(--border)] shrink-0">
      <div className="flex items-center gap-2">
        <Shield size={14} className="shrink-0 text-amber-400" />
        <span className="flex-1 min-w-0 truncate">
          <span className="font-medium">{request.origin}</span> wants{' '}
          <span className="font-medium">{request.permission}</span> access
        </span>
        <button
          type="button"
          onClick={() => void answer('once')}
          className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]"
        >
          Allow once
        </button>
        <button
          type="button"
          onClick={() => void answer('always')}
          className="px-2 py-0.5 rounded bg-green-700 text-white hover:bg-green-600"
        >
          Allow always
        </button>
        <button
          type="button"
          onClick={() => void answer('deny')}
          className="px-2 py-0.5 rounded bg-red-700 text-white hover:bg-red-600"
        >
          Deny
        </button>
      </div>
    </div>
  );
}

export function BrowserPermissionsList() {
  const [allowlist, setAllowlist] = useState<Record<string, string[]> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    window.lucidAPI.browser
      .listPermissions()
      .then((result) => {
        if (!cancelled && result.ok) setAllowlist(result.allowlist);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const revoke = async (origin: string, permission: string) => {
    const result = await window.lucidAPI.browser
      .revokePermission(origin, permission)
      .catch(() => null);
    if (result) setAllowlist(result.allowlist);
  };

  if (allowlist === null) {
    return (
      <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border)] shrink-0">
        Loading permissions…
      </div>
    );
  }

  const entries = Object.entries(allowlist).flatMap(([origin, permissions]) =>
    permissions.map((permission) => ({ origin, permission })),
  );

  if (entries.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border)] shrink-0">
        No sites have saved permissions. When a site asks for camera,
        microphone or another capability, you can allow it here — or
        deny it, and it stays denied.
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--border)] shrink-0 max-h-48 overflow-y-auto">
      {entries.map(({ origin, permission }) => (
        <div
          key={`${origin}\n${permission}`}
          className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)]"
        >
          <ShieldCheck size={12} className="shrink-0 text-green-500" />
          <span className="flex-1 min-w-0 truncate">{origin}</span>
          <span className="text-[var(--text-muted)] shrink-0">
            {permission}
          </span>
          <button
            type="button"
            title="Revoke"
            onClick={() => void revoke(origin, permission)}
            className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
