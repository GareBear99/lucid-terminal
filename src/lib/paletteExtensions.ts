/**
 * The palette extension / quick-action model.
 *
 * What Raycast does (official docs, developers.raycast.com +
 * manual.raycast.com, read 2026-11-16 — Manifest, Arguments,
 * Action Panel, Actions, Terminology, Root Search, Quicklinks):
 * - An Extension is a manifest (package.json: name/title/
 *   description/icon/author/platforms/categories) with one or many
 *   Commands. A Command is an entry point shown in Root Search,
 *   with title, subtitle (shown + indexed), description, mode
 *   (`view` = renders a List/Detail/Form/Grid, `no-view` = runs
 *   with no UI pushed, `menu-bar`), keywords (root-search
 *   aliases), arguments (max 3: text/password/dropdown, required
 *   first, entered in Root Search before the command runs),
 *   disabledByDefault, and preferences.
 * - The Action Panel (⌘K) lists every action for the selected
 *   item: first = primary (Enter), second = secondary (⌘Enter in
 *   List/Grid/Detail), grouped into sections, searchable
 *   ("Search for actions…"), with sub-menus, and destructive
 *   actions marked. Per item type the panel adapts (file: Open,
 *   Open With…, Show in Finder, Copy Path, Move to Trash;
 *   command: Run, Configure, Disable, Copy Deeplink, favorites).
 * - Root Search ranks: exact alias > alias prefix > title fuzzy
 *   > subtitle/keyword > frecency; favorites pin to a section
 *   above all results when the search is empty; aliases are
 *   strict (lowercase a-z 0-9 spaces), never fuzzy.
 * - Quicklinks are named URL/file/folder/deeplink shortcuts,
 *   searchable in Root Search, with dynamic placeholders
 *   ({argument name="Query"}, {clipboard}, {date}).
 * - Deeplinks are raycast://extensions/<author>/<extension>/
 *   <command>?arguments=<url-encoded JSON>; every root command
 *   has a Copy Deeplink action.
 * - The Calculator answers inline in Root Search.
 *
 * Lucid's own version of that pattern — NOT Raycast itself, no
 * @raycast/api, nothing here needs Raycast to work:
 * - `PaletteExtensionRegistry`: extensions + commands, enable/
 *   disable per extension and per command (Raycast's Disable
 *   Command hides a command from Root Search; it still exists).
 * - Arguments: max 3, validated at registration and at run
 *   (`resolveArguments`); the palette prompts for them inline.
 * - `lucid://extensions/<extension>/<command>` deeplinks, same
 *   shape as Raycast's, under Lucid's own scheme.
 * - `QuicklinkRegistry` + `resolveQuicklink` placeholders.
 * - `PalettePersonalization`: favorites, aliases, frecency —
 *   the ranking inputs, kept in memory here and persisted per
 *   profile by the palette store (never in the profile record).
 * - `evaluateCalculator`: a tiny recursive-descent evaluator —
 *   never `eval`, anything that is not a plain expression is null.
 * - `buildRootSearchEntries`: the ranking, Raycast's order.
 * - `getQuickActions`: the ⌘K panel for a selection, built-ins
 *   per kind + extension-registered actions. An action only
 *   appears when its dependency exists — a missing hook omits
 *   the action instead of wiring a dead button.
 *
 * Pure + DOM-free (like commandRegistry / fuzzyMatch): the
 * component, the providers and the store wire the live hooks.
 */

import { fuzzyScore } from './fuzzyMatch';
import type { CommandContext } from './commandRegistry';

/* ------------------------------------------------------------------ */
/* Commands + extensions (the manifest model)                          */
/* ------------------------------------------------------------------ */

/** Raycast command modes; Lucid has no menu-bar commands (yet). */
export type PaletteCommandMode = 'view' | 'no-view';

export type PaletteArgumentType = 'text' | 'password' | 'dropdown';

export interface PaletteArgumentDataItem {
  title: string;
  value: string;
}

/** One argument, as declared in the manifest (max 3 per command). */
export interface PaletteArgumentDef {
  name: string;
  placeholder?: string;
  type: PaletteArgumentType;
  required?: boolean;
  /** Dropdown only: the allowed values. */
  data?: PaletteArgumentDataItem[];
}

export const MAX_PALETTE_ARGUMENTS = 3;

/** A command as an extension declares it. */
export interface PaletteCommandDef {
  /** `namespace:action`, lowercase, hyphenated (Lucid's rule). */
  id: string;
  title: string;
  /** Shown under the title in Root Search, and indexed for search. */
  subtitle?: string;
  description?: string;
  /** Extra words Root Search matches on. */
  keywords?: string[];
  /** `view` pushes a view; `no-view` runs and closes, no UI. */
  mode: PaletteCommandMode;
  /** At most 3, required first (Raycast's rule). */
  arguments?: PaletteArgumentDef[];
  /** Off by default until the user enables it. */
  disabledByDefault?: boolean;
  /** Runs fine, never lists in Root Search. */
  hiddenInRootSearch?: boolean;
  /** Filled in on registration — the owning extension. */
  extensionId?: string;
  /** The work. Receives the resolved argument values. */
  run: (ctx: CommandContext, args: Record<string, string>) => void | Promise<void>;
}

/** An extension manifest (Raycast's package.json, Lucid-shaped). */
export interface PaletteExtensionManifest {
  /** URL-safe, unique. Used in deeplinks. */
  id: string;
  title: string;
  description?: string;
  author?: string;
  commands: Omit<PaletteCommandDef, 'extensionId'>[];
}

const COMMAND_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The registration errors for one command, [] when it is valid. */
export function validatePaletteCommandDef(
  def: Omit<PaletteCommandDef, 'extensionId'>,
): string[] {
  const errors: string[] = [];
  if (!COMMAND_ID.test(def.id)) {
    errors.push(`command id "${def.id}" must be namespace:action (lowercase, hyphenated)`);
  }
  if (!def.title || def.title.trim() === '') errors.push(`command "${def.id}" needs a title`);
  if (def.mode !== 'view' && def.mode !== 'no-view') {
    errors.push(`command "${def.id}" has unknown mode "${String(def.mode)}"`);
  }
  const args = def.arguments ?? [];
  if (args.length > MAX_PALETTE_ARGUMENTS) {
    errors.push(`command "${def.id}" declares ${args.length} arguments; at most ${MAX_PALETTE_ARGUMENTS} are allowed`);
  }
  const seen = new Set<string>();
  for (const arg of args) {
    if (!arg.name || arg.name.trim() === '') {
      errors.push(`command "${def.id}" has an argument without a name`);
      continue;
    }
    if (seen.has(arg.name)) errors.push(`command "${def.id}" has duplicate argument "${arg.name}"`);
    seen.add(arg.name);
    if (arg.type === 'dropdown' && (!arg.data || arg.data.length === 0)) {
      errors.push(`command "${def.id}" argument "${arg.name}" is a dropdown with no data`);
    }
  }
  return errors;
}

export class PaletteExtensionRegistry {
  private readonly extensionById = new Map<string, PaletteExtensionManifest>();
  private readonly commandById = new Map<string, PaletteCommandDef>();
  private readonly disabledExtensions = new Set<string>();
  private readonly disabledCommands = new Set<string>();

  /** Fired after any mutation (the palette store persists + re-renders). */
  onChange?: () => void;

  private changed(): void {
    this.onChange?.();
  }

  registerExtension(manifest: PaletteExtensionManifest): void {
    if (!manifest.id || manifest.id.trim() === '') {
      throw new Error('an extension needs an id');
    }
    if (this.extensionById.has(manifest.id)) {
      throw new Error(`extension "${manifest.id}" is already registered`);
    }
    const defs: PaletteCommandDef[] = manifest.commands.map((def) => {
      const errors = validatePaletteCommandDef(def);
      if (errors.length > 0) throw new Error(errors.join('; '));
      if (this.commandById.has(def.id)) {
        throw new Error(`command "${def.id}" is already registered`);
      }
      return { ...def, extensionId: manifest.id };
    });
    this.extensionById.set(manifest.id, { ...manifest, commands: manifest.commands });
    for (const def of defs) {
      this.commandById.set(def.id, def);
      if (def.disabledByDefault) this.disabledCommands.add(def.id);
    }
    this.changed();
  }

  unregisterExtension(id: string): boolean {
    const manifest = this.extensionById.get(id);
    if (!manifest) return false;
    for (const def of manifest.commands) {
      this.commandById.delete(def.id);
      this.disabledCommands.delete(def.id);
    }
    this.extensionById.delete(id);
    this.disabledExtensions.delete(id);
    this.changed();
    return true;
  }

  extensionsList(): PaletteExtensionManifest[] {
    return [...this.extensionById.values()];
  }

  /** Back-compat alias: the registered manifests. */
  extensions(): PaletteExtensionManifest[] {
    return this.extensionsList();
  }

  getExtension(id: string): PaletteExtensionManifest | undefined {
    return this.extensionById.get(id);
  }

  getCommand(id: string): PaletteCommandDef | undefined {
    return this.commandById.get(id);
  }

  /**
   * The commands Root Search may show: enabled extensions,
   * enabled commands, not hidden. Registration order, like
   * the registry — ranking happens in buildRootSearchEntries.
   */
  commands(): PaletteCommandDef[] {
    return [...this.commandById.values()].filter(
      (def) =>
        def.extensionId !== undefined &&
        !this.disabledExtensions.has(def.extensionId) &&
        !this.disabledCommands.has(def.id) &&
        !def.hiddenInRootSearch,
    );
  }

  setExtensionEnabled(id: string, enabled: boolean): boolean {
    if (!this.extensionById.has(id)) return false;
    if (enabled) this.disabledExtensions.delete(id);
    else this.disabledExtensions.add(id);
    this.changed();
    return true;
  }

  isExtensionEnabled(id: string): boolean {
    return this.extensionById.has(id) && !this.disabledExtensions.has(id);
  }

  setCommandEnabled(id: string, enabled: boolean): boolean {
    if (!this.commandById.has(id)) return false;
    if (enabled) this.disabledCommands.delete(id);
    else this.disabledCommands.add(id);
    this.changed();
    return true;
  }

  isCommandEnabled(id: string): boolean {
    return this.commandById.has(id) && !this.disabledCommands.has(id);
  }

  disabledExtensionIds(): string[] {
    return [...this.disabledExtensions];
  }

  disabledCommandIds(): string[] {
    return [...this.disabledCommands];
  }

  /** Replace the disabled sets wholesale (per-profile restore). */
  applyDisabledState(state: { extensions: string[]; commands: string[] }): void {
    this.disabledExtensions.clear();
    this.disabledCommands.clear();
    for (const id of state.extensions) {
      if (this.extensionById.has(id)) this.disabledExtensions.add(id);
    }
    for (const id of state.commands) {
      if (this.commandById.has(id)) this.disabledCommands.add(id);
    }
    this.changed();
  }

  /** Test seam: drop every extension. */
  clear(): void {
    this.extensionById.clear();
    this.commandById.clear();
    this.disabledExtensions.clear();
    this.disabledCommands.clear();
  }
}

/** The shared registry — the Store, in miniature. */
export const paletteExtensions = new PaletteExtensionRegistry();

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

/**
 * Split a Root Search tail into argument values: spaces separate,
 * double quotes group (`new-note "hello world"` → two values).
 * Raycast's equivalent is the alias + space focusing the first
 * argument field; the tail the user typed prefills the fields.
 */
export function splitArgumentInput(text: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  let hasCurrent = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      hasCurrent = true;
      continue;
    }
    if (!inQuotes && (ch === ' ' || ch === '\t')) {
      if (hasCurrent || current.length > 0) values.push(current);
      current = '';
      hasCurrent = false;
      continue;
    }
    current += ch;
    hasCurrent = true;
  }
  if (hasCurrent || current.length > 0) values.push(current);
  return values;
}

/**
 * Validate submitted values against the declaration. Unknown
 * values are dropped, text is trimmed; the errors name the
 * argument the way the prompt labels it.
 */
export function resolveArguments(
  def: PaletteCommandDef,
  values: Record<string, string>,
): { values: Record<string, string>; errors: string[] } {
  const out: Record<string, string> = {};
  const errors: string[] = [];
  for (const arg of def.arguments ?? []) {
    const label = arg.placeholder ?? arg.name;
    const raw = values[arg.name];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === '') {
      if (arg.required) errors.push(`"${label}" is required`);
      continue;
    }
    if (arg.type === 'dropdown') {
      const allowed = (arg.data ?? []).map((d) => d.value);
      if (!allowed.includes(value)) {
        errors.push(`"${value}" is not a valid ${label} (choose one of: ${allowed.join(', ')})`);
        continue;
      }
    }
    out[arg.name] = value;
  }
  return { values: out, errors };
}

/* ------------------------------------------------------------------ */
/* Deeplinks (lucid://extensions/<extension>/<command>)               */
/* ------------------------------------------------------------------ */

/** The action half of a `namespace:action` id, for the URL path. */
function actionOf(commandId: string): string {
  return commandId.split(':')[1] ?? commandId;
}

export function buildDeeplink(
  extensionId: string,
  commandId: string,
  args?: Record<string, string>,
  fallbackText?: string,
): string {
  let url = `lucid://extensions/${extensionId}/${actionOf(commandId)}`;
  const params = new URLSearchParams();
  if (args && Object.keys(args).length > 0) {
    params.set('arguments', JSON.stringify(args));
  }
  if (fallbackText !== undefined) params.set('fallbackText', fallbackText);
  const query = params.toString();
  if (query) url += `?${query}`;
  return url;
}

export function parseDeeplink(
  url: string,
): { extensionId: string; commandId: string; args: Record<string, string>; fallbackText?: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'lucid:' || parsed.hostname !== 'extensions') return null;
  const parts = parsed.pathname.split('/').filter((p) => p !== '');
  if (parts.length !== 2) return null;
  const [extensionId, action] = parts;
  if (!extensionId || !action) return null;
  let args: Record<string, string> = {};
  const rawArgs = parsed.searchParams.get('arguments');
  if (rawArgs !== null) {
    try {
      const decoded = JSON.parse(rawArgs) as unknown;
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
      args = decoded as Record<string, string>;
    } catch {
      return null;
    }
  }
  const fallbackText = parsed.searchParams.get('fallbackText') ?? undefined;
  return { extensionId, commandId: `${extensionId}:${action}`, args, fallbackText };
}

/* ------------------------------------------------------------------ */
/* Quicklinks                                                          */
/* ------------------------------------------------------------------ */

export interface QuicklinkDef {
  id: string;
  name: string;
  /** URL, file/folder path, or deeplink. */
  link: string;
  openWith?: string;
  tags?: string[];
  /** Hide in Root Search (Raycast's action) — still exists. */
  hiddenInRootSearch?: boolean;
}

/**
 * Resolve a quicklink's placeholders. Substituted values are
 * URI-encoded when the link is a URL (a search URL must not
 * break on spaces); a plain file path is left alone. A named
 * argument with no value stays in place and is reported in
 * `missing` — the palette prompts for it instead of guessing.
 */
export function resolveQuicklink(
  link: string,
  args: Record<string, string>,
  opts?: { clipboard?: string; date?: Date },
): { url: string; missing: string[] } {
  const missing: string[] = [];
  const isUrl = /^(https?:|lucid:|[a-z][a-z0-9+.-]*:)/i.test(link);
  const encode = (value: string): string => (isUrl ? encodeURIComponent(value) : value);
  const date = opts?.date ?? new Date();
  const yyyy = String(date.getFullYear()).padStart(4, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  let url = link;
  // {argument name="Query"} — the named form.
  url = url.replace(/\{argument\s+name="([^"]+)"\}/g, (_m, name: string) => {
    const value = args[name];
    if (value === undefined || value === '') {
      if (!missing.includes(name)) missing.push(name);
      return `{argument name="${name}"}`;
    }
    return encode(value);
  });
  // {argument} — the first value, or the `argument` key.
  url = url.replace(/\{argument\}/g, () => {
    const first = args.argument ?? Object.values(args)[0];
    if (first === undefined || first === '') {
      if (!missing.includes('argument')) missing.push('argument');
      return '{argument}';
    }
    return encode(first);
  });
  // {clipboard} and {date}.
  url = url.replace(/\{clipboard\}/g, () => encode(opts?.clipboard ?? ''));
  url = url.replace(/\{date\}/g, () => `${yyyy}-${mm}-${dd}`);
  return { url, missing };
}

export class QuicklinkRegistry {
  private readonly quicklinks = new Map<string, QuicklinkDef>();

  /** Fired after any mutation (the palette store persists + re-renders). */
  onChange?: () => void;

  private changed(): void {
    this.onChange?.();
  }

  register(ql: QuicklinkDef): void {
    if (!ql.id || ql.id.trim() === '') throw new Error('a quicklink needs an id');
    if (!ql.name || ql.name.trim() === '') throw new Error('a quicklink needs a name');
    if (!ql.link || ql.link.trim() === '') throw new Error('a quicklink needs a link');
    if (this.quicklinks.has(ql.id)) {
      throw new Error(`quicklink "${ql.id}" is already registered`);
    }
    this.quicklinks.set(ql.id, { ...ql });
    this.changed();
  }

  unregister(id: string): boolean {
    const removed = this.quicklinks.delete(id);
    if (removed) this.changed();
    return removed;
  }

  get(id: string): QuicklinkDef | undefined {
    return this.quicklinks.get(id);
  }

  all(): QuicklinkDef[] {
    return [...this.quicklinks.values()];
  }

  visible(): QuicklinkDef[] {
    return this.all().filter((q) => !q.hiddenInRootSearch);
  }

  setHidden(id: string, hidden: boolean): boolean {
    const ql = this.quicklinks.get(id);
    if (!ql) return false;
    this.quicklinks.set(id, { ...ql, hiddenInRootSearch: hidden });
    this.changed();
    return true;
  }

  /** Replace the whole list (per-profile restore). */
  replaceAll(list: QuicklinkDef[]): void {
    this.quicklinks.clear();
    for (const ql of list) this.quicklinks.set(ql.id, { ...ql });
    this.changed();
  }

  /** Test seam: drop every quicklink. */
  clear(): void {
    this.quicklinks.clear();
  }
}

/** The shared quicklink library. */
export const paletteQuicklinks = new QuicklinkRegistry();

/* ------------------------------------------------------------------ */
/* Personalization: favorites, aliases, frecency (ranking inputs)    */
/* ------------------------------------------------------------------ */

/**
 * Raycast alias rule (manual, Command Aliases & Hotkeys): lowercase
 * letters a–z, numbers 0–9, spaces. Anything else is rejected;
 * aliases are lowercased on save. Returns the error, or null.
 */
export function validateAlias(alias: string): string | null {
  if (!alias || alias.trim() === '') return 'alias must not be empty';
  if (alias !== alias.toLowerCase() || /[^a-z0-9 ]/.test(alias)) {
    return 'alias must be lowercase letters, numbers and spaces only';
  }
  return null;
}

export interface FrecencyEntry {
  count: number;
  lastUsed: number;
}

export interface PersonalizationData {
  favorites: string[];
  aliases: Record<string, string>;
  frecency: Record<string, FrecencyEntry>;
}

export class PalettePersonalization {
  private favorites: string[] = [];
  private aliases = new Map<string, string>();
  private frecency = new Map<string, FrecencyEntry>();

  /** Fired after any mutation (the palette store persists). */
  onChange?: () => void;

  private changed(): void {
    this.onChange?.();
  }

  addFavorite(id: string): void {
    if (!this.favorites.includes(id)) {
      this.favorites.push(id);
      this.changed();
    }
  }

  removeFavorite(id: string): void {
    if (this.favorites.includes(id)) {
      this.favorites = this.favorites.filter((f) => f !== id);
      this.changed();
    }
  }

  toggleFavorite(id: string): boolean {
    if (this.isFavorite(id)) {
      this.removeFavorite(id);
      return false;
    }
    this.addFavorite(id);
    return true;
  }

  isFavorite(id: string): boolean {
    return this.favorites.includes(id);
  }

  favoriteIds(): string[] {
    return [...this.favorites];
  }

  moveFavorite(id: string, direction: 'up' | 'down'): void {
    const i = this.favorites.indexOf(id);
    if (i === -1) return;
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= this.favorites.length) return;
    const next = [...this.favorites];
    [next[i], next[j]] = [next[j], next[i]];
    this.favorites = next;
    this.changed();
  }

  /** Returns the error, or null. The alias is lowercased on save
   * (Raycast: aliases are automatically converted to lowercase). */
  setAlias(entryId: string, alias: string): string | null {
    const lowered = alias.toLowerCase();
    const error = validateAlias(lowered);
    if (error) return error;
    this.aliases.set(entryId, lowered);
    this.changed();
    return null;
  }

  deleteAlias(entryId: string): void {
    if (this.aliases.delete(entryId)) this.changed();
  }

  getAlias(entryId: string): string | undefined {
    return this.aliases.get(entryId);
  }

  /** Strict match only (Raycast: aliases never fuzzy-match). */
  findByAlias(alias: string): string | undefined {
    const lower = alias.toLowerCase();
    for (const [id, value] of this.aliases) {
      if (value === lower) return id;
    }
    return undefined;
  }

  aliasesRecord(): Record<string, string> {
    return Object.fromEntries(this.aliases);
  }

  recordUse(entryId: string, now: number = Date.now()): void {
    const prev = this.frecency.get(entryId);
    this.frecency.set(entryId, {
      count: (prev?.count ?? 0) + 1,
      lastUsed: now,
    });
    this.changed();
  }

  /**
   * Frecency: uses + a recency bonus (used in the last hour +5,
   * today +2). A tiebreak among matches, never a match by itself.
   */
  frecencyScore(entryId: string, now: number = Date.now()): number {
    const entry = this.frecency.get(entryId);
    if (!entry) return 0;
    const hours = (now - entry.lastUsed) / 3_600_000;
    const recency = hours < 1 ? 5 : hours < 24 ? 2 : 0;
    return entry.count + recency;
  }

  toJSON(): PersonalizationData {
    return {
      favorites: [...this.favorites],
      aliases: Object.fromEntries(this.aliases),
      frecency: Object.fromEntries(this.frecency),
    };
  }

  loadJSON(data: PersonalizationData | null | undefined): void {
    this.favorites = Array.isArray(data?.favorites) ? [...data.favorites] : [];
    this.aliases = new Map(Object.entries(data?.aliases ?? {}));
    this.frecency = new Map(Object.entries(data?.frecency ?? {}));
    this.changed();
  }

  /** Test seam: drop everything. */
  clear(): void {
    this.favorites = [];
    this.aliases.clear();
    this.frecency.clear();
  }
}

/** The shared personalization. */
export const palettePersonalization = new PalettePersonalization();

/* ------------------------------------------------------------------ */
/* Calculator (inline in Root Search)                                  */
/* ------------------------------------------------------------------ */

/**
 * A tiny recursive-descent evaluator: + - * / ( ) decimals and a
 * trailing % (percent, Raycast-style: `50%` → 0.5). No eval, no
 * Function — anything that is not a plain expression is null,
 * including division by zero and a bare number (that is not a
 * calculation, it is just a number).
 */
export function evaluateCalculator(
  query: string,
): { expression: string; result: number; display: string } | null {
  const text = query.trim();
  if (text === '' || !/^[0-9+\-*/().%\s]+$/.test(text)) return null;
  if (!/[0-9]/.test(text) || !/[+\-*/%]/.test(text)) return null;
  // Tokenize.
  const tokens: (number | string)[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      let dots = 0;
      while (i < text.length && ((text[i] >= '0' && text[i] <= '9') || text[i] === '.')) {
        if (text[i] === '.') dots++;
        num += text[i];
        i++;
      }
      if (dots > 1 || num === '.' || num === '') return null;
      tokens.push(Number(num));
      continue;
    }
    if ('+-*/()%'.includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }
    return null;
  }
  let pos = 0;
  const peek = (): number | string | undefined => tokens[pos];
  const next = (): number | string | undefined => tokens[pos++];
  function parseExpr(): number | null {
    let value = parseTerm();
    if (value === null) return null;
    for (;;) {
      const op = peek();
      if (op !== '+' && op !== '-') break;
      next();
      const rhs = parseTerm();
      if (rhs === null) return null;
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm(): number | null {
    let value = parseFactor();
    if (value === null) return null;
    for (;;) {
      const op = peek();
      if (op !== '*' && op !== '/') break;
      next();
      const rhs = parseFactor();
      if (rhs === null) return null;
      if (op === '/' && rhs === 0) return null;
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseFactor(): number | null {
    const token = next();
    if (token === undefined) return null;
    if (token === '-') {
      const value = parseFactor();
      return value === null ? null : -value;
    }
    if (token === '(') {
      const value = parseExpr();
      if (value === null || next() !== ')') return null;
      return applyPercent(value);
    }
    if (typeof token === 'number') return applyPercent(token);
    return null;
  }
  function applyPercent(value: number): number | null {
    if (peek() === '%') {
      next();
      return value / 100;
    }
    return value;
  }
  const result = parseExpr();
  if (result === null || pos !== tokens.length) return null;
  if (!Number.isFinite(result)) return null;
  const display = Number.isInteger(result)
    ? String(result)
    : String(parseFloat(result.toFixed(10)));
  return { expression: text, result, display };
}

/* ------------------------------------------------------------------ */
/* Root Search entries + ranking                                       */
/* ------------------------------------------------------------------ */

export type RootSearchEntryKind =
  | 'command'
  | 'quicklink'
  | 'file'
  | 'tab'
  | 'setting'
  | 'calculator';

export interface RootSearchEntry {
  id: string;
  kind: RootSearchEntryKind;
  title: string;
  subtitle?: string;
  keywords?: string[];
  /** The section header the row renders under. */
  section?: string;
  commandId?: string;
  extensionId?: string;
  filePath?: string;
  tabId?: string;
  link?: string;
  /** Arguments the palette must prompt for before running. */
  arguments?: PaletteArgumentDef[];
  mode?: PaletteCommandMode;
  /** True when the entry came from the extension registry (not
   * the adapted command registry) — only those can be disabled. */
  fromExtension?: boolean;
  /** Right-side row text (a keybinding, a kind). */
  right?: string;
  run: (ctx: CommandContext) => void | Promise<void>;
  /** Run with resolved argument values (commands + quicklinks with arguments). */
  runWithArgs?: (ctx: CommandContext, args: Record<string, string>) => void | Promise<void>;
}

export interface RootSearchSources {
  commands: RootSearchEntry[];
  quicklinks: RootSearchEntry[];
  files: RootSearchEntry[];
  tabs: RootSearchEntry[];
  settings: RootSearchEntry[];
}

export interface RootSearchDeps {
  copyText?: (text: string) => void;
}

const KIND_SECTION: Record<RootSearchEntryKind, string> = {
  command: 'Commands',
  quicklink: 'Quicklinks',
  file: 'Files',
  tab: 'Tabs',
  setting: 'Settings',
  calculator: 'Calculator',
};

/**
 * Raycast's Root Search ranking (manual, Search Bar — "How
 * Ranking Works"): 1. exact alias match, 2. alias prefix match,
 * 3. title fuzzy match score, 4. subtitle and keyword matches,
 * 5. frecency score. An empty query shows favorites first (in
 * favorite order, under a Favorites section), then everything
 * in kind order. Frecency never creates a match on its own.
 */
export function buildRootSearchEntries(
  sources: RootSearchSources,
  query: string,
  personalization: PalettePersonalization,
  deps?: RootSearchDeps,
): RootSearchEntry[] {
  const all: RootSearchEntry[] = [
    ...sources.commands,
    ...sources.quicklinks,
    ...sources.files,
    ...sources.tabs,
    ...sources.settings,
  ];
  const trimmed = query.trim();

  // The calculator answers inline, first (Raycast: a calculation
  // typed in Root Search shows its result right there).
  const calculator = trimmed !== '' ? evaluateCalculator(trimmed) : null;
  const calculatorEntry: RootSearchEntry | null =
    calculator && deps?.copyText
      ? {
          id: `calculator:${calculator.expression}`,
          kind: 'calculator',
          title: `= ${calculator.display}`,
          subtitle: `${calculator.expression} — Enter to copy`,
          section: 'Calculator',
          run: () => {
            deps.copyText?.(calculator.display);
          },
        }
      : null;

  if (trimmed === '') {
    const favorites = personalization.favoriteIds();
    const favoriteEntries = favorites
      .map((id) => all.find((e) => e.id === id))
      .filter((e): e is RootSearchEntry => e !== undefined)
      .map((e) => ({ ...e, section: 'Favorites' }));
    const rest = all
      .filter((e) => !favorites.includes(e.id))
      .map((e) => ({ ...e, section: KIND_SECTION[e.kind] }));
    const out: RootSearchEntry[] = [...favoriteEntries, ...rest];
    if (calculatorEntry) out.unshift(calculatorEntry);
    return out;
  }

  const q = trimmed.toLowerCase();
  type Scored = { entry: RootSearchEntry; tier: number; score: number; index: number };
  const scored: Scored[] = [];
  all.forEach((entry, index) => {
    const alias = personalization.getAlias(entry.id);
    if (alias === q) {
      scored.push({ entry, tier: 0, score: 0, index });
      return;
    }
    if (alias && alias.startsWith(q)) {
      scored.push({ entry, tier: 1, score: 0, index });
      return;
    }
    const titleScore = fuzzyScore(q, entry.title.toLowerCase());
    if (Number.isFinite(titleScore)) {
      scored.push({ entry, tier: 2, score: titleScore, index });
      return;
    }
    const haystacks = [
      ...(entry.subtitle ? [entry.subtitle] : []),
      ...(entry.keywords ?? []),
    ];
    let best = -Infinity;
    for (const hay of haystacks) {
      const s = fuzzyScore(q, hay.toLowerCase());
      if (Number.isFinite(s) && s > best) best = s;
    }
    if (Number.isFinite(best)) {
      scored.push({ entry, tier: 3, score: best, index });
    }
  });
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.score !== b.score) return b.score - a.score;
    const fa = personalization.frecencyScore(a.entry.id);
    const fb = personalization.frecencyScore(b.entry.id);
    if (fa !== fb) return fb - fa;
    // Favorites sort before non-favorites inside a tier.
    const favA = personalization.isFavorite(a.entry.id) ? 0 : 1;
    const favB = personalization.isFavorite(b.entry.id) ? 0 : 1;
    if (favA !== favB) return favA - favB;
    return a.index - b.index;
  });
  const out: RootSearchEntry[] = scored.map(({ entry }) => ({
    ...entry,
    section: KIND_SECTION[entry.kind],
  }));
  // One ranked list across kinds (Raycast's order above) — the
  // section is a label on each row, not a regrouping. The
  // calculator, when present, is first.
  if (calculatorEntry) out.unshift(calculatorEntry);
  return out;
}

/* ------------------------------------------------------------------ */
/* Quick actions (the ⌘K Action Panel)                                 */
/* ------------------------------------------------------------------ */

export type PaletteSelectionKind = 'command' | 'file' | 'tab' | 'text' | 'quicklink' | 'setting' | 'calculator';

export interface PaletteSelection {
  kind: PaletteSelectionKind;
  id: string;
  title: string;
  subtitle?: string;
  commandId?: string;
  extensionId?: string;
  filePath?: string;
  tabId?: string;
  text?: string;
  link?: string;
  favorite?: boolean;
  /** True when the command comes from an extension (only those
   * can be disabled — registry commands have no disable). */
  canDisable?: boolean;
}

/** The hooks a quick action needs. Every hook is optional: an
 * action whose hook is missing is omitted, never a dead button. */
export interface QuickActionDeps {
  copyText?: (text: string) => void;
  toggleFavorite?: (entryId: string) => void;
  setAlias?: (entryId: string, alias: string) => string | null;
  disableCommand?: (commandId: string) => void;
  runCommand?: (commandId: string, ctx: CommandContext) => void | Promise<void>;
  openFile?: (path: string) => void;
  revealFile?: (path: string) => void;
  switchTab?: (tabId: string) => void;
  closeTab?: (tabId: string) => void;
  searchProject?: (text: string) => void;
  openQuicklink?: (link: string) => void;
  deleteQuicklink?: (quicklinkId: string) => void;
  toggleQuicklinkHidden?: (quicklinkId: string) => void;
  openSettings?: () => void;
}

export interface QuickActionDef {
  id: string;
  title: string;
  /** The section the action renders under in the panel. */
  section?: string;
  /** Shown on the right of the row (display only). */
  shortcut?: string;
  /** Destructive actions render red (Raycast's style). */
  destructive?: boolean;
  /** When present, the panel prompts for one value first. */
  prompt?: { placeholder: string; initialValue?: string };
  /** Only listed when this holds for the selection. */
  when?: (selection: PaletteSelection) => boolean;
  /** One hook this action needs; omitted when it is missing. */
  requires?: keyof QuickActionDeps;
  /**
   * The work. For a prompt action the input is the submitted
   * value; returning a string reports it as an error (the
   * prompt stays open) — that is how Set Alias reports a bad
   * alias instead of failing silently.
   */
  run: (
    selection: PaletteSelection,
    ctx: CommandContext,
    input?: string,
  ) => void | Promise<void> | string | null | Promise<string | null>;
}

const registeredQuickActions = new Map<PaletteSelectionKind, QuickActionDef[]>();

export function registerQuickAction(kind: PaletteSelectionKind, def: QuickActionDef): void {
  const list = registeredQuickActions.get(kind) ?? [];
  if (list.some((d) => d.id === def.id)) {
    throw new Error(`quick action "${def.id}" is already registered for ${kind}`);
  }
  list.push(def);
  registeredQuickActions.set(kind, list);
}

export function unregisterQuickAction(kind: PaletteSelectionKind, id: string): boolean {
  const list = registeredQuickActions.get(kind);
  if (!list) return false;
  const next = list.filter((d) => d.id !== id);
  if (next.length === list.length) return false;
  registeredQuickActions.set(kind, next);
  return true;
}

/** The built-in actions for a selection kind (Raycast's per-type panels). */
function builtinQuickActions(
  selection: PaletteSelection,
  deps: QuickActionDeps,
): QuickActionDef[] {
  const actions: QuickActionDef[] = [];
  switch (selection.kind) {
    case 'command': {
      if (deps.runCommand && selection.commandId) {
        const commandId = selection.commandId;
        actions.push({
          id: 'palette:run-command',
          title: 'Run Command',
          section: 'Actions',
          shortcut: '↵',
          requires: 'runCommand',
          run: (_sel, ctx) => deps.runCommand?.(commandId, ctx),
        });
      }
      if (deps.copyText && selection.commandId && selection.extensionId) {
        const { commandId, extensionId } = selection;
        actions.push({
          id: 'palette:copy-deeplink',
          title: 'Copy Deeplink',
          section: 'Actions',
          requires: 'copyText',
          run: () => deps.copyText?.(buildDeeplink(extensionId, commandId)),
        });
      }
      if (deps.copyText && selection.commandId) {
        const commandId = selection.commandId;
        actions.push({
          id: 'palette:copy-command-id',
          title: 'Copy Command ID',
          section: 'Actions',
          requires: 'copyText',
          run: () => deps.copyText?.(commandId),
        });
      }
      if (deps.toggleFavorite) {
        const favorite = selection.favorite === true;
        actions.push({
          id: 'palette:toggle-favorite',
          title: favorite ? 'Remove from Favorites' : 'Add to Favorites',
          section: 'Manage',
          shortcut: '⌘F',
          requires: 'toggleFavorite',
          run: (sel) => deps.toggleFavorite?.(sel.id),
        });
      }
      if (deps.setAlias) {
        actions.push({
          id: 'palette:set-alias',
          title: 'Set Alias…',
          section: 'Manage',
          prompt: { placeholder: 'Alias (lowercase letters, numbers, spaces)' },
          requires: 'setAlias',
          run: (sel, _ctx, input) => {
            if (input === undefined) return null;
            return deps.setAlias?.(sel.id, input) ?? null;
          },
        });
      }
      if (deps.disableCommand && selection.commandId) {
        const commandId = selection.commandId;
        actions.push({
          id: 'palette:disable-command',
          title: 'Disable Command',
          section: 'Manage',
          requires: 'disableCommand',
          when: (sel) => sel.canDisable === true,
          run: () => deps.disableCommand?.(commandId),
        });
      }
      break;
    }
    case 'file': {
      if (deps.openFile && selection.filePath) {
        const path = selection.filePath;
        actions.push({
          id: 'palette:open-file',
          title: 'Open File',
          section: 'Actions',
          shortcut: '↵',
          requires: 'openFile',
          run: () => deps.openFile?.(path),
        });
      }
      if (deps.copyText && selection.filePath) {
        const path = selection.filePath;
        actions.push({
          id: 'palette:copy-path',
          title: 'Copy Path',
          section: 'Actions',
          requires: 'copyText',
          run: () => deps.copyText?.(path),
        });
        actions.push({
          id: 'palette:copy-name',
          title: 'Copy Name',
          section: 'Actions',
          requires: 'copyText',
          run: () => deps.copyText?.(path.split('/').pop() ?? path),
        });
      }
      if (deps.revealFile && selection.filePath) {
        const path = selection.filePath;
        actions.push({
          id: 'palette:reveal-file',
          title: 'Reveal in Finder',
          section: 'Actions',
          requires: 'revealFile',
          run: () => deps.revealFile?.(path),
        });
      }
      break;
    }
    case 'tab': {
      if (deps.switchTab && selection.tabId) {
        const tabId = selection.tabId;
        actions.push({
          id: 'palette:switch-tab',
          title: 'Switch to Tab',
          section: 'Actions',
          shortcut: '↵',
          requires: 'switchTab',
          run: () => deps.switchTab?.(tabId),
        });
      }
      if (deps.closeTab && selection.tabId) {
        const tabId = selection.tabId;
        actions.push({
          id: 'palette:close-tab',
          title: 'Close Tab',
          section: 'Danger zone',
          destructive: true,
          requires: 'closeTab',
          run: () => deps.closeTab?.(tabId),
        });
      }
      break;
    }
    case 'text': {
      if (deps.copyText && selection.text) {
        const text = selection.text;
        actions.push({
          id: 'palette:copy-text',
          title: 'Copy Text',
          section: 'Actions',
          shortcut: '↵',
          requires: 'copyText',
          run: () => deps.copyText?.(text),
        });
      }
      if (deps.searchProject && selection.text) {
        const text = selection.text;
        actions.push({
          id: 'palette:search-project',
          title: 'Search in Project',
          section: 'Actions',
          requires: 'searchProject',
          run: () => deps.searchProject?.(text),
        });
      }
      break;
    }
    case 'quicklink': {
      if (deps.openQuicklink && selection.link) {
        const link = selection.link;
        actions.push({
          id: 'palette:open-quicklink',
          title: 'Open Quicklink',
          section: 'Actions',
          shortcut: '↵',
          requires: 'openQuicklink',
          run: () => deps.openQuicklink?.(link),
        });
      }
      if (deps.copyText && selection.link) {
        const link = selection.link;
        actions.push({
          id: 'palette:copy-link',
          title: 'Copy Link',
          section: 'Actions',
          requires: 'copyText',
          run: () => deps.copyText?.(link),
        });
      }
      if (deps.toggleQuicklinkHidden) {
        actions.push({
          id: 'palette:toggle-quicklink-hidden',
          title: 'Hide in Root Search',
          section: 'Manage',
          requires: 'toggleQuicklinkHidden',
          run: (sel) => deps.toggleQuicklinkHidden?.(sel.id),
        });
      }
      if (deps.deleteQuicklink) {
        actions.push({
          id: 'palette:delete-quicklink',
          title: 'Delete Quicklink',
          section: 'Danger zone',
          destructive: true,
          requires: 'deleteQuicklink',
          run: (sel) => deps.deleteQuicklink?.(sel.id),
        });
      }
      break;
    }
    case 'setting': {
      if (deps.openSettings) {
        actions.push({
          id: 'palette:open-settings',
          title: 'Open Settings',
          section: 'Actions',
          shortcut: '↵',
          requires: 'openSettings',
          run: () => deps.openSettings?.(),
        });
      }
      break;
    }
    case 'calculator': {
      if (deps.copyText && selection.text) {
        const text = selection.text;
        actions.push({
          id: 'palette:copy-result',
          title: 'Copy Result',
          section: 'Actions',
          shortcut: '↵',
          requires: 'copyText',
          run: () => deps.copyText?.(text),
        });
      }
      break;
    }
  }
  return actions;
}

/**
 * The ⌘K Action Panel for a selection: the built-ins for its
 * kind, then any actions an extension registered for the kind.
 * An action is listed only when its `when` holds and its
 * required hook exists.
 */
export function getQuickActions(
  selection: PaletteSelection,
  _ctx: CommandContext,
  deps: QuickActionDeps,
): QuickActionDef[] {
  const all = [
    ...builtinQuickActions(selection, deps),
    ...(registeredQuickActions.get(selection.kind) ?? []),
  ];
  return all.filter((def) => {
    if (def.when && !def.when(selection)) return false;
    if (def.requires && deps[def.requires] === undefined) return false;
    return true;
  });
}
