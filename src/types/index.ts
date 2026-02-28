// Re-export preload types
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
  timestamp?: number;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
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
}

export type View = 'terminal' | 'editor' | 'settings';

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
      settings: {
        get: <T>(key: string) => Promise<T>;
        set: (key: string, value: unknown) => Promise<void>;
        getAll: () => Promise<Record<string, unknown>>;
        setLicenseKey: (key: string) => Promise<void>;
        hasLicenseKey: () => Promise<boolean>;
        deleteLicenseKey: () => Promise<void>;
        getBalance: () => Promise<number>;
        export: () => Promise<string>;
        import: (data: string) => Promise<void>;
      };
      lucid: {
        init: () => Promise<{ success: boolean; error?: string }>;
        command: (userInput: string) => Promise<any>;
        getHistory: () => Promise<any[]>;
        clearHistory: () => Promise<void>;
        getFixNetStats: () => Promise<any>;
        getModelStatuses: () => Promise<any[]>;
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
      };
    };
  }
}
