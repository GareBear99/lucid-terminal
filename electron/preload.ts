import { contextBridge, ipcRenderer } from 'electron';

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

  // Settings operations
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    // License Key
    setLicenseKey: (key: string) => ipcRenderer.invoke('settings:setLicenseKey', key),
    hasLicenseKey: () => ipcRenderer.invoke('settings:hasLicenseKey'),
    deleteLicenseKey: () => ipcRenderer.invoke('settings:deleteLicenseKey'),
    getBalance: () => ipcRenderer.invoke('settings:getBalance'),
    export: () => ipcRenderer.invoke('settings:export'),
    import: (data: string) => ipcRenderer.invoke('settings:import', data),
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
    
    // Phase 2: FixNet Auto-Fix
    fixScript: (filepath: string) => ipcRenderer.invoke('lucid:fixScript', filepath),
    fixnetSync: () => ipcRenderer.invoke('lucid:fixnetSync'),
    
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
    setApiKey: (key: string) => Promise<void>;
    hasApiKey: () => Promise<boolean>;
    deleteApiKey: () => Promise<void>;
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
    
    // Phase 2: FixNet Auto-Fix
    fixScript: (filepath: string) => Promise<{success: boolean; fixCount?: number; output?: string; error?: string}>;
    fixnetSync: () => Promise<{success: boolean; syncedCount?: number; output?: string; error?: string}>;
    
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
