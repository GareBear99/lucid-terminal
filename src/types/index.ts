// Re-export preload types
import type {
  DecodePath,
  GpuGateStatus,
  StreamMetricsSnapshot,
  TouchMessage,
} from '../phone/streaming';
import type { HomunculusColor } from '../lib/homunculusColor';
import type {
  Homunculus,
  ScoreboardRow,
} from '../lib/homunculi';
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
import type { SynthDisclaimerChoice } from '../lib/synthDisclaimer';

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
   * The next ritual tick to assign in this chat. Persisted with the
   * session (it round-trips through sessions.json) so the counter
   * survives a reload and never restarts from zero and collides with
   * ticks already on the chat's bubbles. Each chat has its own
   * sequence — a tick in one chat never orders against a tick in
   * another.
   */
  nextTick?: number;
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
  isCollapsed?: boolean;
  
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

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
  isCustom?: boolean;
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
  // Demo disclaimer choice (after the Homunculus colour) - 'build'
  // = commence building your own with Iteration 8, the creator
  // builder; 'explore' = explore the demo still. null = not
  // answered yet: the disclaimer asks once. Either stored choice
  // means it never asks again.
  synthDisclaimerChoice: SynthDisclaimerChoice | null;
  // Toolbar plugins — which plugins show as buttons in the icon bar,
  // in the plugins section above Settings. Keyed by plugin id; a missing
  // key falls back to that plugin's defaultOnToolbar. Empty = all defaults.
  toolbarPlugins: Record<string, boolean>;
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

export type View = 'terminal' | 'editor' | 'settings' | 'synth' | 'forge';

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
        readDir: (dirPath: string) => Promise<FileEntry[]>;
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
        getCwd: (id: string) => Promise<string>;
        executeCommand: (command: string) => Promise<{ success: boolean; output?: string; error?: string }>;
      };
      ai: {
        chat: (messages: { role: string; content: string }[], contextDirectory?: string, stream?: boolean) => Promise<string>;
        onStream: (callback: (chunk: string) => void) => () => void;
        onStreamEnd: (callback: () => void) => () => void;
        onStreamError: (callback: (error: string) => void) => () => void;

        cancelStream: () => void;
        hasApiKey: () => Promise<boolean>;
        checkLocalBackend: () => Promise<boolean>;
        getSessions: () => Promise<ChatSession[]>;
        saveSession: (session: ChatSession) => Promise<void>;
        deleteSession: (id: string) => Promise<void>;
        clearSessions: () => Promise<void>;
      };
      system: {
        checkNetwork: () => Promise<{ online: boolean }>;
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
