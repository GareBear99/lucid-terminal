import { IpcMain } from 'electron';
import https from 'https';

// Short-timeout probe of the CDN the app depends on (Monaco). This reflects
// actual reachability from the app's own network stack — not the FixNet
// offline % (a different metric: the share of fixes from offline sources).
const PROBE_URL = 'https://cdn.jsdelivr.net/';
const PROBE_TIMEOUT_MS = 3000;

function probeNetwork(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = https.get(PROBE_URL, { timeout: PROBE_TIMEOUT_MS }, (res) => {
      // Any HTTP response means the endpoint is reachable.
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

export function setupSystemHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('system:checkNetwork', async (): Promise<{ online: boolean }> => {
    const online = await probeNetwork();
    return { online };
  });
}
