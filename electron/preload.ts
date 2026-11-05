import { contextBridge, ipcRenderer } from 'electron';
import type {
  DecodePath,
  GpuGateStatus,
  StreamMetricsSnapshot,
  TouchMessage,
} from '../src/phone/streaming';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('lucidAPI', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (callback: (maximized: boolean) => void) => {
      ipcRenderer.on('window:maximized', (_, maximized) => callback(maximized));
    },
    create: () => ipcRenderer.send('window:create'),
  },

  // File system operations
  fs: {
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('fs:writeFile', filePath, content),
    createFile: (filePath: string, content?: string) =>
      ipcRenderer.invoke('fs:createFile', filePath, content),
    createDir: (dirPath: string) => ipcRenderer.invoke('fs:createDir', dirPath),
    delete: (targetPath: string) => ipcRenderer.invoke('fs:delete', targetPath),
    rename: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke('fs:rename', oldPath, newPath),
    exists: (targetPath: string) => ipcRenderer.invoke('fs:exists', targetPath),
    getStats: (targetPath: string) => ipcRenderer.invoke('fs:getStats', targetPath),
    openInExplorer: (targetPath: string) =>
      ipcRenderer.invoke('fs:openInExplorer', targetPath),
    selectDirectory: () => ipcRenderer.invoke('fs:selectDirectory'),
    selectFile: (filters?: { name: string; extensions: string[] }[]) =>
      ipcRenderer.invoke('fs:selectFile', filters),
    getHomeDir: () => ipcRenderer.invoke('fs:getHomeDir'),
  },

  // Terminal operations
  terminal: {
    create: (id: string, cwd?: string) =>
      ipcRenderer.invoke('terminal:create', id, cwd),
    write: (id: string, data: string) =>
      ipcRenderer.send('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('terminal:resize', id, cols, rows),
    destroy: (id: string) => ipcRenderer.send('terminal:destroy', id),
    onData: (callback: (id: string, data: string) => void) => {
      const listener = (_: any, id: string, data: string) => callback(id, data);
      ipcRenderer.on('terminal:data', listener);
      return () => ipcRenderer.removeListener('terminal:data', listener);
    },
    onExit: (callback: (id: string, code: number) => void) => {
      const listener = (_: any, id: string, code: number) => callback(id, code);
      ipcRenderer.on('terminal:exit', listener);
      return () => ipcRenderer.removeListener('terminal:exit', listener);
    },
    getCwd: (id: string) => ipcRenderer.invoke('terminal:getCwd', id),
    executeCommand: (command: string) =>
      ipcRenderer.invoke('terminal:executeCommand', command),
  },

  // AI operations
  ai: {
    chat: (messages: { role: string; content: string }[], contextDirectory?: string, stream?: boolean) =>
      ipcRenderer.invoke('ai:chat', messages, contextDirectory, stream),
    onStream: (callback: (chunk: string) => void) => {
      const listener = (_: any, chunk: string) => callback(chunk);
      ipcRenderer.on('ai:stream', listener);
      return () => ipcRenderer.removeListener('ai:stream', listener);
    },
    onStreamEnd: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('ai:streamEnd', listener);
      return () => ipcRenderer.removeListener('ai:streamEnd', listener);
    },
    onStreamError: (callback: (error: string) => void) => {
      const listener = (_: any, error: string) => callback(error);
      ipcRenderer.on('ai:streamError', listener);
      return () => ipcRenderer.removeListener('ai:streamError', listener);
    },

    cancelStream: () => ipcRenderer.send('ai:cancelStream'),
    hasApiKey: () => ipcRenderer.invoke('ai:hasApiKey'),
    checkLocalBackend: () => ipcRenderer.invoke('ai:checkLocalBackend'),
    getSessions: () => ipcRenderer.invoke('ai:getSessions'),
    saveSession: (session: ChatSession) =>
      ipcRenderer.invoke('ai:saveSession', session),
    deleteSession: (id: string) => ipcRenderer.invoke('ai:deleteSession', id),
    clearSessions: () => ipcRenderer.invoke('ai:clearSessions'),
  },

  // System operations
  system: {
    checkNetwork: () => ipcRenderer.invoke('system:checkNetwork'),
  },

  // Settings operations
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    // API Key (Tier 5)
    setApiKey: (key: string) => ipcRenderer.invoke('settings:setApiKey', key),
    hasApiKey: () => ipcRenderer.invoke('settings:hasApiKey'),
    deleteApiKey: () => ipcRenderer.invoke('settings:deleteApiKey'),
    getStorageStatus: () => ipcRenderer.invoke('settings:getStorageStatus'),
    export: () => ipcRenderer.invoke('settings:export'),
    import: (data: string) => ipcRenderer.invoke('settings:import', data),
  },

  // In-panel browser (BrowserView tabs in the main process)
  browser: {
    create: (tabId: string, url: string) =>
      ipcRenderer.invoke('browser:create', tabId, url),
    close: (tabId: string) => ipcRenderer.invoke('browser:close', tabId),
    activate: (tabId: string, bounds: BrowserBounds) =>
      ipcRenderer.invoke('browser:activate', tabId, bounds),
    hide: () => ipcRenderer.invoke('browser:hide'),
    setBounds: (bounds: BrowserBounds) =>
      ipcRenderer.invoke('browser:setBounds', bounds),
    navigate: (tabId: string, url: string) =>
      ipcRenderer.invoke('browser:navigate', tabId, url),
    goBack: (tabId: string) => ipcRenderer.invoke('browser:goBack', tabId),
    goForward: (tabId: string) =>
      ipcRenderer.invoke('browser:goForward', tabId),
    reload: (tabId: string) => ipcRenderer.invoke('browser:reload', tabId),
    onUpdated: (callback: (tabId: string, state: BrowserTabState) => void) => {
      const listener = (_: any, tabId: string, state: BrowserTabState) =>
        callback(tabId, state);
      ipcRenderer.on('browser:updated', listener);
      return () => ipcRenderer.removeListener('browser:updated', listener);
    },
    onOpenUrl: (callback: (url: string) => void) => {
      const listener = (_: any, url: string) => callback(url);
      ipcRenderer.on('browser:open-url', listener);
      return () => ipcRenderer.removeListener('browser:open-url', listener);
    },
  },

  // Phone streaming (Phase 0 spike): scrcpy H.264 + WebCodecs,
  // owned by main. The in-app (internal) entry is the only one
  // gated on hardware decode; the external entry never calls this.
  android: {
    getGpuGate: () => ipcRenderer.invoke('android:getGpuGate'),
    listDevices: () => ipcRenderer.invoke('android:listDevices'),
    getCapacity: () => ipcRenderer.invoke('android:getCapacity'),
    connectExternal: (serial: string) =>
      ipcRenderer.invoke('android:connectExternal', serial),
    loadInternal: (serial: string) =>
      ipcRenderer.invoke('android:loadInternal', serial),
    disconnect: (serial: string) =>
      ipcRenderer.invoke('android:disconnect', serial),
    startStream: (serial: string) =>
      ipcRenderer.invoke('android:startStream', serial),
    stopStream: (serial: string) =>
      ipcRenderer.invoke('android:stopStream', serial),
    touch: (serial: string, msg: TouchMessage) =>
      ipcRenderer.invoke('android:touch', serial, msg),
    getMetrics: (serial?: string) =>
      ipcRenderer.invoke('android:getMetrics', serial),
    reportDecodePath: (serial: string, decodePath: DecodePath) =>
      ipcRenderer.invoke('android:reportDecodePath', serial, decodePath),
    onFrame: (callback: (serial: string, chunk: Uint8Array) => void) => {
      const listener = (_: any, serial: string, chunk: Uint8Array) =>
        callback(serial, chunk);
      ipcRenderer.on('android:frame', listener);
      return () => ipcRenderer.removeListener('android:frame', listener);
    },
    onDeviceState: (
      callback: (serial: string, state: string, error?: string) => void,
    ) => {
      const listener = (_: any, serial: string, state: string, error?: string) =>
        callback(serial, state, error);
      ipcRenderer.on('android:device-state', listener);
      return () => ipcRenderer.removeListener('android:device-state', listener);
    },
  },

  // Global cursor (off-window gaze) — the main process polls
  // screen.getCursorScreenPoint() and pushes points here; the
  // Sentinel face converts them to client coordinates.
  cursor: {
    onGlobalPoint: (callback: (x: number, y: number) => void) => {
      const listener = (_: any, x: number, y: number) => callback(x, y);
      ipcRenderer.on('cursor:global-point', listener);
      return () => ipcRenderer.removeListener('cursor:global-point', listener);
    },
  },

  // File-watcher daemon (LuciferWatcher) operations
  daemon: {
    start: () => ipcRenderer.invoke('daemon:start'),
    stop: () => ipcRenderer.invoke('daemon:stop'),
    status: () => ipcRenderer.invoke('daemon:status'),
    setCommitTracking: (enabled: boolean) => ipcRenderer.invoke('daemon:setCommitTracking', enabled),
    getPaths: () => ipcRenderer.invoke('daemon:getPaths'),
    addPath: (dirPath: string) => ipcRenderer.invoke('daemon:addPath', dirPath),
    removePath: (dirPath: string) => ipcRenderer.invoke('daemon:removePath', dirPath),
    getLogs: () => ipcRenderer.invoke('daemon:getLogs'),
  },

  // Lucid Workflow operations
  lucid: {
    init: () => ipcRenderer.invoke('lucid:init'),
    command: (userInput: string) => ipcRenderer.invoke('lucid:command', userInput),
    getHistory: () => ipcRenderer.invoke('lucid:getHistory'),
    clearHistory: () => ipcRenderer.invoke('lucid:clearHistory'),
    getFixNetStats: () => ipcRenderer.invoke('lucid:getFixNetStats'),
    getModelStatuses: () => ipcRenderer.invoke('lucid:getModelStatuses'),
    getTokenStats: () => ipcRenderer.invoke('lucid:getTokenStats'),
    changeDirectory: (newDir: string) => ipcRenderer.invoke('lucid:changeDirectory', newDir),
    getWorkingDirectory: () => ipcRenderer.invoke('lucid:getWorkingDirectory'),
    getWelcome: () => ipcRenderer.invoke('lucid:getWelcome'),
    getHelp: () => ipcRenderer.invoke('lucid:getHelp'),
    workflowStatus: () => ipcRenderer.invoke('lucid:workflowStatus'),
    fixnetSearch: (query: string) => ipcRenderer.invoke('lucid:fixnetSearch', query),
    llmList: () => ipcRenderer.invoke('lucid:llmList'),
    llmSetEnabled: (model: string, enabled: boolean) => ipcRenderer.invoke('lucid:llmSetEnabled', model, enabled),
    getUserId: () => ipcRenderer.invoke('lucid:getUserId'),
    
    // Phase 2: Model Installation
    installModel: (modelName: string) => ipcRenderer.invoke('lucid:installModel', modelName),
    uninstallModel: (modelName: string) => ipcRenderer.invoke('lucid:uninstallModel', modelName),
    installTier: (tier: number) => ipcRenderer.invoke('lucid:installTier', tier),
    installCoreModels: () => ipcRenderer.invoke('lucid:installCoreModels'),
    getStorageInfo: () => ipcRenderer.invoke('lucid:getStorageInfo'),
    // Is any model file installed? (startup disclaimer — scans
    // ~/.lucid/models and LUCID-BACKEND/models; see modelFiles.ts)
    checkModelsInstalled: () => ipcRenderer.invoke('lucid:checkModelsInstalled'),
    // Install the bundled TinyLlama model. Progress lines arrive on the
    // listener below while the download runs.
    installTinyLlama: () => ipcRenderer.invoke('lucid:installTinyLlama'),
    onInstallTinyLlamaProgress: (callback: (line: string) => void) => {
      const listener = (_event: unknown, line: string) => callback(line);
      ipcRenderer.on('lucid:installTinyLlama:progress', listener);
      return () => ipcRenderer.removeListener('lucid:installTinyLlama:progress', listener);
    },
    
    // Phase 2: FixNet Auto-Fix
    fixScript: (filepath: string) => ipcRenderer.invoke('lucid:fixScript', filepath),
    
    // Phase 2: GitHub Integration
    githubLink: () => ipcRenderer.invoke('lucid:githubLink'),
    githubUnlink: () => ipcRenderer.invoke('lucid:githubUnlink'),
    githubStatus: () => ipcRenderer.invoke('lucid:githubStatus'),
    githubUpload: () => ipcRenderer.invoke('lucid:githubUpload'),
    githubUpdate: () => ipcRenderer.invoke('lucid:githubUpdate'),
    githubProjects: () => ipcRenderer.invoke('lucid:githubProjects'),
    
    // Phase 2: Environment Management
    listEnvironments: () => ipcRenderer.invoke('lucid:listEnvironments'),
    searchEnvironment: (query: string) => ipcRenderer.invoke('lucid:searchEnvironment', query),
    activateEnvironment: (name: string) => ipcRenderer.invoke('lucid:activateEnvironment', name),
    
    // Phase 2: System Commands
    systemInfo: () => ipcRenderer.invoke('lucid:systemInfo'),
    memoryStats: () => ipcRenderer.invoke('lucid:memoryStats'),
    mainMenu: () => ipcRenderer.invoke('lucid:mainMenu'),
  },
});

// Type definitions for the exposed API
export interface LucidAPI {
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
    onData: (callback: (id: string, data: string) => void) => void;
    onExit: (callback: (id: string, code: number) => void) => void;
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
    start: () => Promise<{ success: boolean; alreadyRunning?: boolean; pid?: number; mode?: 'watch' | 'autofix'; paths?: string[]; error?: string }>;
    stop: () => Promise<{ success: boolean; error?: string }>;
    status: () => Promise<{ running: boolean; pids: string[]; mode: 'watch' | 'autofix' | null; paths: string[] }>;
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
    // Core
    init: () => Promise<{success: boolean; error?: string}>;
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
    getUserId: () => Promise<any>;
    
    // Phase 2: Model Installation
    installModel: (modelName: string) => Promise<{success: boolean; output?: string; error?: string}>;
    uninstallModel: (modelName: string) => Promise<{success: boolean; output?: string; error?: string}>;
    installTier: (tier: number) => Promise<{success: boolean; output?: string; error?: string}>;
    installCoreModels: () => Promise<{success: boolean; output?: string; error?: string}>;
    getStorageInfo: () => Promise<{ success: boolean; storage: { used: string; available: string }; error?: string }>;
    checkModelsInstalled: () => Promise<{ installed: boolean; files: { name: string; path: string; sizeBytes: number }[]; dirsChecked: string[]; errors: string[] }>;
    installTinyLlama: () => Promise<{ success: boolean; modelPath?: string; output?: string; error?: string }>;
    onInstallTinyLlamaProgress: (callback: (line: string) => void) => () => void;
    
    // Phase 2: FixNet Auto-Fix
    fixScript: (filepath: string) => Promise<{success: boolean; fixCount?: number; output?: string; error?: string}>;
    
    // Phase 2: GitHub Integration
    githubLink: () => Promise<{success: boolean; url?: string; output?: string; error?: string}>;
    githubUnlink: () => Promise<{success: boolean; output?: string; error?: string}>;
    githubStatus: () => Promise<{success: boolean; linked?: boolean; username?: string; output?: string; error?: string}>;
    githubUpload: () => Promise<{success: boolean; repoUrl?: string; output?: string; error?: string}>;
    githubUpdate: () => Promise<{success: boolean; output?: string; error?: string}>;
    githubProjects: () => Promise<{success: boolean; projects?: any[]; output?: string; error?: string}>;
    
    // Phase 2: Environment Management
    listEnvironments: () => Promise<{success: boolean; environments?: any[]; output?: string; error?: string}>;
    searchEnvironment: (query: string) => Promise<{success: boolean; environment?: any; output?: string; error?: string}>;
    activateEnvironment: (name: string) => Promise<{success: boolean; output?: string; error?: string}>;
    
    // Phase 2: System Commands
    systemInfo: () => Promise<{success: boolean; output?: string; error?: string}>;
    memoryStats: () => Promise<{success: boolean; output?: string; error?: string}>;
    mainMenu: () => Promise<{success: boolean; output?: string; error?: string}>;
  };
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  modified: number;
}

export interface FileStats {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  created: number;
  modified: number;
  accessed: number;
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

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserTabState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
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
