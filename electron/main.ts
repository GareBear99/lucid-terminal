import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { setupFileSystemHandlers } from './ipc/fileSystem';
import { setupTerminalHandlers } from './ipc/terminal';
import { setupGitHandlers } from './ipc/git';
import { setupAIHandlers } from './ipc/ai';
import { setupSettingsHandlers } from './ipc/settings';
import { setupLucidWorkflowHandlers } from './ipc/lucidWorkflow';
import { setupSystemHandlers } from './ipc/system';
import { setupComputerControlHandlers } from './ipc/computerControl';
import { setupPermissionsHandlers } from './ipc/permissions';
import { setupDaemonHandlers, maybeAutoStartDaemon, stopDaemonSync } from './ipc/daemon';
import { setupLlmbuilderHandlers } from './ipc/llmbuilder';
import { setupSnapshotHandlers } from './ipc/snapshot';
import { setupBrowserHandlers } from './ipc/browser';
import {
  createMiniBrowserWindow,
  getMiniBrowserWindow,
} from './services/browserMiniWindow';
import { setupAndroidHandlers } from './ipc/android';
import { setupGlobalCursorPolling } from './ipc/cursor';
import { apiKeyStorage, pingKeyStorage, telegramBotTokenStorage, stripeApiKeyStorage, kaggleApiKeyStorage, totpSecretStorage, settings } from './services/secureStorage';
import { verifyTotpCodeAgainstStored } from './services/totpAuth';
import { resetClient } from './services/openai';
import { startBackend, stopBackend } from './services/local_ai';
import { setupDevicesHandlers } from './ipc/devices';
import { setupGoogleDriveHandlers } from './ipc/googleDrive';

// Browser paint fix (Gary, 2026-11-09 — LIVE evidence, not a guess):
// the in-app BrowserView presents only frames from the renderer
// process that owned it at first attach. Same-site navigations
// while attached paint (phone page -> phone page ?fresh=1 paints);
// cross-site navigations stay blank white (phone -> example.com,
// about:blank -> example.com), even though capturePage HAS the
// rendered page, detach + re-attach does not fix it, and a bounds
// jiggle (0ms and 100ms dwell) does not fix it either. A cross-site
// navigation swaps the renderer process (site isolation), and the
// new process's frames never present in the view. Disabling site
// isolation keeps every browser page in one renderer process, so
// no swap ever happens and the view keeps presenting. Trade-off:
// site isolation is a Spectre mitigation; Lucid's browser is a
// local-first feature panel, not a general-purpose browser, and a
// browser that paints nothing is worse. The main window loads only
// local content, so it is unaffected in practice.
app.commandLine.appendSwitch('disable-site-isolation-trials');

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
  setupGitHandlers(ipcMain);
  setupAIHandlers(ipcMain);
  setupSettingsHandlers(ipcMain);
  setupGoogleDriveHandlers(ipcMain);
  setupLucidWorkflowHandlers(ipcMain);
  setupSystemHandlers(ipcMain);
  setupComputerControlHandlers(ipcMain);
  setupPermissionsHandlers(ipcMain);
  setupDaemonHandlers(ipcMain);
  setupLlmbuilderHandlers(ipcMain, () => mainWindow);
  setupSnapshotHandlers(ipcMain);
  // The in-panel browser needs the window to attach its BrowserViews to.
  setupBrowserHandlers(ipcMain, () => mainWindow, {
    // Downloads (Area 2): Gary can point the browser at a different
    // folder with the `browserDownloadsFolder` setting; unset means
    // the OS Downloads folder.
    getDownloadsFolder: () =>
      settings.get<string>('browserDownloadsFolder') ?? undefined,
    // Mini window (Area 6): the floating 640x420 browser window
    // a popped-out tab's view migrates to.
    mini: {
      create: (onClosed) => createMiniBrowserWindow({ onClosed }),
      get: () => getMiniBrowserWindow(),
    },
    // Agent browser (Phase B): LuciferAI enabled + browser
    // finger lock, read live from the same settings store the
    // renderer persists to. These live on the OPTIONS object, NOT
    // inside `mini` — nesting them there silently drops them
    // (options.getAgentSettings is undefined, so the agent session
    // always saw LuciferAI on + finger unlocked, and the
    // LuciferAI-off stop/take-control bar could never appear).
    // Plain `tsc` does not catch this: it only typechecks src/
    // (see tsconfig.json include); tsconfig.node.json DOES flag
    // it (TS2353) but is already red with pre-existing errors.
    getAgentSettings: () => ({
      luciferAiEnabled: settings.get<boolean>('luciferAiEnabled') ?? false,
      browserFingerLocked:
        settings.get<boolean>('browserFingerLocked') ?? false,
    }),
    setBrowserFingerLocked: (locked) => {
      settings.set('browserFingerLocked', locked);
    },
  });
  // Phone streaming (scrcpy) needs the window for the PhoneView canvas host.
  setupAndroidHandlers(ipcMain, () => mainWindow);
  // Devices (detection-only): USB via system_profiler, Android via adb, plus the host.
  setupDevicesHandlers(ipcMain);
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

  // Ping server key handlers (test path: shared secret for the
  // Cloudflare ping server Worker, stored encrypted like the API key)
  ipcMain.handle('settings:setPingKey', (_, key) => {
    pingKeyStorage.setPingKey(key);
  });
  ipcMain.handle('settings:hasPingKey', () => {
    return pingKeyStorage.hasPingKey();
  });
  ipcMain.handle('settings:deletePingKey', () => {
    pingKeyStorage.deletePingKey();
  });

  // Telegram bot token handlers — the Bot API token for the user's
  // own bot (created in BotFather), stored encrypted like the API
  // key and the ping key.
  ipcMain.handle('settings:setTelegramBotToken', (_, token) => {
    telegramBotTokenStorage.setTelegramBotToken(token);
  });
  ipcMain.handle('settings:hasTelegramBotToken', () => {
    return telegramBotTokenStorage.hasTelegramBotToken();
  });
  ipcMain.handle('settings:deleteTelegramBotToken', () => {
    telegramBotTokenStorage.deleteTelegramBotToken();
  });

  // Stripe API key handlers - the key for the user's own Stripe
  // account (created in the Stripe Dashboard; a restricted key is
  // best, a full secret key also works), stored encrypted like the
  // API key, the ping key and the Telegram bot token.
  ipcMain.handle('settings:setStripeApiKey', (_, key) => {
    stripeApiKeyStorage.setStripeApiKey(key);
  });
  ipcMain.handle('settings:hasStripeApiKey', () => {
    return stripeApiKeyStorage.hasStripeApiKey();
  });
  ipcMain.handle('settings:deleteStripeApiKey', () => {
    stripeApiKeyStorage.deleteStripeApiKey();
  });

  // Kaggle API key handlers - the key for the user's own Kaggle
  // account (created on kaggle.com, Settings -> API), stored
  // encrypted like the API key, the ping key, the Telegram bot
  // token and the Stripe key. Bring your own account (Gary,
  // 2026-11-12): the key belongs to whoever connects it.
  ipcMain.handle('settings:setKaggleApiKey', (_, key) => {
    kaggleApiKeyStorage.setKaggleApiKey(key);
  });
  ipcMain.handle('settings:hasKaggleApiKey', () => {
    return kaggleApiKeyStorage.hasKaggleApiKey();
  });
  ipcMain.handle('settings:deleteKaggleApiKey', () => {
    kaggleApiKeyStorage.deleteKaggleApiKey();
  });

  // Google Authenticator TOTP secret handlers — the second factor
  // for the Google sign-in (Settings > Security, Gary 2026-11-10
  // ~05:37 PST), stored encrypted like the API key, the ping key,
  // the Telegram bot token and the Stripe key. The verify handler
  // checks the typed code against the stored secret HERE, in the
  // main process — the secret never crosses into the renderer
  // after enrollment.
  ipcMain.handle('settings:setTotpSecret', (_, secret) => {
    totpSecretStorage.setTotpSecret(secret);
  });
  ipcMain.handle('settings:hasTotpSecret', () => {
    return totpSecretStorage.hasTotpSecret();
  });
  ipcMain.handle('settings:deleteTotpSecret', () => {
    totpSecretStorage.deleteTotpSecret();
  });
  ipcMain.handle('settings:verifyTotpCode', (_, code) => {
    return verifyTotpCodeAgainstStored(typeof code === 'string' ? code : '');
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
