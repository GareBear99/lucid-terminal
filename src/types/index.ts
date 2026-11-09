// Re-export preload types
import type {
  DecodePath,
  GpuGateStatus,
  StreamMetricsSnapshot,
  TouchMessage,
} from '../phone/streaming';
import type { HomunculusColor } from '../lib/homunculusColor';
import type { SummonVariant } from '../lib/summons';
import type { DefconLevel, DefconMergeReading } from '../lib/defcon';
import type { StopColorDuration } from '../lib/dualUnison';
import type {
  Homunculus,
  ScoreboardRow,
} from '../lib/homunculi';
import type { DevicesListResult } from '../lib/deviceDetection';
import type {
  BrainAnswer,
  ImportDatasetResult,
  InstallBrainResult,
  LlmbuilderProgressEvent,
  LlmbuilderRunInfo,
  LlmbuilderStatus,
  PromotionDecision,
  StartRunParams,
} from '../lib/llmbuilderApi';
import type {
  SynthDisclaimerChoice,
  SynthVersion,
} from '../lib/synthDisclaimer';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  modified: number;
  children?: FileEntry[];
}

export interface FileStats {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  created: number;
  modified: number;
  accessed: number;
}

export interface ChatMessage {
  id?: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Wall-clock time the message came into being (send time /
   *  completion time). Display only — it is NOT the ordering key.
   *  Clocks skew and messages arrive late, so timestamps can disagree
   *  with the order things actually happened. See `ritualTick`. */
  timestamp?: number;
  /**
   * Ritual tick — the causal-order counter for this bubble.
   *
   * A timestamp says WHEN a message happened (wall clock). A ritual
   * tick says WHERE it sits in the causal order: it is a
   * monotonically increasing integer, per chat, assigned when the
   * message is retrieved (loaded, read for display, inserted into
   * the rendered list). Each retrieval advances the chat's counter
   * and the bubble takes the next tick, so ticks are assigned in
   * retrieval order and can never be out of order, duplicated, or
   * skewed the way wall clocks can. The rendered list is ordered by
   * ritual tick; the timestamp is shown on the bubble but never
   * orders it.
   */
  ritualTick?: number;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /**
   * The session's causal placement — its position in the creation
   * sequence (Gary, 2026-11-07): the LuciferAI tabs (the chats) hide
   * behind the one blood drop tab, ordered by causal ritual placement
   * (ticks), not by time. A session takes its number once, at
   * creation, and it is never re-numbered — a reply never moves the
   * session, so the list order never changes under the user.
   * Timestamps (createdAt/updatedAt) are display only. Legacy
   * sessions (created before this field) take their number on load,
   * in creation order.
   */
  causalOrder?: number;
  /**
   * The next ritual tick to assign in this chat. Persisted with the
   * session (it round-trips through sessions.json) so the counter
   * survives a reload and never restarts from zero and collides with
   * ticks already on the chat's bubbles. Each chat has its own
   * sequence — a tick in one chat never orders against a tick in
   * another.
   */
  nextTick?: number;
  /**
   * The model this chat answers with, chosen in the header dropdown
   * (Gary, 2026-11-06: each chat has a model choice for the next
   * prompted reply, and each chat remembers its model). The choice
   * is read at send time - it picks the model for the NEXT reply,
   * it does not re-route replies already sent. Persisted with the
   * session (it round-trips through sessions.json like nextTick).
   *
   * The value depends on `modelSource`: a canonical local key the
   * Python backend honors (e.g. 'tinyllama'), an OpenAI name
   * ('gpt-4' / 'gpt-4-turbo' / 'gpt-3.5-turbo'), or a ping server
   * model id (a Workers AI id, e.g.
   * '@cf/meta/llama-3.2-1b-instruct' — the dropdown lists only
   * ping models now, Gary 2026-11-06). Absent = Auto: no explicit
   * model, the reply takes today's fixed cascade (ping -> local ->
   * OpenAI), re-decided per reply. A new chat inherits the current
   * chat's model, else Auto - there is no global model default
   * beyond the cascade.
   */
  model?: string;
  /**
   * Which route answers when `model` is set: 'local' (the Python
   * backend cold-loads that GGUF), 'openai' (that API model), or
   * 'ping' (the ping server — the model is sent as body.model and
   * the worker serves it).
   * Absent together with `model` (Auto). The source is stored
   * alongside the value so routing never has to guess a model name's
   * route - a local key and an OpenAI name can never be confused.
   */
  modelSource?: 'local' | 'openai' | 'ping';
}

export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  isActive: boolean;
}

// Import plugin types for validation and token tracking
import type { ValidationStep, TokenStats } from './plugin';

export interface TerminalBlock {
  id: string;
  command: string;
  output: string;
  timestamp: number;
  isComplete: boolean;
  cwd?: string;
  exitCode?: number;
  /** DEFCON 3 Phase 2 (Gary, 2026-11-09): how long the block
   *  ran, submit → close (next-prompt detection, see
   *  src/lib/terminalBlocks.ts). Undefined while the block is
   *  still open. Git branch is NOT in scope for this build. */
  durationMs?: number;
  isCollapsed?: boolean;
  /**
   * Restored from the previous session (Gary, 2026-11-09 — command
   * history must survive a relaunch): this block was NOT run in
   * this session. It is a record for the History panel only — the
   * BlockList feed never renders restored blocks (the feed is the
   * live session's transcript; showing last session's commands as
   * if they ran now would be false). Restored blocks are always
   * complete: their run ended when the app closed.
   */
  restored?: boolean;
  
  // Warp-style validation tracking
  validation?: {
    steps: ValidationStep[];
    currentStep: number;
    status: 'running' | 'complete' | 'error';
  };
  
  // Token statistics for LLM responses
  tokens?: TokenStats;
  
  // Processing state for animated glow effect
  isProcessing?: boolean;
}

/**
 * What unlocks a gated theme. Full Glass (Gary, 2026-11-07) is the
 * referral + active purchase tier reward — it is NOT freely selectable.
 * `referralsRequired` is the referral count needed and
 * `requiresPurchaseTier` is whether an active purchase tier is needed.
 * The unlock state lives on Settings (referralCount, purchaseTierActive)
 * and is checked by isThemeUnlocked (src/themes/themes.ts); the theme
 * picker and setTheme both refuse a locked theme.
 */
export interface ThemeUnlock {
  kind: 'referral-purchase-tier';
  referralsRequired: number;
  requiresPurchaseTier: boolean;
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
  isCustom?: boolean;
  /**
   * Frosted glass throughout (Full Glass). When set, applyTheme marks
   * <html> with data-glass and index.css frosts every theme surface
   * (backdrop blur over the misty black). The theme's own bg colors
   * are translucent rgba so the mist shows through.
   */
  isGlass?: boolean;
  /** Present only on gated themes (Full Glass). Absent = freely selectable. */
  unlock?: ThemeUnlock;
}

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  // Terminal specific colors (ANSI)
  terminal: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selection: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export interface Settings {
  theme: string;
  customTheme: Theme | null;
  fontSize: number;
  fontFamily: string;
  shell: string;
  startupDirectory: string;
  cursorStyle: 'block' | 'underline' | 'bar';
  cursorBlink: boolean;
  scrollback: number;
  bellSound: boolean;
  // Mist toggles (Gary, 2026-11-09 ~08:15 PST) — the Mist section in
  // Settings holds one toggle per surface. Each toggle is its own
  // settings key, default off, and that surface renders its mist
  // only when its toggle is on. `filesMist` is the first (the Files
  // screen); the pattern is one key + one toggle + one conditional
  // render per surface, so an AI Chat mist toggle slots straight in
  // next to it. Missing keys in older persisted settings count as
  // OFF (loadSettings merges defaults over persisted).
  filesMist: boolean;
  aiModel: string;
  aiTemperature: number;
  terminalPolicy: 'ask' | 'auto' | 'deny';
  // Validation display (Warp-style)
  showValidationSteps: boolean;
  autoCollapseValidation: boolean;
  // Token display
  showTokenStats: boolean;
  showTokenEfficiency: boolean;
  // File watcher daemon
  daemonEnabled: boolean;
  daemonAutoFix: boolean;
  daemonCommitTracking: boolean;
  daemonLogRetention: number;
  daemonLogVerbosity: string;
  // Directories the file-watcher daemon monitors. Managed through
  // Settings > Daemon (and the daemon IPC); empty = nothing watched.
  daemonWatchPaths: string[];
  // Processing glow effect
  processingGlowColor: string;
  processingGlowCustomColor: string;
  processingGlowIntensity: number;
  processingGlowSpeed: number;
  // Sentinel face gaze — how focused the eyes are on the cursor (0-100).
  // 0 = the eyes ignore the cursor and stay wandering; 100 = they track
  // it closely and lock on quickly. Default 50: alive, but noticing.
  gazeSensitivity: number;
  // Homunculus (the Sentinel face) colour — purple or pink, chosen on
  // first entry to the Synth view. null = no choice yet: the picker
  // shows on entry.
  homunculusColor: HomunculusColor | null;
  // Forge stop-colour duration - how long the action face colours to
  // a stop colour when the stop is hit (Gary, 2026-11-06): a chosen
  // duration of 1-9 seconds, or until the next action. The default
  // (3 seconds) is also the Dual Unison stop-setup form default.
  // Set in Settings > Forge.
  forgeStopColorDuration: StopColorDuration;
  // Demo disclaimer choice (after the Homunculus colour) - 'build'
  // = commence building your own with Iteration 8, the creator
  // builder; 'explore' = explore the demo still. null = not
  // answered yet: the disclaimer asks once. Either stored choice
  // means it never asks again.
  synthDisclaimerChoice: SynthDisclaimerChoice | null;
  // Synth version a new build starts from, chosen in the version
  // drop-down when "build my own" is picked (Gary, 2026-11-05).
  // Iteration 8 only, for now — Lucid is the demo, not a live working
  // build yet. null = no version recorded (choice predates the
  // drop-down, or explore was chosen): Iteration 8 is the fallback.
  synthVersion: SynthVersion | null;
  // LuciferAI plugin enabled state. Default OFF (false) — see
  // src/lib/luciferAi.ts, the one source of truth: when false the
  // plugin is completely gone — blood drop, heartbeat, Help,
  // Synth surfaces, plugin commands. (AI Chat is NOT a LuciferAI
  // surface any more — it is Lucid AI, its own plugin — so
  // disabling LuciferAI does NOT remove the AI panel.) Missing
  // keys in older persisted settings count as OFF.
  luciferAiEnabled: boolean;
  // Summon variant choice (Gary, 2026-11-09 ~11:01 PST): on EVERY
  // summon activation, ask clothed vs 18+ variant — ask every time
  // until the user checks "don't ask again" after selecting one,
  // then the choice is remembered and the prompt stops. null = no
  // choice remembered yet (the dialog pre-selects the last chosen
  // variant when there is one). summonVariantDontAsk = the "don't
  // ask again" box was checked with that choice: activations then
  // use the remembered variant with no prompt. Missing keys in
  // older persisted settings count as no choice / ask every time.
  summonVariant: SummonVariant | null;
  summonVariantDontAsk: boolean;
  // Snapshot update alert dismissals (Gary, 2026-11-09 ~14:51 PST):
  // when training is done and a new snapshot is published,
  // everyone's next pull is different and the new snapshot is
  // required — an alert shows, with a "do not show again" box.
  // Checking it records THAT version here, so the alert fires
  // once per new version and never nags about a version the user
  // already dismissed; the NEXT version still alerts. The update
  // itself still proceeds (it is required) — this list only
  // silences the notice, never the update. Empty = no version
  // dismissed yet. Missing keys in older persisted settings
  // count as empty (alerts show).
  snapshotAlertDismissedVersions: string[];
  // Installed snapshot identity (Gary, 2026-11-09 ~14:51 PST):
  // the version + SHA-256 of the snapshot on this machine.
  // null = no snapshot installed (no model trained yet — the
  // honest state today). Written by the snapshot install path
  // when it lands; read by the Security tab and by the update
  // check (src/lib/snapshotUpdate.ts). The hash IS the identity:
  // the manifest check compares version AND hash.
  installedSnapshotVersion: string | null;
  installedSnapshotHash: string | null;
  // LuciferAI silenced state (Gary, 2026-11-08 ~02:28 PST): the
  // blood drop toggle is JUST a silencer — it silences LuciferAI's
  // own voices but does NOT stop the runtime. LuciferAI's OWN
  // causal ticks FREEZE while silenced (never reset or
  // re-numbered, they resume from the frozen count on
  // un-silence); the runtime itself keeps running underneath.
  // AI Chat ticks are a SEPARATE path (Lucid AI, not a LuciferAI
  // surface) and are NOT gated by silenced, so they keep running
  // — that is by design (see src/lib/luciferAi.ts), not a gap.
  // Silenced = the drop greys out but stays visible and clickable
  // (clicking un-silences). This is SEPARATE from luciferAiEnabled:
  // the drop disappears ONLY when LuciferAI is off via the
  // Settings toggle (Settings → Plugins). Default false
  // (speaking). Missing keys in older persisted settings count
  // as NOT silenced.
  luciferAiSilenced: boolean;
  // Dev mode (Gary, 2026-11-07): delinks the terminal prompt bar
  // from the terminal screen. OFF (default) is topology-synced —
  // the prompt section and the xterm surface share one input
  // topology (clicking the prompt section focuses the terminal,
  // typing always lands in the shell, Warp-style). ON renders a
  // detached command bar in the prompt section with its own input
  // and dev console; it never writes to the terminal screen and
  // never reads the terminal's cwd. Orthogonal to LuciferAI: the
  // dev bar works with the plugin on or off. Missing keys in older
  // persisted settings count as OFF.
  devMode: boolean;
  // DEFCON level (Gary, 2026-11-09 — see src/lib/defcon.ts):
  // the devmode readiness state, 1–3. DEFCON 1 = NOW, the war
  // zone, the terminal as it stands. DEFCON 2 = terminal merged
  // with splashback in devmode. DEFCON 3 = the prompter, when we
  // get it all sorted out. Levels are readiness milestones — they
  // gate nothing — and change only on Gary's explicit order (the
  // `/defcon` command). CORRECTION (Gary, 2026-11-09 ~04:24 PST):
  // the DEFCONs take effect in NON-devmode — that is the point.
  // Devmode is where they were understood; non-devmode (the main
  // Warp-style terminal) is where they take effect. The level is
  // visible on the main terminal, not locked inside devmode.
  // Default 1. Missing keys in older persisted settings count
  // as 1.
  defconLevel: DefconLevel;
  // DEFCON 2 merge reading (Gary, 2026-11-09): which reading of
  // "terminal merged with splashback" Gary picked — (a) terminal
  // over mist (already true in devmode), (b) mist as the
  // terminal's direct background, or (c) one surface. null =
  // not picked yet (set with `/defcon merge a|b|c`). Picking a
  // reading does NOT perform the merge — that is a separate
  // build step Gary calls.
  defconMergeReading: DefconMergeReading | null;
  // Full Glass unlock state (Gary, 2026-11-07) — the referral +
  // active purchase tier reward theme. `referralCount` is how many
  // successful referrals this user has; `purchaseTierActive` is
  // whether they currently hold an active purchase tier. Both feed
  // isThemeUnlocked (src/themes/themes.ts). There is no referral /
  // purchase server in Lucid yet, so these are set by the referral
  // and purchase flows when they exist; until then they default to
  // 0 / false and Full Glass stays locked. They are persisted like
  // any other setting.
  referralCount: number;
  purchaseTierActive: boolean;
  // Permission grants (Gary, 2026-11-07 ~02:47 PST) — the record
  // of what the user once allowed (see src/lib/permissions.ts).
  // MEMORY, NOT TRUTH: the live probe is what counts; a recorded
  // 'granted' never overrides a live 'denied' (the user may have
  // revoked it in System Settings since). Written whenever a probe
  // runs; shown in the UI only marked stale, never as current.
  // Empty = nothing recorded yet.
  permissionGrants: import('../lib/permissions').PermissionGrants;
  // Custom plugins — which user-registered plugins (see
  // src/data/customPlugins.ts) are enabled. Keyed by custom plugin id;
  // a missing key means disabled (custom plugins are opt-in, unlike
  // the built-in toolbar plugins below). Empty = none enabled.
  customPlugins: Record<string, boolean>;
  // Toolbar plugins — which plugins show as buttons in the icon bar,
  // in the plugins section above Settings. Keyed by plugin id; a missing
  // key falls back to that plugin's defaultOnToolbar. Empty = all defaults.
  toolbarPlugins: Record<string, boolean>;
  // Toolbar icon order — the drag-reorderable order of the icon bar
  // (Gary, 2026-11-06): an array of icon ids ('terminal', 'editor',
  // 'explorer', 'chats', 'synth', 'ai-chat', 'llmbuilder', 'settings')
  // plus the 'spacer' gap entry (see src/lib/toolbarOrder.ts). Written
  // IMMEDIATELY on drop (updated AND stored, not updated-only) via
  // updateSetting, and loaded on startup. Empty = the default order.
  toolbarOrder: string[];
  // Settings tab order — the drag-reorderable order of the Settings
  // panel tabs (Gary, 2026-11-06): an array of tab ids
  // ('appearance', 'customization', 'plugins', 'devices', 'forge',
  // 'modules', 'models', 'terminal', 'ai', 'daemon', 'general')
  // (see src/lib/settingsTabOrder.ts). Written IMMEDIATELY on drop
  // (updated AND stored, not updated-only) via updateSetting, and
  // loaded on startup. Empty = the default order.
  settingsTabOrder: string[];
  // Settings tab lock — when true the Settings tabs cannot be dragged
  // to reorder (Gary, 2026-11-06). The lock only prevents accidental
  // drags: the order is still persisted whenever it changes, locked
  // or not. Default false (unlocked) so a new user can reorder.
  settingsTabsLocked: boolean;
  // Computer-control segment lock (Gary, 2026-11-06) — the
  // kill-switch for the pre-installed, agent-only computer-control
  // segment (see src/lib/computerControl.ts). When true, every
  // action is refused BEFORE anything runs (a 423-style refusal);
  // observing the screen still works. The toggle itself is never
  // blocked — it is always the way back out. The main process reads
  // this fresh from the persisted settings on every action, so the
  // renderer cannot spoof it. Default false (unlocked) — the phone
  // finger's pattern: a finger starts enabled, Gary locks it
  // explicitly.
  computerControlLocked: boolean;
  /** Browser finger lock (Phase B) — the phone-finger pattern:
   * the browser finger starts enabled, Gary locks it explicitly.
   * While locked, no agent may take the browser finger. */
  browserFingerLocked: boolean;
  // Computer-control protected targets — window/tab title substrings
  // that are off-limits (never navigated, closed, or typed into).
  // Default: Gary's ChatGPT tab ("Next Starship Steps").
  computerControlProtectedTargets: string[];
  // User-installed add-ons (Gary, 2026-11-06) — the ids of the add-ons
  // the user installed from Settings > Plugins (see
  // src/data/pluginAddons.ts). Written immediately on Install via
  // updateSetting (updated AND stored, not updated-only) and loaded
  // on startup. Empty = none installed. Anchor-installed add-ons
  // (Android Connect, Segments) are NOT listed here — their installed
  // state derives from their anchor, not from this list.
  installedAddons: string[];
  // Persona Plex (Gary, 2026-11-06) — personas + Speak. All local,
  // no servers. Custom personas created on the Persona Plex setup
  // page (full records — they have no Python source). Per-persona
  // setup for soul-derived personas (voice + tool allowlist, keyed
  // by soul id — the name/rarity/level come from the Python soul
  // config at read time, never stored here). The active persona
  // (whose voice Speak uses). The Speak toggle (right-click Speak
  // in AI chat shows only when this is ON and Persona Plex is
  // installed). All written immediately via updateSetting (updated
  // AND stored) and loaded on startup. Empty = no custom personas,
  // no overrides, no active persona, Speak off.
  personaPlexCustomPersonas: Persona[];
  personaPlexConfig: Record<string, PersonaConfig>;
  personaPlexActiveId: string | null;
  personaPlexSpeakEnabled: boolean;
  /** The Speak actor picked in the right-click menu (Gary,
   *  2026-11-07): a voice name, e.g. 'Fred'. Null = no actor
   *  picked — Speak uses the default, the active Homunculus's
   *  voice (see resolveDefaultSpeakVoice in
   *  src/lib/personaPlex.ts). Written immediately via
   *  updateSetting when an actor is picked, loaded on startup. */
  speakActorVoice: string | null;
  // Ping server (test path) — the Cloudflare Worker that fronts a
  // free Workers AI model for Lucid's API streams
  // (ARC-Neuron-LLMBuilder/cloudflare/ping-server). Disabled by
  // default; when enabled, AI chat routes to the Worker instead of the
  // local backend / OpenAI. pingServerUserId is the per-install id the
  // quota (SP balance) keys off — generated once, stored here.
  pingServerEnabled: boolean;
  pingServerEndpoint: string;
  pingServerUserId: string;
  // Google Drive segment (Gary, 2026-11-08): the Google OAuth
  // client ID for the Drive sign-in. A public identifier, not a
  // secret — no client secret is stored (the desktop sign-in uses
  // PKCE, so there is no secret to keep). Empty until Gary supplies
  // one: create a Google Cloud project, create an OAuth client ID
  // of type Desktop app, and store the client ID here.
  googleDriveClientId: string;
  // Telegram segment (Gary, 2026-11-08): the username of the
  // user's Telegram bot (created in BotFather), captured when the
  // bot token is verified with a real getMe call. A public
  // identifier, not a secret — the token itself is stored
  // encrypted in secureStorage (telegram-bot-token) and never
  // lives in Settings.
  telegramBotUsername: string;
  // Stripe segment (Gary, 2026-11-08): the id and display name
  // of the user's Stripe account, captured when the API key is
  // verified with a real GET /v1/account call. Public
  // identifiers, not secrets — the key itself is stored
  // encrypted in secureStorage (stripe-api-key) and never lives
  // in Settings. A restricted key is best (least privilege); a
  // full secret key also works.
  stripeAccountId: string;
  stripeAccountName: string;
}

/** SP balance for the Lucid ping server (Cloudflare Worker).
 * limit = SP cap (200, or 250 once the balance reaches 200);
 * remaining = SP left; reset = unix seconds of the next SP refill;
 * reset_in_seconds = seconds until then. The Worker sends
 * it as x-ratelimit-* headers on chat responses and in the /ping body.
 * Defined once here; the main-process client, preload, and renderer all
 * import this type. */
export interface PingQuota {
  limit: number;
  remaining: number;
  reset: number;
  reset_in_seconds: number;
}

/** What the ping server's public root (GET /) reports — the
 *  server-side tracking data the Security tab pulls for Gary
 *  (admin) (Gary, 2026-11-09 ~15:04 PST). The Worker publishes
 *  this on GET / (ARC-Neuron-LLMBuilder/cloudflare/ping-server/
 *  worker.js): service identity, the model, the mode, the
 *  maintenance view (or null when the server is up), and the
 *  server caps (neurons 10,000/day, requests 100,000/day,
 *  24h maintenance). What GET / does NOT report — today's
 *  neuron/request usage — lives in the Worker's usage DO,
 *  which has NO public route ("The Worker is the only caller
 *  ... there is no public route to this DO"), so the tab shows
 *  usage as not yet available, never an invented number.
 *  Defined once here; the main-process client, preload, and
 *  renderer all import this type. */
export interface PingServerStatus {
  ok: boolean;
  service?: string;
  version?: string;
  model?: string;
  mode?: string;
  /** The public maintenance view, or null when the server is
   *  up (or the usage DO is unreachable). `reason` is the
   *  server's where + why (e.g. neurons_exhausted);
   *  `back_in_seconds` is how long until it is back. */
  maintenance?: {
    reason?: string;
    detail?: string;
    back_in_seconds?: number;
  } | null;
  server_caps?: {
    neurons_per_day?: number;
    requests_per_day?: number;
    maintenance_hours?: number;
  };
}

export interface DaemonLogEntry {
  id: string;
  timestamp: number;
  type: 'file_change' | 'auto_fix' | 'error' | 'success';
  file: string;
  directory: string;
  action: string;
  status: 'success' | 'failed' | 'pending';
}

/** Window-relative rect (CSS px) of the BrowserView container. */
export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Live state of one browser tab, pushed by the main process. */
export interface BrowserTabState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

/** An HTTP-auth challenge from a page in the in-panel browser.
 * Main sends one per `login` event; the renderer shows Gary a
 * prompt and answers via `browser:auth-response` with the typed
 * credentials, or null when he cancels (no silent retry). */
export interface BrowserAuthRequest {
  /** Unique id for this challenge (answers carry it back). */
  id: string;
  /** The browser tab whose page asked for auth. */
  tabId: string;
  /** URL of the page that asked. */
  url: string;
  /** Host the credentials are for. */
  host: string;
  /** Auth realm, when the server sent one. */
  realm?: string;
}

/** Result of a find-in-page search, pushed by the main process. */
export interface BrowserFindResult {
  /** 1-based ordinal of the active match (0 when there is none). */
  activeMatchOrdinal: number;
  /** Total matches on the page. */
  matches: number;
}

/** Lifecycle of one browser download, as the shelf shows it. */
export type BrowserDownloadState =
  | 'progressing'
  | 'completed'
  | 'cancelled'
  | 'interrupted';

/** One browser download, pushed by the main process as
 * `browser:download-updated` events. */
export interface BrowserDownload {
  /** `browser-download-N`, assigned in arrival order. */
  id: string;
  /** URL the download came from. */
  url: string;
  /** Sanitised file name (no path, no control characters). */
  filename: string;
  /** Full path the file is being written to. */
  savePath: string;
  receivedBytes: number;
  /** Total bytes, or 0/-1 when the server did not send a length. */
  totalBytes: number;
  state: BrowserDownloadState;
}

/** A saved login, as the renderer ever sees it: origin + username
 * only. The password lives encrypted in the main-process vault and
 * never crosses IPC to the renderer. */
export interface BrowserSavedLogin {
  /** Origin the login belongs to (`https://example.com`). */
  origin: string;
  username: string;
  /** ISO timestamp of the last save. */
  updatedAt: string;
}

/** A login the main process captured from a page Gary just signed
 * in on: origin + username only. The password stays in main's
 * memory until Gary confirms the save, and is never sent to the
 * renderer. */
export interface BrowserLoginOffer {
  origin: string;
  username: string;
}


/** Result of one page action (Area 4). `ok: false` carries a typed
 * `error` instead of throwing: `bad-selector`, `bad-value`,
 * `not-found`, `not-fillable`, `password-field`, `timeout`,
 * `unavailable`, `script-failed`, `capture-failed`, `bad-result`,
 * `no-such-tab`. */
export interface BrowserActionResult {
  ok: boolean;
  error?: string;
}

/** Visible text of a page, as `readText` returns it. Text is
 * capped in main (MAX_ACTION_TEXT_CHARS) so a huge page cannot
 * flood the caller. */
export interface BrowserPageText {
  title: string;
  url: string;
  text: string;
}

/** One field of a page form, as `getState` reports it. Password
 * fields are reported as present but their values are never read. */
export interface BrowserPageFormField {
  name: string;
  type: string;
  label: string;
  autocomplete: string;
  hasValue: boolean;
}

/** One form on the page. */
export interface BrowserPageForm {
  action: string;
  method: string;
  fields: BrowserPageFormField[];
}

/** Page description, as `getState` returns it. */
export interface BrowserPageState {
  url: string;
  title: string;
  loading: boolean;
  forms: BrowserPageForm[];
}

/** Screenshot result: a PNG data URL of the page as Gary sees it. */
/** Flow definitions and events (Area 7) — the domain types live
 * in src/lib/browserFlows.ts; re-exported here for the renderer. */
import type {
  FlowApprovalRequest,
  FlowDefinition,
  FlowProgressEvent,
  FlowRunStatus,
  FlowStep,
} from '../lib/browserFlows';
export type {
  FlowApprovalRequest,
  FlowDefinition,
  FlowProgressEvent,
  FlowRunStatus,
  FlowStep,
};

/** CDP Tier 2 diagnostics (Area 8): what the debugger session
 * observed on a tab — failed requests, HTTP errors, console
 * errors, uncaught exceptions. */
export interface CdpNetworkFailure {
  url: string;
  status?: number;
  errorText?: string;
  at: number;
}

export interface CdpConsoleError {
  text: string;
  at: number;
}

export interface CdpDiagnostics {
  networkFailures: CdpNetworkFailure[];
  consoleErrors: CdpConsoleError[];
}

/** A held permission request (Area 9): a page wants a
 * capability its origin is not allowed yet. The panel asks
 * Gary; the page waits for his answer. */
export interface BrowserPermissionRequest {
  origin: string;
  permission: string;
}

export interface BrowserScreenshotResult extends BrowserActionResult {
  dataUrl?: string;
}

/** Browser diagnostics for the active tab (no tab id needed):
 * where the view is attached, its bounds, the window's bounds
 * and focus, plus a capturePage screenshot saved to disk. */
export interface BrowserDiagnoseResult {
  ok: boolean;
  diagnose?: {
    tabId: string | null;
    url: string | null;
    title: string | null;
    loading: boolean;
    attachedToMain: boolean;
    attachedToMini: boolean;
    bounds: { x: number; y: number; width: number; height: number } | null;
    lastBounds: { x: number; y: number; width: number; height: number } | null;
    windowBounds: { x: number; y: number; width: number; height: number } | null;
    windowFocused: boolean;
    windowVisible: boolean;
    viewCount: number;
  };
  screenshotPath?: string;
  screenshotError?: string;
  error?: string;
}

/** A Persona Plex persona — one identity inside the Plex (Gary,
 *  2026-11-06). A persona is either a Python soul (source 'soul',
 *  read live from the Python soul config ~/.luciferai/data/souls.json
 *  — the name, rarity and level come from the soul, never stored in
 *  TS) or a custom persona created on the Persona Plex setup page
 *  (source 'custom', stored in the `personaPlexCustomPersonas`
 *  setting). The voice and tool allowlist are the persona's own
 *  setup, stored per persona (see PersonaConfig). */
export interface Persona {
  /** Stable id — the Python soul id for a soul persona, or a
   *  `custom-…` id for a custom persona. */
  id: string;
  name: string;
  description: string;
  source: 'soul' | 'custom';
  /** The Python soul id, when source is 'soul'. */
  soulId?: string;
  /** Soul rarity (common / uncommon / angelic / demonic / celestial),
   *  when from a soul. */
  rarity?: string;
  /** Soul level, when from a soul. */
  level?: number;
  /** Voice for Speak (TTS) — a voice name, e.g. 'Lily'. */
  voice: string;
  /** Which Homunculus this persona is paired to (the persona's
   *  voice is that Homunculus's voice). Null = not paired; the
   *  Homunculus falls back to the default voice. */
  homunculusId: string | null;
  /** Whether this persona's messages can be spoken (Speak). When
   *  false, Speak does not appear for this persona's messages even
   *  when the global Speak toggle is on. */
  speakEnabled: boolean;
  /** Whether this persona's messages speak automatically when they
   *  arrive (auto-speak). When false, they only speak on right-click
   *  Speak. */
  autoSpeak: boolean;
  /** TTS volume for this persona's voice (0-1). */
  volume: number;
  /** TTS rate (speed) for this persona's voice (0.5-2). */
  rate: number;
  /** Tool ids this persona may use (see src/lib/personaPlex.ts
   *  PERSONA_TOOLS). Enforced locally by isToolAllowedForPersona. */
  allowedTools: string[];
}

/** Per-persona setup for a soul-derived persona — the voice and
 *  tool allowlist, stored in the `personaPlexConfig` setting keyed
 *  by soul id. The name, rarity and level are NOT stored here; they
 *  come from the Python soul config at read time. */
export interface PersonaConfig {
  voice: string;
  allowedTools: string[];
  homunculusId: string | null;
  speakEnabled: boolean;
  autoSpeak: boolean;
  volume: number;
  rate: number;
}

export type View = 'terminal' | 'editor' | 'settings' | 'synth' | 'forge' | 'persona-plex';

/** Google Drive IPC result + redirect — mirrors GoogleDriveIpcResult
 *  / GoogleDriveAuthRedirect in src/lib/googleDriveAuth.ts. Defined
 *  here, not imported from there, because the electron project must
 *  not import from src/ (TS6307) and this file is pulled into the
 *  electron build via preload — an import would drag
 *  googleDriveAuth.ts into tsconfig.node.json and add errors there.
 *  Keep the two identical by hand. */
export type GoogleDriveIpcError =
  | 'already-running'
  | 'listener-failed'
  | 'no-client-id'
  | 'empty'
  | 'network'
  | 'bad-response'
  | 'invalid-grant'
  | 'invalid-client'
  | 'invalid-request'
  | 'server'
  | 'not-connected'
  | 'token-expired'
  | 'unauthorized'
  | 'forbidden';

export type GoogleDriveIpcResult =
  | { ok: true }
  | { ok: false; error: GoogleDriveIpcError };

export type GoogleDriveAuthRedirect =
  | { ok: true; code: string; state: string }
  | {
      ok: false;
      error:
        | 'denied'
        | 'missing-code'
        | 'missing-state'
        | 'bad-url'
        | 'timeout'
        | 'listener-failed';
    };

// Extend Window interface for Electron API
declare global {
  interface Window {
    lucidAPI: {
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
        onMaximizedChange: (callback: (maximized: boolean) => void) => void;
        create: () => void;
      };
      fs: {
        readDir: (dirPath: string, options?: { depth?: number }) => Promise<FileEntry[]>;
        readFile: (filePath: string) => Promise<string>;
        writeFile: (filePath: string, content: string) => Promise<void>;
        createFile: (filePath: string, content?: string) => Promise<void>;
        createDir: (dirPath: string) => Promise<void>;
        delete: (targetPath: string) => Promise<void>;
        rename: (oldPath: string, newPath: string) => Promise<void>;
        exists: (targetPath: string) => Promise<boolean>;
        getStats: (targetPath: string) => Promise<FileStats>;
        openInExplorer: (targetPath: string) => Promise<void>;
        selectDirectory: () => Promise<string | null>;
        selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
        getHomeDir: () => Promise<string>;
      };
      terminal: {
        create: (id: string, cwd?: string) => Promise<void>;
        write: (id: string, data: string) => void;
        resize: (id: string, cols: number, rows: number) => void;
        destroy: (id: string) => void;
        onData: (callback: (id: string, data: string) => void) => () => void;
        onExit: (callback: (id: string, code: number) => void) => () => void;
        onCwd: (callback: (id: string, cwd: string) => void) => () => void;
        getCwd: (id: string) => Promise<string>;
        executeCommand: (command: string) => Promise<{ success: boolean; output?: string; error?: string }>;
      };
      ai: {
        chat: (messages: { role: string; content: string }[], contextDirectory?: string, stream?: boolean, options?: { model?: string; modelSource?: 'local' | 'openai' | 'ping'; chatId?: string }) => Promise<string>;
        onStream: (callback: (chunk: string) => void) => () => void;
        onStreamEnd: (callback: (quota?: PingQuota) => void) => () => void;
        onStreamError: (callback: (error: string) => void) => () => void;

        cancelStream: () => void;
        hasApiKey: () => Promise<boolean>;
        checkLocalBackend: () => Promise<boolean>;
        pingServerHealth: () => Promise<{ ok: boolean; service?: string; model?: string; mode?: string; quota: PingQuota | null }>;
        pingServerStatus: () => Promise<PingServerStatus>;
        getSessions: () => Promise<ChatSession[]>;
        saveSession: (session: ChatSession) => Promise<void>;
        deleteSession: (id: string) => Promise<void>;
        clearSessions: () => Promise<void>;
      };
      system: {
        checkNetwork: () => Promise<{ online: boolean }>;
      };
      computerControl: {
        getState: () => Promise<
          import('../lib/computerControl').ComputerControlSegmentState
        >;
        listApps: () => Promise<
          import('../lib/computerControl').ComputerControlAppWindow[]
        >;
        observe: (
          targetId: string | null,
        ) => Promise<import('../lib/computerControl').ComputerControlObservation>;
        action: (
          action: import('../lib/computerControl').ComputerControlAction,
        ) => Promise<import('../lib/computerControl').ComputerControlActionResult>;
      };
      browser: {
        create: (tabId: string, url: string) => Promise<void>;
        close: (tabId: string) => Promise<void>;
        activate: (tabId: string, bounds: BrowserBounds) => Promise<void>;
        hide: () => Promise<void>;
        setBounds: (bounds: BrowserBounds) => Promise<void>;
        navigate: (tabId: string, url: string) => Promise<void>;
        goBack: (tabId: string) => Promise<void>;
        goForward: (tabId: string) => Promise<void>;
        reload: (tabId: string) => Promise<void>;
        onUpdated: (callback: (tabId: string, state: BrowserTabState) => void) => () => void;
        onOpenUrl: (callback: (url: string) => void) => () => void;
        onAuthRequired: (callback: (request: BrowserAuthRequest) => void) => () => void;
        authResponse: (requestId: string, creds: { username: string; password: string } | null) => Promise<void>;
        findInPage: (tabId: string, text: string, options?: { forward?: boolean; findNext?: boolean; matchCase?: boolean }) => Promise<number>;
        stopFindInPage: (tabId: string, action?: 'clearSelection' | 'keepSelection' | 'activateSelection') => Promise<void>;
        onFindUpdated: (callback: (tabId: string, result: BrowserFindResult) => void) => () => void;
        setZoom: (tabId: string, factor: number) => Promise<number>;
        openExternal: (url: string) => Promise<void>;
        listDownloads: () => Promise<BrowserDownload[]>;
        cancelDownload: (id: string) => Promise<boolean>;
        pauseDownload: (id: string) => Promise<boolean>;
        resumeDownload: (id: string) => Promise<boolean>;
        showDownloadInFolder: (id: string) => Promise<boolean>;
        onDownloadUpdated: (callback: (update: BrowserDownload) => void) => () => void;
        listSavedLogins: () => Promise<BrowserSavedLogin[]>;
        deleteSavedLogin: (origin: string) => Promise<boolean>;
        /** Persist the in-memory candidate for this origin (the
         * password never crosses IPC — main already holds it). */
        saveLogin: (origin: string, username: string) => Promise<boolean>;
        dismissLoginOffer: (origin: string) => Promise<void>;
        /** Fill the active tab's page from the vault. */
        fillSavedLogin: () => Promise<boolean>;
        onLoginDetected: (callback: (offer: BrowserLoginOffer) => void) => () => void;
        readText: (tabId: string) => Promise<BrowserActionResult & { text?: BrowserPageText }>;
        fill: (tabId: string, selector: string, value: string) => Promise<BrowserActionResult>;
        click: (tabId: string, selector: string) => Promise<BrowserActionResult>;
        waitForSelector: (tabId: string, selector: string, timeoutMs?: number) => Promise<BrowserActionResult>;
        screenshot: (tabId: string) => Promise<BrowserScreenshotResult>;
        getState: (tabId: string) => Promise<BrowserActionResult & { state?: BrowserPageState }>;
        popOut: (tabId: string) => Promise<BrowserActionResult>;
        popIn: (tabId: string) => Promise<BrowserActionResult>;
        setMiniBounds: (bounds: BrowserBounds) => Promise<void>;
        closeMini: () => Promise<void>;
        miniOpenInternal: () => Promise<void>;
        onMiniState: (callback: (tabId: string, state: BrowserTabState) => void) => () => void;
        onMiniClosed: (callback: (tabId: string) => void) => () => void;
        onOpenInternalPhone: (callback: () => void) => () => void;
        onFocusAddressBar: (callback: () => void) => () => void;
        // Agent browser (Phase B): live agent state, Gary's stop /
        // take-control surface, the finger lock, and the queue.
        onAgentState: (callback: (state: import('../lib/browserAgent').BrowserAgentStateSnapshot) => void) => () => void;
        stopAgentBrowser: () => Promise<{ ok: boolean }>;
        takeAgentControl: () => Promise<{ ok: boolean }>;
        giveBackAgentControl: () => Promise<{ ok: boolean }>;
        setBrowserFingerLocked: (locked: boolean) => Promise<{ ok: boolean }>;
        getAgentState: () => Promise<{ ok: boolean; state: import('../lib/browserAgent').BrowserAgentStateSnapshot | null }>;
        requestBrowserFinger: (holderId: string) => Promise<{ ok: boolean; granted?: boolean; position?: number | null; reason?: string; error?: string }>;
        releaseBrowserFinger: (holderId: string) => Promise<{ ok: boolean; nextHolder?: string | null; error?: string }>
    startFlow: (definition: FlowDefinition, tabId: string) => Promise<{ ok: boolean; flowId?: string; error?: string; errors?: string[] }>;
    stopFlow: (flowId: string) => Promise<{ ok: boolean; error?: string }>;
    approveFlowStep: (flowId: string) => Promise<{ ok: boolean; error?: string }>;
    rejectFlowStep: (flowId: string) => Promise<{ ok: boolean; error?: string }>;
    onFlowProgress: (callback: (event: FlowProgressEvent) => void) => () => void;
    onFlowApprovalNeeded: (callback: (request: FlowApprovalRequest) => void) => () => void;
    trustedClick: (tabId: string, selector: string) => Promise<BrowserActionResult>;
    getCdpDiagnostics: (tabId: string) => Promise<{ ok: boolean; diagnostics?: CdpDiagnostics; error?: string }>;
    diagnoseActive: () => Promise<BrowserDiagnoseResult>;
    savePage: (tabId: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    answerPermission: (origin: string, permission: string, decision: 'once' | 'always' | 'deny') => Promise<{ ok: boolean; error?: string }>;
    listPermissions: () => Promise<{ ok: boolean; allowlist: Record<string, string[]> }>;
    revokePermission: (origin: string, permission: string) => Promise<{ ok: boolean; allowlist: Record<string, string[]> }>;
    onPermissionRequested: (callback: (request: BrowserPermissionRequest) => void) => () => void;
      };
      android: {
        getGpuGate: () => Promise<GpuGateStatus>;
        listDevices: () => Promise<{ devices: { serial: string; state: string }[]; error?: string }>;
        getCapacity: () => Promise<{ internalLoaded: number; externalConnected: number; summary: string }>;
        connectExternal: (serial: string) => Promise<{ ok: boolean; reason?: string; error?: string }>;
        loadInternal: (serial: string) => Promise<{ ok: boolean; reason?: string; error?: string }>;
        disconnect: (serial: string) => Promise<boolean>;
        startStream: (serial: string) => Promise<{ ok: boolean; error?: string }>;
        stopStream: (serial: string) => Promise<{ ok: boolean; error?: string }>;
        touch: (serial: string, msg: TouchMessage) => Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
        getMetrics: (serial?: string) => Promise<StreamMetricsSnapshot | null>;
        reportDecodePath: (serial: string, decodePath: DecodePath) => Promise<void>;
        onFrame: (callback: (serial: string, chunk: Uint8Array) => void) => () => void;
        onDeviceState: (callback: (serial: string, state: string, error?: string) => void) => () => void;
      };
      devices: {
        list: () => Promise<DevicesListResult>;
      };
      googleDrive: {
        startListener: () => Promise<GoogleDriveIpcResult>;
        stopListener: () => Promise<{ ok: true }>;
        exchangeCode: (code: string, codeVerifier: string) => Promise<GoogleDriveIpcResult>;
        hasTokens: () => Promise<boolean>;
        disconnect: () => Promise<{ ok: true }>;
        verifyConnection: () => Promise<GoogleDriveIpcResult>;
        onAuthRedirect: (callback: (result: GoogleDriveAuthRedirect) => void) => () => void;
      };
      cursor: {
        onGlobalPoint: (callback: (x: number, y: number) => void) => () => void;
      };
      daemon: {
        start: () => Promise<{ success: boolean; alreadyRunning?: boolean; pid?: number; mode?: 'watch' | 'autofix'; paths?: string[]; commitTracking?: boolean; error?: string }>;
        stop: () => Promise<{ success: boolean; error?: string }>;
        status: () => Promise<{ running: boolean; pids: string[]; mode: 'watch' | 'autofix' | null; paths: string[]; commitTracking: boolean }>;
        setCommitTracking: (enabled: boolean) => Promise<{ commitTracking: boolean; restarted: boolean }>;
        getPaths: () => Promise<string[]>;
        addPath: (dirPath: string) => Promise<{ paths: string[]; restarted: boolean }>;
        removePath: (dirPath: string) => Promise<{ paths: string[]; restarted: boolean }>;
        getLogs: () => Promise<DaemonLogEntry[]>;
      };
      settings: {
        get: <T>(key: string) => Promise<T>;
        set: (key: string, value: unknown) => Promise<void>;
        getAll: () => Promise<Record<string, unknown>>;
        setApiKey: (key: string) => Promise<void>;
        hasApiKey: () => Promise<boolean>;
        deleteApiKey: () => Promise<void>;
        setPingKey: (key: string) => Promise<void>;
        hasPingKey: () => Promise<boolean>;
        deletePingKey: () => Promise<void>;
        setTelegramBotToken: (token: string) => Promise<void>;
        hasTelegramBotToken: () => Promise<boolean>;
        deleteTelegramBotToken: () => Promise<void>;
        setStripeApiKey: (key: string) => Promise<void>;
        hasStripeApiKey: () => Promise<boolean>;
        deleteStripeApiKey: () => Promise<void>;
        getStorageStatus: () => Promise<{ degraded: boolean; reason: string | null }>;
        export: () => Promise<string>;
        import: (data: string) => Promise<void>;
      };
      lucid: {
        init: () => Promise<{ success: boolean; error?: string }>;
        command: (userInput: string) => Promise<any>;
        getHistory: () => Promise<any[]>;
        clearHistory: () => Promise<void>;
        getFixNetStats: () => Promise<any>;
        getModelStatuses: () => Promise<Record<string, boolean>>;
        getTokenStats: () => Promise<any>;
        changeDirectory: (newDir: string) => Promise<void>;
        getWorkingDirectory: () => Promise<string>;
        getWelcome: () => Promise<string>;
        getHelp: () => Promise<string>;
        workflowStatus: () => Promise<any>;
        fixnetSearch: (query: string) => Promise<any>;
        llmList: () => Promise<any>;
        llmSetEnabled: (model: string, enabled: boolean) => Promise<any>;
        getUserId: () => Promise<{ success: boolean; userId?: string; isPermanent?: boolean; githubUsername?: string; storagePath?: string; error?: string }>;
        // Phase 2: Model Installation
        installModel: (modelName: string) => Promise<{ success: boolean; output?: string; error?: string }>;
        uninstallModel: (modelName: string) => Promise<{ success: boolean; output?: string; error?: string }>;
        installTier: (tier: number) => Promise<{ success: boolean; output?: string; error?: string }>;
        installCoreModels: () => Promise<{ success: boolean; output?: string; error?: string }>;
        getStorageInfo: () => Promise<{ success: boolean; storage: { used: string; available: string }; error?: string }>;
        checkModelsInstalled: () => Promise<{ installed: boolean; files: { name: string; path: string; sizeBytes: number }[]; dirsChecked: string[]; errors: string[] }>;
        installTinyLlama: () => Promise<{ success: boolean; modelPath?: string; output?: string; error?: string }>;
        onInstallTinyLlamaProgress: (callback: (line: string) => void) => () => void;
        // Phase 2: FixNet Auto-Fix
        fixScript: (filepath: string) => Promise<{ success: boolean; fixCount?: number; output?: string; error?: string }>;
        // Phase 2: GitHub Integration
        githubLink: () => Promise<{ success: boolean; url?: string; output?: string; error?: string }>;
        githubUnlink: () => Promise<{ success: boolean; output?: string; error?: string }>;
        githubStatus: () => Promise<{ success: boolean; linked?: boolean; username?: string; output?: string; error?: string }>;
        githubUpload: () => Promise<{ success: boolean; repoUrl?: string; output?: string; error?: string }>;
        githubUpdate: () => Promise<{ success: boolean; output?: string; error?: string }>;
        githubProjects: () => Promise<{ success: boolean; projects?: any[]; output?: string; error?: string }>;
        // Phase 2: Environment Management
        listEnvironments: () => Promise<{ success: boolean; environments?: any[]; output?: string; error?: string }>;
        searchEnvironment: (query: string) => Promise<{ success: boolean; environment?: any; output?: string; error?: string }>;
        activateEnvironment: (name: string) => Promise<{ success: boolean; output?: string; error?: string }>;
        // Phase 2: System Commands
        systemInfo: () => Promise<{ success: boolean; output?: string; error?: string }>;
        memoryStats: () => Promise<{ success: boolean; output?: string; error?: string }>;
        mainMenu: () => Promise<{ success: boolean; output?: string; error?: string }>;
      };
      llmbuilder: {
        status: () => Promise<LlmbuilderStatus>;
        setup: () => Promise<{ ok: boolean; message: string }>;
        startRun: (params: StartRunParams) => Promise<LlmbuilderRunInfo>;
        cancelRun: (runId: string) => Promise<{ ok: boolean }>;
        listRuns: () => Promise<LlmbuilderRunInfo[]>;
        getScoreboard: () => Promise<ScoreboardRow[] & { raw?: Record<string, unknown> }>;
        getPromotionDecision: (candidate: string) => Promise<PromotionDecision | null>;
        installBrain: (
          homunculusId: string,
          candidate: string,
        ) => Promise<InstallBrainResult>;
        rollback: (homunculusId: string) => Promise<InstallBrainResult>;
        getRoster: () => Promise<Homunculus[] | null>;
        saveRoster: (roster: Homunculus[]) => Promise<void>;
        importDataset: (
          name: string,
          jsonl: string,
        ) => Promise<ImportDatasetResult>;
        askBrain: (
          homunculusId: string,
          prompt: string,
        ) => Promise<BrainAnswer | null>;
        onProgress: (
          callback: (event: LlmbuilderProgressEvent) => void,
        ) => () => void;
      };
    };
  }
}
