import * as fs from 'fs';

/**
 * Main-side visit log (Area 9): the pages the in-panel browser
 * finished loading, newest first — so the AI can answer "what
 * did I look at yesterday?" without the renderer, via the
 * `browser_history` tool.
 *
 * Only http(s) pages are recorded (about:blank, the phone app's
 * local URL and chrome:// pages never appear), consecutive
 * visits to the same URL are deduped (a reload is not a new
 * visit), and the log caps at 200 entries, persisted as JSON in
 * the app's userData dir. The renderer keeps its own history
 * store for the address-bar dropdown; this log is the AI's
 * copy of the same visits.
 */

export interface BrowserVisit {
  url: string;
  title: string;
  /** Epoch ms the page finished loading. */
  visitedAt: number;
}

export const BROWSER_VISIT_LOG_LIMIT = 200;

/** Is this URL worth logging? */
export function isLoggableVisitUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/** Pure: record a visit — newest first, dropping a consecutive
 * duplicate (same URL as the latest entry), then cap. */
export function recordVisit(
  visits: BrowserVisit[],
  visit: BrowserVisit,
  limit: number = BROWSER_VISIT_LOG_LIMIT,
): BrowserVisit[] {
  if (!isLoggableVisitUrl(visit.url)) return visits;
  if (visits[0]?.url === visit.url) return visits;
  return [visit, ...visits].slice(0, limit);
}

/** Pure: visits from the last `days` days (newest first). */
export function visitsInLastDays(
  visits: BrowserVisit[],
  days: number,
  now: number = Date.now(),
): BrowserVisit[] {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return visits.filter((v) => v.visitedAt >= cutoff);
}

function dayLabel(visitedAt: number, now: number): string {
  const day = new Date(visitedAt);
  const today = new Date(now);
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOf(today) - startOf(day)) / (24 * 60 * 60 * 1000),
  );
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return day.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Format visits for the AI chat, grouped by day, newest first.
 * An empty list says so plainly instead of returning nothing. */
export function formatVisitsForAi(
  visits: BrowserVisit[],
  days: number,
  now: number = Date.now(),
): string {
  const recent = visitsInLastDays(visits, days, now);
  if (recent.length === 0) {
    return `No pages visited in the last ${days === 1 ? 'day' : `${days} days`}.`;
  }
  const lines: string[] = [
    `Pages visited in the last ${days === 1 ? 'day' : `${days} days`} (${recent.length}):`,
  ];
  let lastLabel = '';
  for (const visit of recent) {
    const label = dayLabel(visit.visitedAt, now);
    if (label !== lastLabel) {
      lines.push('', `${label}:`);
      lastLabel = label;
    }
    lines.push(`- ${visit.title || visit.url} (${visit.url})`);
  }
  return lines.join('\n');
}

function isStoredVisit(value: unknown): value is BrowserVisit {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.url === 'string' &&
    typeof v.title === 'string' &&
    typeof v.visitedAt === 'number'
  );
}

/** Load the visit log from a JSON file. Missing/garbage → []. */
export function loadVisitLog(filePath: string): BrowserVisit[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredVisit).slice(0, BROWSER_VISIT_LOG_LIMIT);
  } catch {
    return [];
  }
}

/** Save the visit log to a JSON file. */
export function saveVisitLog(
  filePath: string,
  visits: BrowserVisit[],
): void {
  const dir = filePath.split('/').slice(0, -1).join('/') || '.';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(visits, null, 2), 'utf8');
}
