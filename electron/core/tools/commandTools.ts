/**
 * Command Tools - Shell command execution with safety checks
 * 
 * Ported from LuciferAI's command_tools.py
 * NO LLM required for any operations
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import { ToolResult } from './fileTools';

const execAsync = promisify(exec);

export interface CommandOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  captureOutput?: boolean;
}

export interface EnvInfo {
  cwd: string;
  home: string;
  user: string;
  shell: string;
  path: string[];
  platform: NodeJS.Platform;
  arch: string;
  nodeVersion: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
}

/**
 * Check if a command is risky and requires user confirmation
 */
export function isRiskyCommand(command: string): boolean {
  const riskyPatterns = [
    /^sudo\s/,
    /^rm\s+-rf\s+\//,
    /^rm\s+-rf\s+\*/,
    /^dd\s+if=/,
    /^mkfs/,
    /^format/,
    /^chmod\s+777/,
    /^chown\s+-R/,
    />\s*\/dev\/sd/,
    /curl.*\|\s*bash/,
    /wget.*\|\s*sh/,
  ];
  
  const cmdLower = command.toLowerCase().trim();
  return riskyPatterns.some(pattern => pattern.test(cmdLower));
}

/**
 * Check if a command exists in PATH
 */
export async function checkCommandExists(command: string): Promise<boolean> {
  try {
    const checkCmd = process.platform === 'win32'
      ? `where ${command}`
      : `which ${command}`;
    
    await execAsync(checkCmd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute a shell command with safety checks
 * 
 * @param command - Command to execute
 * @param options - Execution options (cwd, timeout, env)
 */
export async function runCommand(
  command: string,
  options?: CommandOptions
): Promise<ToolResult> {
  // Safety check
  if (isRiskyCommand(command)) {
    return {
      success: false,
      error: `⚠️ Risky command detected: ${command}`,
      metadata: {
        command,
        isRisky: true,
        reason: 'Command requires user confirmation'
      }
    };
  }
  
  const startTime = Date.now();
  const cwd = options?.cwd || process.cwd();
  const timeout = options?.timeout || 30000; // 30s default
  
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      env: { ...process.env, ...options?.env }
    });
    
    const duration = Date.now() - startTime;
    const hasError = stderr.length > 0;
    
    return {
      success: !hasError,
      output: stdout.trim(),
      error: hasError ? stderr.trim() : undefined,
      metadata: {
        command,
        cwd,
        duration,
        exitCode: 0,
        stdout: stdout.length,
        stderr: stderr.length
      }
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    return {
      success: false,
      output: error.stdout?.trim() || '',
      error: error.message || error.stderr?.trim() || 'Command failed',
      metadata: {
        command,
        cwd,
        duration,
        exitCode: error.code || 1,
        killed: error.killed || false,
        signal: error.signal
      }
    };
  }
}

/**
 * Execute Python code directly
 * 
 * @param code - Python code to execute
 * @param timeout - Timeout in milliseconds (default: 10s)
 */
export async function runPythonCode(
  code: string,
  timeout: number = 10000
): Promise<ToolResult> {
  // Escape quotes in code
  const escapedCode = code.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  
  // Check if python3 exists
  const hasPython = await checkCommandExists('python3');
  if (!hasPython) {
    return {
      success: false,
      error: 'Python 3 not found in PATH',
      metadata: { code }
    };
  }
  
  return runCommand(`python3 -c "${escapedCode}"`, { timeout });
}

/**
 * Get current environment information
 */
export function getEnvInfo(): EnvInfo {
  return {
    cwd: process.cwd(),
    home: os.homedir(),
    user: os.userInfo().username,
    shell: process.env.SHELL || 'unknown',
    path: (process.env.PATH || '').split(path.delimiter),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version
  };
}

/**
 * List running processes (simplified)
 */
export async function listProcesses(): Promise<ToolResult> {
  const platform = os.platform();
  
  let command: string;
  if (platform === 'darwin' || platform === 'linux') {
    command = 'ps aux';
  } else if (platform === 'win32') {
    command = 'tasklist';
  } else {
    return {
      success: false,
      error: `Unsupported platform: ${platform}`
    };
  }
  
  const result = await runCommand(command);
  
  if (!result.success) {
    return result;
  }
  
  // Parse output (simplified)
  const lines = result.output?.split('\n') || [];
  const processes = lines.slice(1, 20).filter(line => line.trim()); // First 20 processes
  
  return {
    success: true,
    output: processes.join('\n'),
    metadata: {
      platform,
      count: processes.length,
      command
    }
  };
}

/**
 * Kill a process by PID
 * 
 * @param pid - Process ID to kill
 * @param signal - Signal to send (default: SIGTERM)
 */
export async function killProcess(
  pid: number,
  signal: string = 'SIGTERM'
): Promise<ToolResult> {
  try {
    process.kill(pid, signal);
    
    return {
      success: true,
      output: `Sent ${signal} to process ${pid}`,
      metadata: { pid, signal }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { pid, signal }
    };
  }
}

/**
 * Change current working directory
 * 
 * @param dirPath - Directory to change to
 */
export function changeDirectory(dirPath: string): ToolResult {
  try {
    const expandedPath = dirPath.startsWith('~')
      ? path.join(os.homedir(), dirPath.slice(1))
      : dirPath;
    
    const resolvedPath = path.resolve(expandedPath);
    process.chdir(resolvedPath);
    
    return {
      success: true,
      output: resolvedPath,
      metadata: {
        previous: process.cwd(),
        current: resolvedPath
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { path: dirPath }
    };
  }
}

/**
 * Get current working directory
 */
export function getCurrentDirectory(): ToolResult {
  return {
    success: true,
    output: process.cwd(),
    metadata: {
      cwd: process.cwd(),
      home: os.homedir()
    }
  };
}

/**
 * Execute a script file
 * 
 * @param scriptPath - Path to script file
 * @param args - Arguments to pass to script
 */
export async function runScript(
  scriptPath: string,
  args: string[] = []
): Promise<ToolResult> {
  const ext = path.extname(scriptPath).toLowerCase();
  
  // Determine interpreter based on extension
  let command: string;
  switch (ext) {
    case '.py':
      command = `python3 ${scriptPath} ${args.join(' ')}`;
      break;
    case '.js':
      command = `node ${scriptPath} ${args.join(' ')}`;
      break;
    case '.ts':
      command = `ts-node ${scriptPath} ${args.join(' ')}`;
      break;
    case '.sh':
      command = `bash ${scriptPath} ${args.join(' ')}`;
      break;
    default:
      return {
        success: false,
        error: `Unsupported script type: ${ext}`,
        metadata: { scriptPath, ext }
      };
  }
  
  return runCommand(command);
}

/**
 * Find virtual environments in directory
 */
export async function findVirtualEnvs(searchDir: string = '.'): Promise<ToolResult> {
  const envDirs = ['venv', 'env', '.venv', 'virtualenv'];
  const foundEnvs: string[] = [];
  
  for (const envDir of envDirs) {
    const envPath = path.join(searchDir, envDir);
    const activatePath = path.join(envPath, 'bin', 'activate');
    
    try {
      const fs = await import('fs/promises');
      await fs.access(activatePath);
      foundEnvs.push(envPath);
    } catch {
      // Environment doesn't exist
    }
  }
  
  // Also check for conda
  const condaExists = await checkCommandExists('conda');
  if (condaExists) {
    const result = await runCommand('conda env list');
    if (result.success && result.output) {
      const condaEnvs = result.output
        .split('\n')
        .filter(line => line.trim() && !line.startsWith('#'))
        .map(line => line.split(/\s+/)[0]);
      
      foundEnvs.push(...condaEnvs.map(name => `conda:${name}`));
    }
  }
  
  return {
    success: true,
    output: foundEnvs.join('\n'),
    metadata: {
      searchDir,
      count: foundEnvs.length,
      environments: foundEnvs
    }
  };
}

/**
 * Activate a virtual environment
 * 
 * @param envPath - Path to environment or conda env name
 */
export function activateEnvironment(envPath: string): ToolResult {
  // For conda environments
  if (envPath.startsWith('conda:')) {
    const envName = envPath.replace('conda:', '');
    return {
      success: true,
      output: `Run: conda activate ${envName}`,
      metadata: {
        type: 'conda',
        name: envName,
        command: `conda activate ${envName}`
      }
    };
  }
  
  // For venv/virtualenv
  const activateScript = process.platform === 'win32'
    ? path.join(envPath, 'Scripts', 'activate.bat')
    : path.join(envPath, 'bin', 'activate');
  
  return {
    success: true,
    output: `Run: source ${activateScript}`,
    metadata: {
      type: 'venv',
      path: envPath,
      activateScript,
      command: `source ${activateScript}`
    }
  };
}

/**
 * Get system information
 */
export function getSystemInfo(): ToolResult {
  const info = {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    hostname: os.hostname(),
    nodeVersion: process.version,
    homeDir: os.homedir(),
    tmpDir: os.tmpdir()
  };
  
  const output = [
    `Platform: ${info.platform} (${info.arch})`,
    `CPUs: ${info.cpus}`,
    `Memory: ${formatBytes(info.freeMemory)} / ${formatBytes(info.totalMemory)}`,
    `Uptime: ${formatUptime(info.uptime)}`,
    `Hostname: ${info.hostname}`,
    `Node: ${info.nodeVersion}`,
    `Home: ${info.homeDir}`
  ].join('\n');
  
  return {
    success: true,
    output,
    metadata: info
  };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format uptime to human readable
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.join(' ') || '0m';
}
