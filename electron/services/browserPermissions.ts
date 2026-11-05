import * as fs from 'fs';

/**
 * Per-site permission allowlist for the in-panel browser.
 *
 * Default is DENY: a page gets no camera, microphone, notifications,
 * or any other capability unless its origin is explicitly on the
 * allowlist. The allowlist is per-origin (e.g. `https://meet.example`)
 * and per-permission, persisted as JSON in the app's userData dir.
 *
 * There is no UI to add to the allowlist yet — that lands with the
 * per-site permission memory (Area 9). Until then the allowlist is
 * empty and every permission request is denied, which is the safe
 * default: a site that needs the camera simply does not get it, and
 * nothing is ever granted silently.
 *
 * The pure functions (`isPermissionAllowed`, `parsePermissionAllowlist`,
 * `stringifyPermissionAllowlist`, `setPermissionAllowed`) are the
 * testable core; the file helpers are thin wrappers around them.
 */

/** Electron session permission names the handler is asked about. */
export type BrowserPermission =
  | 'camera'
  | 'microphone'
  | 'notifications'
  | 'geolocation'
  | 'fullscreen'
  | 'pointerLock'
  | 'clipboard-read'
  | 'clipboard-sanitized-write'
  | 'media'
  | 'openExternal'
  | 'window-placement';

/** origin -> permissions explicitly allowed for that origin. */
export type BrowserPermissionAllowlist = Record<string, BrowserPermission[]>;

/** Is `permission` allowed for `origin` in the allowlist? */
export function isPermissionAllowed(
  allowlist: BrowserPermissionAllowlist,
  origin: string,
  permission: string,
): boolean {
  const allowed = allowlist[origin];
  if (!allowed) return false;
  return allowed.includes(permission as BrowserPermission);
}

/** Parse an allowlist from JSON text. Garbage in → empty allowlist
 * (deny everything), never a crash and never an accidental allow. */
export function parsePermissionAllowlist(
  json: string,
): BrowserPermissionAllowlist {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: BrowserPermissionAllowlist = {};
    for (const [origin, perms] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof origin !== 'string' || !Array.isArray(perms)) continue;
      const kept = perms.filter(
        (p): p is BrowserPermission => typeof p === 'string',
      );
      if (kept.length > 0) out[origin] = kept;
    }
    return out;
  } catch {
    return {};
  }
}

/** Serialise an allowlist to JSON (stable key order for diffing). */
export function stringifyPermissionAllowlist(
  allowlist: BrowserPermissionAllowlist,
): string {
  const sorted: BrowserPermissionAllowlist = {};
  for (const origin of Object.keys(allowlist).sort()) {
    sorted[origin] = [...allowlist[origin]].sort();
  }
  return JSON.stringify(sorted, null, 2);
}

/** Return a new allowlist with `permission` for `origin` set (or
 * cleared when `allowed` is false). Never mutates the input. */
export function setPermissionAllowed(
  allowlist: BrowserPermissionAllowlist,
  origin: string,
  permission: BrowserPermission,
  allowed: boolean,
): BrowserPermissionAllowlist {
  const next: BrowserPermissionAllowlist = { ...allowlist };
  const current = [...(next[origin] ?? [])];
  if (allowed) {
    if (!current.includes(permission)) current.push(permission);
    next[origin] = current.sort();
  } else {
    const remaining = current.filter((p) => p !== permission);
    if (remaining.length === 0) delete next[origin];
    else next[origin] = remaining;
  }
  return next;
}

/** Origin of a URL string, or null when it does not parse. */
export function originOfUrl(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Load the allowlist from a JSON file. Missing or unreadable file →
 * empty allowlist (deny everything). */
export function loadPermissionAllowlist(
  filePath: string,
): BrowserPermissionAllowlist {
  try {
    return parsePermissionAllowlist(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

/** Save the allowlist to a JSON file. Creates parent dirs as needed. */
export function savePermissionAllowlist(
  filePath: string,
  allowlist: BrowserPermissionAllowlist,
): void {
  const dir = filePath.split('/').slice(0, -1).join('/') || '.';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, stringifyPermissionAllowlist(allowlist), 'utf8');
}
