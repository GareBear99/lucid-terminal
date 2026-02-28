/**
 * Plugin System Types
 * 
 * Defines the complete plugin architecture for Lucid Terminal.
 * Terminal core is 100% standalone - plugins are optional extensions.
 */

export enum PluginStatus {
  UNMOUNTED = 'unmounted',
  MOUNTING = 'mounting',
  MOUNTED = 'mounted',
  DISMOUNTING = 'dismounting',
  ERROR = 'error'
}

export enum PluginCapability {
  CODE_GENERATION = 'code_generation',
  ERROR_FIXING = 'error_fixing',
  NATURAL_LANGUAGE = 'natural_language',
  FILE_OPERATIONS = 'file_operations',
  GITHUB_INTEGRATION = 'github_integration',
  MODEL_MANAGEMENT = 'model_management'
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  command: string;
  capabilities: PluginCapability[];
  status: PluginStatus;
  icon?: string;
  color?: string;
  autoMount?: boolean;
  mountedAt?: number;
  stats?: {
    commandsExecuted: number;
    tokensUsed: number;
    uptime: number;
  };
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  command: string;
  capabilities: PluginCapability[];
  autoMount: boolean;
  icon: string;
  color: string;
  settings: Record<string, any>;
}

export interface ExecuteOptions {
  streaming?: boolean;
  timeout?: number;
  returnStats?: boolean;
}

export interface TokenStats {
  prompt_tokens: number;
  generated_tokens: number;
  total_tokens: number;
  prompt_chars: number;
  output_chars: number;
  chars_per_token: number;
}

export interface ValidationStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
  timestamp: number;
  message?: string;
}

export interface ExecuteResult {
  success: boolean;
  output: string;
  error?: string;
  stats?: TokenStats;
  validation?: ValidationStep[];
}

export interface PluginAPI {
  list: () => Promise<Plugin[]>;
  get: (pluginId: string) => Promise<Plugin | null>;
  mount: (pluginId: string) => Promise<{ success: boolean; error?: string }>;
  dismount: (pluginId: string) => Promise<{ success: boolean }>;
  execute: (pluginId: string, command: string, options?: ExecuteOptions) => Promise<ExecuteResult>;
  install: (pluginPath: string) => Promise<{ success: boolean; error?: string }>;
  uninstall: (pluginId: string) => Promise<{ success: boolean }>;
  getCapabilities: (pluginId: string) => Promise<PluginCapability[]>;
}
