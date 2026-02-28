import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { setupFileSystemHandlers } from './ipc/fileSystem';
import { setupTerminalHandlers } from './ipc/terminal';
import { setupAIHandlers } from './ipc/ai';
import { setupSettingsHandlers } from './ipc/settings';
import { setupLucidWorkflowHandlers } from './ipc/lucidWorkflow';
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
    icon: path.join(__dirname, '../resources/icon.ico'),
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

  // License Key Handlers
  ipcMain.handle('settings:setLicenseKey', (_, key) => {
    apiKeyStorage.setLicenseKey(key);
  });
  ipcMain.handle('settings:hasLicenseKey', () => {
    return apiKeyStorage.hasLicenseKey();
  });
  ipcMain.handle('settings:deleteLicenseKey', () => {
    apiKeyStorage.deleteLicenseKey();
  });

  ipcMain.handle('settings:getBalance', async () => {
    const key = apiKeyStorage.getLicenseKey();
    if (!key) return null;

    try {
      const response = await fetch(`https://lucid-backend.replit.app/balance?key=${key}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.credits;
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      return null;
    }
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
