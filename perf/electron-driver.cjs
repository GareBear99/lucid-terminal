/**
 * Electron driver for the splash perf harness.
 *
 * Loads the harness page in a real Chromium renderer, waits for
 * window.__splashPerfDone, prints the result JSON to stdout, exits.
 *
 * Chromium flags (e.g. --disable-gpu for the CPU/software fallback)
 * must come BEFORE the script path — Electron only treats flags
 * before the script as Chromium switches:
 *
 *   electron --disable-gpu --no-sandbox perf/electron-driver.cjs <url>
 *
 * Run under xvfb-run so the window is on a (virtual) display: a hidden
 * window throttles requestAnimationFrame and the numbers would be lies.
 *
 * Usage: electron perf/electron-driver.cjs <harness-url>
 */
const { app, BrowserWindow } = require('electron');

const url = process.argv[process.argv.length - 1];
if (!url || !url.startsWith('http')) {
  console.error('usage: electron perf/electron-driver.cjs <harness-url>');
  process.exit(2);
}

async function main() {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: true, // must be visible (under Xvfb) or rAF throttles
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.error(`[page:${level}] ${message}`);
  });
  await win.loadURL(url);

  const deadline = Date.now() + 20000;
  let result = null;
  while (Date.now() < deadline) {
    try {
      const done = await win.webContents.executeJavaScript('window.__splashPerfDone === true');
      if (done) {
        result = await win.webContents.executeJavaScript('window.__splashPerf');
        break;
      }
    } catch {
      // Page not ready yet; keep polling.
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!result) {
    console.error('ERROR: harness did not finish within 20s');
    process.exitCode = 1;
  } else {
    console.log(
      JSON.stringify({
        ...result,
        meta: {
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          gpuDisabled: process.argv.includes('--disable-gpu'),
        },
      }),
    );
  }
  app.quit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
