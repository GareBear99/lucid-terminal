import { contextBridge, ipcRenderer } from 'electron';
import type { DevicesListResult } from '../src/lib/deviceDetection';
import type {
  DecodePath,
  GpuGateStatus,
  StreamMetricsSnapshot,
  TouchMessage,
} from '../src/phone/streaming';
import type { PingQuota } from '../src/types';
import type { BrowserAgentStateSnapshot } from '../src/lib/browserAgent';

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
    // The shell moved (OSC 7 / cd) - the tab header follows the
    // live cwd. Same listener shape as onData/onExit.
    onCwd: (callback: (id: string, cwd: string) => void) => {
      const listener = (_: any, id: string, cwd: string) => callback(id, cwd);
      ipcRenderer.on('terminal:cwd', listener);
      return () => ipcRenderer.removeListener('terminal:cwd', listener);
    },
    getCwd: (id: string) => ipcRenderer.invoke('terminal:getCwd', id),
    executeCommand: (command: string) =>
      ipcRenderer.invoke('terminal:executeCommand', command),
  },

  // AI operations
  ai: {
    chat: (messages: { role: string; content: string }[], contextDirectory?: string, stream?: boolean, options?: { model?: string; modelSource?: 'local' | 'openai' | 'ping'; chatId?: string }) =>
      ipcRenderer.invoke('ai:chat', messages, contextDirectory, stream, options),
    onStream: (callback: (chunk: string) => void) => {
      const listener = (_: any, chunk: string) => callback(chunk);
      ipcRenderer.on('ai:stream', listener);
      return () => ipcRenderer.removeListener('ai:stream', listener);
    },
    onStreamEnd: (callback: (quota?: PingQuota) => void) => {
      const listener = (_: any, quota?: PingQuota) => callback(quota);
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
    pingServerHealth: () => ipcRenderer.invoke('ai:pingServerHealth'),
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

  // Computer-control segment (Gary, 2026-11-06) — the pre-installed,
  // agent-only segment. The renderer never touches the OS directly;
  // every action crosses this bridge, so it can be logged, locked,
  // and audited in one place (main process). Read-only calls are
  // never blocked by the segment lock.
  computerControl: {
    getState: () => ipcRenderer.invoke('computer-control:getState'),
    listApps: () => ipcRenderer.invoke('computer-control:listApps'),
    observe: (targetId: string | null) =>
      ipcRenderer.invoke('computer-control:observe', targetId),
    action: (action: import('../src/lib/computerControl').ComputerControlAction) =>
      ipcRenderer.invoke('computer-control:action', action),
  },

  // Permission tracking (Gary, 2026-11-07 ~02:47 PST) — Lucid
  // tracks everything the user allows. The renderer never probes
  // the OS directly; every state comes from the main process, in
  // one place. The snapshot is the live probe — the truth — while
  // the persisted grants in Settings are only a memory of what
  // the user once allowed.
  permissions: {
    getSnapshot: (force?: boolean) =>
      ipcRenderer.invoke('permissions:getSnapshot', force),
    request: (id: import('../src/lib/permissions').PermissionId) =>
      ipcRenderer.invoke('permissions:request', id),
    openSettings: (id: import('../src/lib/permissions').PermissionId) =>
      ipcRenderer.invoke('permissions:openSettings', id),
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
    setPingKey: (key: string) => ipcRenderer.invoke('settings:setPingKey', key),
    hasPingKey: () => ipcRenderer.invoke('settings:hasPingKey'),
    deletePingKey: () => ipcRenderer.invoke('settings:deletePingKey'),
    setTelegramBotToken: (token: string) => ipcRenderer.invoke('settings:setTelegramBotToken', token),
    hasTelegramBotToken: () => ipcRenderer.invoke('settings:hasTelegramBotToken'),
    deleteTelegramBotToken: () => ipcRenderer.invoke('settings:deleteTelegramBotToken'),
    setStripeApiKey: (key: string) => ipcRenderer.invoke('settings:setStripeApiKey', key),
    hasStripeApiKey: () => ipcRenderer.invoke('settings:hasStripeApiKey'),
    deleteStripeApiKey: () => ipcRenderer.invoke('settings:deleteStripeApiKey'),
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
    onAuthRequired: (callback: (request: BrowserAuthRequest) => void) => {
      const listener = (_: any, request: BrowserAuthRequest) => callback(request);
      ipcRenderer.on('browser:auth-required', listener);
      return () => ipcRenderer.removeListener('browser:auth-required', listener);
    },
    authResponse: (requestId: string, creds: { username: string; password: string } | null) =>
      ipcRenderer.invoke('browser:auth-response', requestId, creds),
    findInPage: (
      tabId: string,
      text: string,
      options?: { forward?: boolean; findNext?: boolean; matchCase?: boolean },
    ) => ipcRenderer.invoke('browser:find', tabId, text, options),
    stopFindInPage: (
      tabId: string,
      action?: 'clearSelection' | 'keepSelection' | 'activateSelection',
    ) => ipcRenderer.invoke('browser:stop-find', tabId, action),
    onFindUpdated: (callback: (tabId: string, result: BrowserFindResult) => void) => {
      const listener = (_: any, tabId: string, result: BrowserFindResult) =>
        callback(tabId, result);
      ipcRenderer.on('browser:find-updated', listener);
      return () => ipcRenderer.removeListener('browser:find-updated', listener);
    },
    setZoom: (tabId: string, factor: number) =>
      ipcRenderer.invoke('browser:zoom', tabId, factor),
    openExternal: (url: string) =>
      ipcRenderer.invoke('browser:open-external', url),
    listDownloads: () =>
      ipcRenderer.invoke('browser:list-downloads'),
    cancelDownload: (id: string) =>
      ipcRenderer.invoke('browser:download-cancel', id),
    pauseDownload: (id: string) =>
      ipcRenderer.invoke('browser:download-pause', id),
    resumeDownload: (id: string) =>
      ipcRenderer.invoke('browser:download-resume', id),
    showDownloadInFolder: (id: string) =>
      ipcRenderer.invoke('browser:show-download', id),
    onDownloadUpdated: (callback: (update: BrowserDownload) => void) => {
      const listener = (_: any, update: BrowserDownload) => callback(update);
      ipcRenderer.on('browser:download-updated', listener);
      return () => ipcRenderer.removeListener('browser:download-updated', listener);
    },
    // Saved logins (Area 3): the vault lives in main; the renderer
    // only ever sees origin + username — the password never crosses
    // IPC. saveLogin confirms a candidate main already holds.
    listSavedLogins: () =>
      ipcRenderer.invoke('browser:list-saved-logins'),
    deleteSavedLogin: (origin: string) =>
      ipcRenderer.invoke('browser:delete-saved-login', origin),
    saveLogin: (origin: string, username: string) =>
      ipcRenderer.invoke('browser:save-login', origin, username),
    dismissLoginOffer: (origin: string) =>
      ipcRenderer.invoke('browser:dismiss-login-offer', origin),
    fillSavedLogin: () =>
      ipcRenderer.invoke('browser:fill-saved-login'),
    onLoginDetected: (callback: (offer: BrowserLoginOffer) => void) => {
      const listener = (_: any, offer: BrowserLoginOffer) => callback(offer);
      ipcRenderer.on('browser:login-detected', listener);
      return () => ipcRenderer.removeListener('browser:login-detected', listener);
    },
    // Page actions (Area 4): typed, parameterised — the renderer
    // sends a tab id + parameters; the scripts are built in main.
    // fill never fills a password field (vault fill instead).
    readText: (tabId: string) =>
      ipcRenderer.invoke('browser:action-read-text', tabId),
    fill: (tabId: string, selector: string, value: string) =>
      ipcRenderer.invoke('browser:action-fill', tabId, selector, value),
    click: (tabId: string, selector: string) =>
      ipcRenderer.invoke('browser:action-click', tabId, selector),
    waitForSelector: (tabId: string, selector: string, timeoutMs?: number) =>
      ipcRenderer.invoke('browser:action-wait', tabId, selector, timeoutMs),
    screenshot: (tabId: string) =>
      ipcRenderer.invoke('browser:action-screenshot', tabId),
    getState: (tabId: string) =>
      ipcRenderer.invoke('browser:action-state', tabId),
    // Mini window (Area 6): pop a tab out to the floating window
    // or back in. The mini renderer reports its container bounds
    // so the view lands under the mini chrome.
    popOut: (tabId: string) =>
      ipcRenderer.invoke('browser:pop-out', tabId),
    popIn: (tabId: string) =>
      ipcRenderer.invoke('browser:pop-in', tabId),
    setMiniBounds: (bounds: BrowserBounds) =>
      ipcRenderer.invoke('browser:set-mini-bounds', bounds),
    closeMini: () => ipcRenderer.invoke('browser:mini-close'),
    miniOpenInternal: () => ipcRenderer.invoke('browser:mini-open-internal'),
    onMiniState: (callback: (tabId: string, state: BrowserTabState) => void) => {
      const listener = (_: any, tabId: string, state: BrowserTabState) =>
        callback(tabId, state);
      ipcRenderer.on('browser:mini-state', listener);
      return () => ipcRenderer.removeListener('browser:mini-state', listener);
    },
    onMiniClosed: (callback: (tabId: string) => void) => {
      const listener = (_: any, tabId: string) => callback(tabId);
      ipcRenderer.on('browser:mini-closed', listener);
      return () => ipcRenderer.removeListener('browser:mini-closed', listener);
    },
    onOpenInternalPhone: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('browser:open-internal-phone', listener);
      return () => ipcRenderer.removeListener('browser:open-internal-phone', listener);
    },
    // Cmd+L / Ctrl+L typed inside the page: main intercepts it
    // (before-input-event) and forwards it here — the renderer's
    // own keydown listener never sees keys typed into the view.
    onFocusAddressBar: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('browser:focus-address-bar', listener);
      return () => ipcRenderer.removeListener('browser:focus-address-bar', listener);
    },
    // Agent browser (Phase B): live state pushed by main whenever
    // the agent starts/stops browsing, moves its mouse, or Gary
    // takes control — plus Gary's stop / take-control / finger-lock
    // controls and the finger queue for other agents.
    onAgentState: (callback: (state: BrowserAgentStateSnapshot) => void) => {
      const listener = (_: any, state: BrowserAgentStateSnapshot) =>
        callback(state);
      ipcRenderer.on('browser:agent-state', listener);
      return () => ipcRenderer.removeListener('browser:agent-state', listener);
    },
    stopAgentBrowser: () => ipcRenderer.invoke('browser:agent-stop'),
    takeAgentControl: () => ipcRenderer.invoke('browser:agent-take-control'),
    giveBackAgentControl: () => ipcRenderer.invoke('browser:agent-give-back'),
    setBrowserFingerLocked: (locked: boolean) =>
      ipcRenderer.invoke('browser:agent-finger-lock', locked),
    getAgentState: () => ipcRenderer.invoke('browser:agent-get-state'),
    requestBrowserFinger: (holderId: string) =>
      ipcRenderer.invoke('browser:finger-request', holderId),
    releaseBrowserFinger: (holderId: string) =>
      ipcRenderer.invoke('browser:finger-release', holderId),
    // Flows (Area 7): start / stop / approve / reject, and the
    // progress + approval events the panel shows.
    startFlow: (definition: FlowDefinition, tabId: string) =>
      ipcRenderer.invoke('browser:flow-start', definition, tabId),
    stopFlow: (flowId: string) =>
      ipcRenderer.invoke('browser:flow-stop', flowId),
    approveFlowStep: (flowId: string) =>
      ipcRenderer.invoke('browser:flow-approve', flowId),
    rejectFlowStep: (flowId: string) =>
      ipcRenderer.invoke('browser:flow-reject', flowId),
    onFlowProgress: (callback: (event: FlowProgressEvent) => void) => {
      const listener = (_: any, event: FlowProgressEvent) => callback(event);
      ipcRenderer.on('browser:flow-progress', listener);
      return () => ipcRenderer.removeListener('browser:flow-progress', listener);
    },
    onFlowApprovalNeeded: (callback: (request: FlowApprovalRequest) => void) => {
      const listener = (_: any, request: FlowApprovalRequest) => callback(request);
      ipcRenderer.on('browser:flow-approval-needed', listener);
      return () => ipcRenderer.removeListener('browser:flow-approval-needed', listener);
    },
    // CDP Tier 2 (Area 8): trusted click (a real mouse event,
    // for pages that ignore a synthetic click) and the debugger
    // session's diagnostics for the tab.
    trustedClick: (tabId: string, selector: string) =>
      ipcRenderer.invoke('browser:action-trusted-click', tabId, selector),
    getCdpDiagnostics: (tabId: string) =>
      ipcRenderer.invoke('browser:cdp-diagnostics', tabId),
    diagnoseActive: () =>
      ipcRenderer.invoke('browser:diagnose'),
    // Save page + per-site permission memory (Area 9).
    savePage: (tabId: string) =>
      ipcRenderer.invoke('browser:save-page', tabId),
    answerPermission: (origin: string, permission: string, decision: 'once' | 'always' | 'deny') =>
      ipcRenderer.invoke('browser:permission-answer', origin, permission, decision),
    listPermissions: () => ipcRenderer.invoke('browser:permission-list'),
    revokePermission: (origin: string, permission: string) =>
      ipcRenderer.invoke('browser:permission-revoke', origin, permission),
    onPermissionRequested: (callback: (request: BrowserPermissionRequest) => void) => {
      const listener = (_: any, request: BrowserPermissionRequest) => callback(request);
      ipcRenderer.on('browser:permission-requested', listener);
      return () => ipcRenderer.removeListener('browser:permission-requested', listener);
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

  // Devices (detection-only) — USB via system_profiler, Android via
  // adb, plus the host. Read-only: list + identify, no control.
  devices: {
    list: () => ipcRenderer.invoke('devices:list'),
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

  // Forge (LLMBuilder Homunculi trainer) operations
  llmbuilder: {
    status: () => ipcRenderer.invoke('llmbuilder:status'),
    setup: (options?: { withTorch?: boolean }) =>
      ipcRenderer.invoke('llmbuilder:setup', options),
    startRun: (params: unknown) =>
      ipcRenderer.invoke('llmbuilder:startRun', params),
    cancelRun: (runId: string | { runId: string }) =>
      ipcRenderer.invoke('llmbuilder:cancelRun', runId),
    listRuns: () => ipcRenderer.invoke('llmbuilder:listRuns'),
    getScoreboard: () => ipcRenderer.invoke('llmbuilder:getScoreboard'),
    getPromotionDecision: (candidate: string | { candidate: string }) =>
      ipcRenderer.invoke('llmbuilder:getPromotionDecision', candidate),
    installBrain: (
      homunculusId: string | { homunculusId: string; candidate: string },
      candidate?: string,
    ) => ipcRenderer.invoke('llmbuilder:installBrain', homunculusId, candidate),
    rollback: (homunculusId: string | { homunculusId: string }) =>
      ipcRenderer.invoke('llmbuilder:rollback', homunculusId),
    getRoster: () => ipcRenderer.invoke('llmbuilder:getRoster'),
    saveRoster: (homunculi: unknown) =>
      ipcRenderer.invoke('llmbuilder:saveRoster', homunculi),
    importDataset: (a: unknown, b?: unknown, c?: unknown) =>
      ipcRenderer.invoke('llmbuilder:importDataset', a, b, c),
    askBrain: (a: unknown, b?: unknown, c?: unknown) =>
      ipcRenderer.invoke('llmbuilder:askBrain', a, b, c),
    onProgress: (callback: (event: LlmbuilderProgressEvent) => void) => {
      const listener = (_: any, event: LlmbuilderProgressEvent) => callback(event);
      ipcRenderer.on('llmbuilder:progress', listener);
      return () => ipcRenderer.removeListener('llmbuilder:progress', listener);
    },
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
    onCwd: (callback: (id: string, cwd: string) => void) => void;
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
    getSessions: () => Promise<ChatSession[]>;
    saveSession: (session: ChatSession) => Promise<void>;
    deleteSession: (id: string) => Promise<void>;
    clearSessions: () => Promise<void>;
  };
  system: {
    checkNetwork: () => Promise<{ online: boolean }>;
  };
  permissions: {
    getSnapshot: (force?: boolean) => Promise<import('../src/lib/permissions').PermissionSnapshot[]>;
    request: (id: import('../src/lib/permissions').PermissionId) => Promise<boolean>;
    openSettings: (id: import('../src/lib/permissions').PermissionId) => Promise<boolean>;
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
    saveLogin: (origin: string, username: string) => Promise<boolean>;
    dismissLoginOffer: (origin: string) => Promise<void>;
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
  llmbuilder: {
    status: () => Promise<LlmbuilderStatus>;
    setup: (options?: { withTorch?: boolean }) => Promise<{ ok: boolean; message: string; error?: string; torchVersion?: string | null }>;
    startRun: (params: unknown) => Promise<LlmbuilderStartedRun>;
    cancelRun: (runId: string | { runId: string }) => Promise<{ ok: boolean }>;
    listRuns: () => Promise<LlmbuilderRunList>;
    getScoreboard: () => Promise<LlmbuilderScoreboardRow[] | null>;
    getPromotionDecision: (candidate: string | { candidate: string }) => Promise<LlmbuilderPromotionDecision | null>;
    installBrain: (homunculusId: string | { homunculusId: string; candidate: string }, candidate?: string) => Promise<{ ok: boolean; modelPath?: string; previousModelPath?: string | null; error?: string }>;
    rollback: (homunculusId: string | { homunculusId: string }) => Promise<{ ok: boolean; modelPath?: string; previousModelPath?: string | null; error?: string }>;
    getRoster: () => Promise<unknown[]>;
    saveRoster: (homunculi: unknown) => Promise<{ ok: boolean; error?: string }>;
    importDataset: (a: unknown, b?: unknown, c?: unknown) => Promise<LlmbuilderImportResult>;
    askBrain: (a: unknown, b?: unknown, c?: unknown) => Promise<LlmbuilderBrainAnswer>;
    onProgress: (callback: (event: LlmbuilderProgressEvent) => void) => () => void;
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

export interface LlmbuilderStatus {
  ready: boolean;
  venvReady: boolean;
  torchReady: boolean;
  torchInstalled: boolean;
  pythonPath: string | null;
  pythonAvailable: boolean;
  builderDir: string;
  dataDir: string;
  freeMemMb: number;
  lowMemory: boolean;
  message: string | null;
}

export interface LlmbuilderStartedRun {
  runId: string;
  homunculusId: string;
  candidate: string;
  tier: string;
  status: string;
  startedAt: string;
}

export type LlmbuilderRunList = Array<{
  runId: string;
  homunculusId: string;
  candidate: string;
  tier: string;
  status: string;
  startedAt: string;
  stages: Array<{ stage: string; status: string }>;
  decision?: string;
  score?: number | null;
}>;

export interface LlmbuilderScoreboardRow {
  candidate: string;
  score: number | null;
  decision: string;
  artifacts: string[];
}

export interface LlmbuilderPromotionDecision {
  candidate: string;
  decision: string;
  score: number | null;
  scoreboardRow: LlmbuilderScoreboardRow | null;
  receiptRef: string | null;
  raw: Record<string, unknown>;
}

export interface LlmbuilderImportResult {
  ok: boolean;
  records: number;
  recordCount: number;
  datasetId: string;
  domains: string[];
  errors: string[];
}

export interface LlmbuilderBrainAnswer {
  ok: boolean;
  text: string;
  matches: Array<{ score: number; capability: string }>;
  answer: string;
  matchedCapabilities: string[];
  confidence: string | null;
  noMatch: boolean;
  error?: string;
}

export interface LlmbuilderProgressEvent {
  runId: string;
  stage: string;
  status: string;
  message: string;
  manifest?: Record<string, unknown>;
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

export interface BrowserAuthRequest {
  id: string;
  tabId: string;
  url: string;
  host: string;
  realm?: string;
}

export interface BrowserFindResult {
  activeMatchOrdinal: number;
  matches: number;
}

export interface BrowserDownload {
  id: string;
  url: string;
  filename: string;
  savePath: string;
  receivedBytes: number;
  totalBytes: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
}

/** A saved login, as the renderer ever sees it: origin + username
 * only — the password never crosses IPC. */
export interface BrowserSavedLogin {
  origin: string;
  username: string;
  updatedAt: string;
}

export interface BrowserLoginOffer {
  origin: string;
  username: string;
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
