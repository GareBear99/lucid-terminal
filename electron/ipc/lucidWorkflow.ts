import { IpcMain } from 'electron';
import LucidCore from '../core/lucidCore';
import { getUserIdInfo } from '../core/systemId';

let lucidCore: LucidCore | null = null;

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
  
  // Install model by name
  ipcMain.handle('lucid:installModel', async (_, modelName: string) => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand(`install ${modelName}`);
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  
  // Uninstall model
  ipcMain.handle('lucid:uninstallModel', async (_, modelName: string) => {
    if (!lucidCore) {
      return { success: false, error: 'LucidCore not initialized' };
    }
    
    try {
      const result = await lucidCore.processCommand(`uninstall ${modelName}`);
      return {
        success: result.result.success,
        output: result.terminalOutput,
        error: result.result.success ? undefined : result.result.output
      };
    } catch (error: any) {
      return { success: false, error: error.message };
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
