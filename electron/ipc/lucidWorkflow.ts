import { IpcMain, IpcMainEvent } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import LucidCore from '../core/lucidCore';
import { getUserIdInfo } from '../core/systemId';
import {
  findInstalledModelFiles,
  resolveBackendDir,
  verifyTinyLlamaInstalled,
} from '../core/llm/modelFiles';

let lucidCore: LucidCore | null = null;

/**
 * Whether any LLM model is actually available (loaded). False when
 * LucidCore is not initialized or no model is up. Used by the AI chat
 * handler so a message is never sent to a model-less backend — that
 * answers with a raw Python error instead of a reply.
 *
 * NOTE — two different questions, kept separate on purpose (see
 * electron/core/llm/modelFiles.ts): this guard asks "is a model server
 * answering right now" (HTTP probes to localhost:8080-8085 via
 * getModelStatuses). The startup disclaimer asks "is a model FILE
 * installed" (a .gguf/.llamafile in ~/.lucid/models or
 * LUCID-BACKEND/models). A file can be installed with no server up, and
 * a server entry can exist with no file behind it. The Python backend
 * loads files from LUCID-BACKEND/models and defaults to llama3.2, so a
 * bare file-presence check must NOT widen this guard — with only
 * TinyLlama installed the backend's default model is still missing, and
 * routing chat at it would trade the clean "No model loaded" error for
 * a backend crash. The file question belongs to the startup check and
 * the installer; the live question belongs here and to the dot.
 */
export async function isAnyModelAvailable(): Promise<boolean> {
  if (!lucidCore) return false;
  try {
    const statuses = await lucidCore.getModelStatuses();
    for (const up of statuses.values()) {
      if (up) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Format a byte count as a human-readable string (e.g. "12.4 GB"). */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * Disk usage of the volume holding the model directory.
 * Same default location as LlamafileManager (~/.lucid/models); falls back
 * to the home directory when the models directory does not exist yet.
 */
function getModelStorageInfo(): { used: string; available: string } {
  const modelsDir = path.join(os.homedir(), '.lucid', 'models');
  const target = fs.existsSync(modelsDir) ? modelsDir : os.homedir();
  const stats = fs.statfsSync(target);
  const totalBytes = stats.blocks * stats.bsize;
  const availableBytes = stats.bavail * stats.bsize;
  const usedBytes = totalBytes - stats.bfree * stats.bsize;
  return { used: formatBytes(usedBytes), available: formatBytes(availableBytes) };
}

// ============================================================================
// BUNDLED TINYLLAMA INSTALL
// ============================================================================

// Guard against two concurrent installs stomping on the same download.
let tinyLlamaInstallInProgress = false;

/** How long the bundled-model download may run before it is called stuck. */
const INSTALL_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Run the backend's bundled-model setup script
 * (LUCID-BACKEND/setup_bundled_models.sh: llamafile 0.10.6 + TinyLlama
 * 1.1B Q4_K_M into LUCID-BACKEND/models/). Streams output lines to
 * onLine as they arrive so the UI can show real progress. Resolves with
 * the exit code and the tail of the output — never throws.
 */
function runSetupScript(
  scriptPath: string,
  cwd: string,
  onLine: (line: string) => void
): Promise<{ success: boolean; error?: string; output: string }> {
  return new Promise((resolve) => {
    const tail: string[] = [];
    const pushLine = (raw: string) => {
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        tail.push(trimmed);
        if (tail.length > 100) tail.shift();
        onLine(trimmed);
      }
    };

    let child;
    try {
      child = spawn('bash', [scriptPath], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error: any) {
      resolve({ success: false, error: `Could not start the installer: ${error?.message ?? String(error)}`, output: '' });
      return;
    }

    const timeout = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      resolve({
        success: false,
        error: 'Install timed out after 30 minutes — the download may have stalled. Try again when the connection is better.',
        output: tail.join('\n'),
      });
    }, INSTALL_TIMEOUT_MS);
    // A pending timer must not keep the app alive on its own.
    timeout.unref?.();

    child.stdout?.on('data', (d: Buffer) => pushLine(d.toString('utf-8')));
    child.stderr?.on('data', (d: Buffer) => pushLine(d.toString('utf-8')));
    child.on('error', (error: Error) => {
      clearTimeout(timeout);
      resolve({ success: false, error: `Could not start the installer: ${error.message}`, output: tail.join('\n') });
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ success: true, output: tail.join('\n') });
      } else {
        const last = tail.length > 0 ? tail[tail.length - 1] : '';
        resolve({
          success: false,
          error: `Installer exited with code ${code}${last ? `: ${last}` : ''}`,
          output: tail.join('\n'),
        });
      }
    });
  });
}

/**
 * The real TinyLlama install: run the bundled-model setup script, then
 * verify the model file is actually on disk and a valid GGUF. Success is
 * only reported when the file check passes — the script's own "Setup
 * complete!" is not trusted on its own. Shared by the
 * `lucid:installTinyLlama` handler and the `lucid:installModel`
 * handler for 'tinyllama'.
 */
async function installTinyLlama(
  event: IpcMainEvent
): Promise<{ success: boolean; modelPath?: string; output?: string; error?: string }> {
  if (tinyLlamaInstallInProgress) {
    return { success: false, error: 'A TinyLlama install is already running.' };
  }

  const backendDir = resolveBackendDir();
  if (!backendDir) {
    return {
      success: false,
      error: 'Could not find the LuciferAI backend folder (LUCID-BACKEND), so the bundled-model installer is not available in this install.',
    };
  }
  const scriptPath = path.join(backendDir, 'setup_bundled_models.sh');
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `Bundled-model setup script not found: ${scriptPath}` };
  }

  tinyLlamaInstallInProgress = true;
  try {
    const sender = event.sender;
    const result = await runSetupScript(scriptPath, backendDir, (line) => {
      if (!sender.isDestroyed()) {
        sender.send('lucid:installTinyLlama:progress', line);
      }
    });
    if (!result.success) {
      return { success: false, error: result.error, output: result.output };
    }

    // The script says it is done — prove it before claiming success.
    const check = verifyTinyLlamaInstalled(path.join(backendDir, 'models'));
    if (!check.installed) {
      return {
        success: false,
        error: `Install finished but the TinyLlama model is not usable: ${check.reason} (${check.path})`,
        output: result.output,
      };
    }
    return { success: true, modelPath: check.path, output: result.output };
  } finally {
    tinyLlamaInstallInProgress = false;
  }
}

export function setupLucidWorkflowHandlers(ipcMain: IpcMain): void {
  // Initialize Lucid Core
  ipcMain.handle('lucid:init', async () => {
    console.log('[Main] lucid:init called');
    try {
      console.log('[Main] Initializing LucidCore...');
      lucidCore = await LucidCore.initialize({
        workingDirectory: process.cwd()
      });
      console.log('[Main] ✅ LucidCore initialized successfully');
      return { success: true };
    } catch (error: any) {
      console.error('[Main] ❌ Failed to initialize Lucid Core:', error);
      return { success: false, error: error.message };
    }
  });

  // Process command through workflow
  ipcMain.handle('lucid:command', async (_, userInput: string) => {
    if (!lucidCore) {
      return {
        success: false,
        error: 'Lucid Core not initialized. Call lucid:init first.'
      };
    }

    try {
      const { result, display, terminalOutput } = await lucidCore.processCommand(userInput);
      return {
        success: true,
        result,
        display,
        terminalOutput
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Get conversation history
  ipcMain.handle('lucid:getHistory', () => {
    if (!lucidCore) return [];
    return lucidCore.getConversationHistory();
  });

  // Clear conversation history
  ipcMain.handle('lucid:clearHistory', () => {
    if (!lucidCore) return;
    lucidCore.clearHistory();
  });

  // Get FixNet stats
  ipcMain.handle('lucid:getFixNetStats', async () => {
    if (!lucidCore) return null;
    return await lucidCore.getFixNetStats();
  });

  // Get model statuses
  ipcMain.handle('lucid:getModelStatuses', async () => {
    if (!lucidCore) return new Map();
    const statuses = await lucidCore.getModelStatuses();
    // Convert Map to object for IPC transfer
    return Object.fromEntries(statuses);
  });

  // Get token stats
  ipcMain.handle('lucid:getTokenStats', () => {
    if (!lucidCore) return null;
    return lucidCore.getSessionTokenStats();
  });

  // Change directory
  ipcMain.handle('lucid:changeDirectory', (_, newDir: string) => {
    if (!lucidCore) return;
    lucidCore.changeDirectory(newDir);
  });

  // Get current directory
  ipcMain.handle('lucid:getWorkingDirectory', () => {
    if (!lucidCore) return process.cwd();
    return lucidCore.getWorkingDirectory();
  });

  // Get welcome message
  ipcMain.handle('lucid:getWelcome', () => {
    if (!lucidCore) return '';
    return lucidCore.getWelcome();
  });

  // Get help message
  ipcMain.handle('lucid:getHelp', () => {
    console.log('[Main] lucid:getHelp called, lucidCore exists:', !!lucidCore);
    if (!lucidCore) {
      console.log('[Main] ⚠️ lucidCore not initialized!');
      return '';
    }
    const help = lucidCore.getHelp();
    console.log('[Main] Returning help text, length:', help.length);
    return help;
  });
  
  // Workflow status
  ipcMain.handle('lucid:workflowStatus', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const modelStatuses = await lucidCore.getModelStatuses();
      const tokenStats = lucidCore.getSessionTokenStats();
      const fixnetStats = await lucidCore.getFixNetStats();
      
      return {
        success: true,
        workflow: {
          initialized: true,
          workingDirectory: lucidCore.getWorkingDirectory()
        },
        models: Object.fromEntries(modelStatuses),
        tokens: tokenStats,
        fixnet: fixnetStats
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // FixNet search
  ipcMain.handle('lucid:fixnetSearch', async (_, query: string) => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const results = await lucidCore.searchFixNet(query);
      return { success: true, results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // LLM list
  ipcMain.handle('lucid:llmList', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const statuses = await lucidCore.getModelStatuses();
      return { 
        success: true, 
        models: Array.from(statuses.entries()).map(([name, enabled]) => ({ name, enabled }))
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // LLM enable/disable
  ipcMain.handle('lucid:llmSetEnabled', async (_, model: string, enabled: boolean) => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      lucidCore.setModelEnabled(model, enabled);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Get user ID (FixNet-backed account system)
  ipcMain.handle('lucid:getUserId', async () => {
    try {
      const idInfo = getUserIdInfo();
      return {
        success: true,
        userId: idInfo.userId,
        isPermanent: idInfo.isPermanent,
        githubUsername: idInfo.githubUsername,
        storagePath: idInfo.storagePath
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // ============================================================================
  // PHASE 2: MODEL INSTALLATION
  // ============================================================================

  // Get model storage info (disk used / available on the models volume)
  ipcMain.handle('lucid:getStorageInfo', async () => {
    try {
      const storage = getModelStorageInfo();
      return { success: true, storage };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Is any model FILE installed? The startup disclaimer asks this — it
  // scans every model directory the code actually uses
  // (~/.lucid/models and LUCID-BACKEND/models; see modelFiles.ts).
  // Needs no LucidCore: it is plain filesystem work, so it runs even
  // before init and never blocks the app from opening. Never throws.
  ipcMain.handle('lucid:checkModelsInstalled', async () => {
    try {
      const scan = findInstalledModelFiles();
      return {
        installed: scan.installed,
        files: scan.files.map((f) => ({ name: f.name, path: f.path, sizeBytes: f.sizeBytes })),
        dirsChecked: scan.dirsChecked,
        errors: scan.errors,
      };
    } catch (error: any) {
      return {
        installed: false,
        files: [],
        dirsChecked: [],
        errors: [error?.message ?? String(error)],
      };
    }
  });

  // Install the bundled TinyLlama model (llamafile 0.10.6 + TinyLlama
  // 1.1B Q4_K_M, ~700 MB). Runs LUCID-BACKEND/setup_bundled_models.sh
  // and reports the REAL result: progress lines arrive on
  // 'lucid:installTinyLlama:progress', and success is only reported when
  // the model file is verified on disk afterwards. No auto-download —
  // this handler only runs when the user clicks Install.
  ipcMain.handle('lucid:installTinyLlama', async (event) => {
    return await installTinyLlama(event);
  });

  // Install model by name — TinyLlama goes through the real bundled
  // installer above. Anything else has no working installer in this
  // build (the old path routed through the command dispatcher, which
  // fails every direct command except help/fixnet stats/fixnet search),
  // so it reports that plainly instead of a fake success.
  ipcMain.handle('lucid:installModel', async (event, modelName: string) => {
    const name = (modelName || '').trim().toLowerCase();
    if (name === 'tinyllama' || name.startsWith('tinyllama-') || name.startsWith('tinyllama ')) {
      return await installTinyLlama(event);
    }
    return {
      success: false,
      error: `Installing "${modelName}" is not available yet — there is no working installer for it in this build. TinyLlama (the bundled model) is the only one that can be installed right now.`,
    };
  });

  // Uninstall model — actually removes the model file(s) from the model
  // directories and reports what happened. Success only when at least
  // one file was removed; "not installed" is reported, not hidden.
  ipcMain.handle('lucid:uninstallModel', async (_, modelName: string) => {
    const name = (modelName || '').trim().toLowerCase();
    if (!name) {
      return { success: false, error: 'No model name given.' };
    }
    try {
      const scan = findInstalledModelFiles();
      const matches = scan.files.filter((f) => {
        const base = f.name.replace(/\.(gguf|llamafile)$/i, '').toLowerCase();
        return base.includes(name) || name.includes(base);
      });
      if (matches.length === 0) {
        return { success: false, error: `"${modelName}" is not installed — nothing to uninstall.` };
      }
      const removed: string[] = [];
      const failed: string[] = [];
      for (const file of matches) {
        try {
          fs.unlinkSync(file.path);
          // Drop the checksum sidecar the installer writes, if present.
          const sidecar = `${file.path}.sha256`;
          if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
          removed.push(file.name);
        } catch (error: any) {
          failed.push(`${file.name}: ${error?.message ?? String(error)}`);
        }
      }
      if (failed.length > 0) {
        return {
          success: removed.length > 0,
          output: removed.length > 0 ? `Removed: ${removed.join(', ')}` : undefined,
          error: `Could not remove: ${failed.join('; ')}`,
        };
      }
      return { success: true, output: `Removed: ${removed.join(', ')}` };
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) };
    }
  });
  
  // Install models by tier
  ipcMain.handle('lucid:installTier', async (_, tier: number) => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand(`install tier ${tier}`);
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Install core models
  ipcMain.handle('lucid:installCoreModels', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('install core');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // ============================================================================
  // PHASE 2: FIXNET AUTO-FIX
  // ============================================================================
  
  // Auto-fix Python script
  ipcMain.handle('lucid:fixScript', async (_, filepath: string) => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand(`fix ${filepath}`);
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Sync FixNet dictionary to GitHub
  ipcMain.handle('lucid:fixnetSync', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('fixnet sync');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // ============================================================================
  // PHASE 2: GITHUB INTEGRATION
  // ============================================================================
  
  // Link GitHub account
  ipcMain.handle('lucid:githubLink', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('github link');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Unlink GitHub account
  ipcMain.handle('lucid:githubUnlink', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('github unlink');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Get GitHub status
  ipcMain.handle('lucid:githubStatus', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('github status');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Upload project to GitHub
  ipcMain.handle('lucid:githubUpload', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('github upload');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Update GitHub repository
  ipcMain.handle('lucid:githubUpdate', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('github update');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // List GitHub projects
  ipcMain.handle('lucid:githubProjects', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('github projects');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // ============================================================================
  // PHASE 2: ENVIRONMENT MANAGEMENT
  // ============================================================================
  
  // List all environments
  ipcMain.handle('lucid:listEnvironments', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('envs');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Search for environment
  ipcMain.handle('lucid:searchEnvironment', async (_, query: string) => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand(`env search ${query}`);
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Activate environment
  ipcMain.handle('lucid:activateEnvironment', async (_, name: string) => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand(`env activate ${name}`);
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // ============================================================================
  // PHASE 2: SYSTEM COMMANDS
  // ============================================================================
  
  // Get system info
  ipcMain.handle('lucid:systemInfo', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('info');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Get memory stats
  ipcMain.handle('lucid:memoryStats', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('memory');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Get main menu
  ipcMain.handle('lucid:mainMenu', async () => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand('mainmenu');
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
