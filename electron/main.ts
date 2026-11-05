import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { setupFileSystemHandlers } from './ipc/fileSystem';
import { setupTerminalHandlers } from './ipc/terminal';
import { setupAIHandlers } from './ipc/ai';
import { setupSettingsHandlers } from './ipc/settings';
import { setupLucidWorkflowHandlers } from './ipc/lucidWorkflow';
import { setupSystemHandlers } from './ipc/system';
import { setupDaemonHandlers, maybeAutoStartDaemon, stopDaemonSync } from './ipc/daemon';
import { setupLlmbuilderHandlers } from './ipc/llmbuilder';
import { setupBrowserHandlers } from './ipc/browser';
import { setupAndroidHandlers } from './ipc/android';
import { setupGlobalCursorPolling } from './ipc/cursor';
import { apiKeyStorage, settings } from './services/secureStorage';
import { resetClient } from './services/openai';
import { startBackend, stopBackend } from './services/local_ai';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.lucid.terminal');
}

let mainWindow: BrowserWindow | null = null;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false, // Custom titlebar
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    // Window icon: resources/icon.icns on macOS, resources/icon.ico on
    // Windows. The old path pointed at a resources/ directory that did
    // not exist, and .ico is a Windows format — macOS wants .icns.
    // Packaged apps resolve from process.resourcesPath (extraResources
    // copies resources/ there); in dev, from the repo root.
    icon: path.join(
      app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'),
      'resources',
      process.platform === 'darwin' ? 'icon.icns' : 'icon.ico',
    ),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for node-pty
    },
  });



  // Window controls


  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the app
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Send maximize state changes to renderer
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false);
  });
}

app.whenReady().then(() => {
  startBackend(); // START LOCAL AI BACKEND

  // Setup IPC handlers once
  setupFileSystemHandlers(ipcMain);
  setupTerminalHandlers(ipcMain);
  setupAIHandlers(ipcMain);
  setupSettingsHandlers(ipcMain);
  setupLucidWorkflowHandlers(ipcMain);
  setupSystemHandlers(ipcMain);
  setupDaemonHandlers(ipcMain);
  setupLlmbuilderHandlers(ipcMain, () => mainWindow);
  // The in-panel browser needs the window to attach its BrowserViews to.
  setupBrowserHandlers(ipcMain, () => mainWindow);
  // Phone streaming (scrcpy) needs the window for the PhoneView canvas host.
  setupAndroidHandlers(ipcMain, () => mainWindow);
  // The Sentinel face follows the cursor even off-window: the
  // main process polls the global cursor position and pushes it
  // to the renderer (see electron/ipc/cursor.ts).
  setupGlobalCursorPolling();

  // Start the file-watcher daemon when the setting says so (and watch
  // paths exist). The watcher is a background Python process; it stops
  // with the app (see will-quit below).
  // Fire-and-forget: the promise must never reject unhandled.
  // startDaemon() catches its own spawn failures, but a rejection
  // here (e.g. settings read) would otherwise surface as an unhandled
  // rejection in the main process.
  maybeAutoStartDaemon().catch((err) => {
    console.error('Watcher daemon auto-start failed:', err);
  });

  // API Key Handlers (Tier 5: direct API key, stored encrypted)
  ipcMain.handle('settings:setApiKey', (_, key) => {
    apiKeyStorage.setApiKey(key);
  });
  ipcMain.handle('settings:hasApiKey', () => {
    return apiKeyStorage.hasApiKey();
  });
  ipcMain.handle('settings:deleteApiKey', () => {
    apiKeyStorage.deleteApiKey();
  });



  // Window controls
  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });
  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });
  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });
  ipcMain.on('window:create', () => {
    createWindow();
  });
  ipcMain.handle('window:isMaximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized();
  });

  createWindow();
});

app.on('will-quit', () => {
  stopDaemonSync(); // Stop the file-watcher daemon (sync: will-quit cannot await)
  stopBackend(); // CLEANUP
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
