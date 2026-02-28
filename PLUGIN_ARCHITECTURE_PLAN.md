# Lucid Terminal - Plugin Architecture & Warp-Style Validation Plan

**Goal:** Transform Lucid Terminal into a plugin-based system with Warp AI-style command validation and comprehensive token tracking.

---

## Executive Summary

**Current State:**
- Terminal tightly coupled to LuciferAI Python backend
- No plugin system - hardcoded integration
- No command validation checkmarks
- No frontend token tracking display

**Target State:**
- Terminal 100% standalone (zero Python dependencies)
- Plugin-based architecture (mount/dismount any plugin)
- Warp-style ✓/✗ validation for every command
- Real-time token tracking display
- Plugin manager UI

---

## 1. Plugin Architecture

### Core Principle
```
Terminal Core (TypeScript/Electron)
    ↓ Plugin API (IPC Layer)
    ↓
Plugins (Independent Processes)
    • LuciferAI (Python)
    • Future: GitHub Copilot CLI
    • Future: Custom plugins
```

**Terminal Core:**
- Shell command execution (ls, cd, git, npm)
- Input/output handling
- UI rendering
- Plugin registry
- Plugin lifecycle management

**Plugins:**
- Run as separate processes
- Communicate via IPC
- Can be mounted/dismounted
- Independent failure domain
- Own dependencies

---

## 2. Plugin API Specification

### Plugin Interface

```typescript
interface Plugin {
  id: string;                    // unique identifier
  name: string;                  // display name
  version: string;               // semantic version
  description: string;           // description
  author: string;                // author
  command: string;               // executable command
  capabilities: Capability[];    // what the plugin can do
  status: PluginStatus;          // mounted/dismounted/error
}

enum PluginStatus {
  UNMOUNTED = 'unmounted',
  MOUNTING = 'mounting',
  MOUNTED = 'mounted',
  DISMOUNTING = 'dismounting',
  ERROR = 'error'
}

enum Capability {
  CODE_GENERATION = 'code_generation',
  ERROR_FIXING = 'error_fixing',
  NATURAL_LANGUAGE = 'natural_language',
  FILE_OPERATIONS = 'file_operations',
  GITHUB_INTEGRATION = 'github_integration',
  MODEL_MANAGEMENT = 'model_management'
}
```

### IPC Methods

```typescript
// Plugin Lifecycle
plugin.mount(): Promise<{success: boolean, error?: string}>
plugin.dismount(): Promise<{success: boolean}>
plugin.isAvailable(): boolean
plugin.getStatus(): PluginStatus
plugin.getCapabilities(): Capability[]

// Plugin Execution
plugin.execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>

interface ExecuteOptions {
  streaming?: boolean;
  timeout?: number;
  returnStats?: boolean;
}

interface ExecuteResult {
  success: boolean;
  output: string;
  error?: string;
  stats?: TokenStats;
  validation?: ValidationStep[];
}

interface TokenStats {
  prompt_tokens: number;
  generated_tokens: number;
  total_tokens: number;
  prompt_chars: number;
  output_chars: number;
  chars_per_token: number;
}

interface ValidationStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
  timestamp: number;
  message?: string;
}
```

---

## 3. Plugin Registry

### File Structure
```
~/.lucid-terminal/
├── plugins/
│   ├── registry.json           # Installed plugins metadata
│   ├── luciferai/
│   │   ├── plugin.json         # LuciferAI plugin manifest
│   │   ├── start.sh            # Start script
│   │   └── ...
│   └── custom-plugin/
│       ├── plugin.json
│       └── ...
```

### plugin.json (LuciferAI Example)
```json
{
  "id": "luciferai",
  "name": "LuciferAI",
  "version": "2.0.0",
  "description": "AI-powered code generation with offline fix database",
  "author": "GareBear99",
  "command": "python3 LUCID-BACKEND/core/stdio_agent.py",
  "capabilities": [
    "code_generation",
    "error_fixing",
    "natural_language",
    "file_operations",
    "github_integration",
    "model_management"
  ],
  "autoMount": true,
  "icon": "🩸",
  "color": "#dc2626",
  "settings": {
    "maxRetries": 3,
    "timeout": 60000,
    "backend": "llamafile"
  }
}
```

### registry.json
```json
{
  "version": "1.0.0",
  "plugins": [
    {
      "id": "luciferai",
      "enabled": true,
      "mountedAt": 1709057615000,
      "lastUsed": 1709058000000,
      "stats": {
        "commandsExecuted": 42,
        "tokensUsed": 12458,
        "uptime": 3600000
      }
    }
  ],
  "settings": {
    "autoMountOnStartup": true,
    "maxConcurrentPlugins": 3
  }
}
```

---

## 4. Command Validation System (Warp-Style)

### Validation Flow

Every command goes through validation steps with real-time ✓/✗ indicators:

```
User types command → /build a script
    ↓
[⏳] Parsing command...
    ↓
[✓] Parsed as: build (type: 'build')
    ↓
[⏳] Routing to plugin...
    ↓
[✓] Routed to: LuciferAI
    ↓
[⏳] Executing: code_generation
    ↓
[✓] Generated: script.py
    ↓
[⏳] Validating output...
    ↓
[✓] Complete
```

### Implementation

**1. Add Validation State to TerminalBlock**

```typescript
// src/types.ts
interface TerminalBlock {
  id: string;
  command: string;
  output: string;
  timestamp: number;
  isComplete: boolean;
  isCollapsed: boolean;
  
  // NEW: Validation tracking
  validation?: {
    steps: ValidationStep[];
    currentStep: number;
    status: 'running' | 'complete' | 'error';
  };
  
  // NEW: Token tracking
  tokens?: TokenStats;
}
```

**2. Update commandRouter.ts**

```typescript
export function parseCommand(input: string): ParsedCommand & {
  validation: ValidationStep[]
} {
  const validation: ValidationStep[] = [];
  
  // Step 1: Parsing
  validation.push({
    id: 'parse',
    label: 'Parsing command',
    status: 'running',
    timestamp: Date.now()
  });
  
  const trimmed = input.trim();
  const parsed = /* ...parsing logic... */;
  
  validation[0].status = 'success';
  validation[0].message = `Parsed as: ${parsed.command} (type: '${parsed.type}')`;
  
  // Step 2: Routing
  validation.push({
    id: 'route',
    label: 'Routing to handler',
    status: 'running',
    timestamp: Date.now()
  });
  
  const route = /* ...routing logic... */;
  
  validation[1].status = 'success';
  validation[1].message = route.isShell ? 
    'Direct shell execution' : 
    `Routed to: LuciferAI plugin`;
  
  return {
    ...parsed,
    validation
  };
}
```

**3. Create ValidationIndicator Component**

```typescript
// src/components/Terminal/ValidationIndicator.tsx
import { Check, X, Loader2 } from 'lucide-react';

interface ValidationIndicatorProps {
  step: ValidationStep;
}

export function ValidationIndicator({ step }: ValidationIndicatorProps) {
  const getIcon = () => {
    switch (step.status) {
      case 'pending':
        return <span className="text-gray-400">⏳</span>;
      case 'running':
        return <Loader2 size={12} className="animate-spin text-yellow-500" />;
      case 'success':
        return <Check size={12} className="text-green-500" />;
      case 'error':
        return <X size={12} className="text-red-500" />;
    }
  };
  
  return (
    <div className="flex items-center gap-2 text-xs font-mono text-gray-300 py-0.5">
      {getIcon()}
      <span>{step.label}</span>
      {step.message && (
        <span className="text-gray-500">→ {step.message}</span>
      )}
    </div>
  );
}
```

**4. Display in Block Component**

```typescript
// src/components/Terminal/Block.tsx
export function Block({ block }: BlockProps) {
  return (
    <div className="block">
      {/* Command header */}
      <div className="command">$ {block.command}</div>
      
      {/* Validation steps (Warp-style) */}
      {block.validation && (
        <div className="validation-steps border-l-2 border-gray-700 pl-3 my-2">
          {block.validation.steps.map(step => (
            <ValidationIndicator key={step.id} step={step} />
          ))}
        </div>
      )}
      
      {/* Output */}
      <div className="output">{block.output}</div>
      
      {/* Token stats */}
      {block.tokens && (
        <TokenDisplay tokens={block.tokens} />
      )}
    </div>
  );
}
```

---

## 5. Token Tracking Display

### Frontend Component

```typescript
// src/components/Terminal/TokenDisplay.tsx
interface TokenDisplayProps {
  tokens: TokenStats;
}

export function TokenDisplay({ tokens }: TokenDisplayProps) {
  return (
    <div className="text-xs text-gray-500 font-mono mt-2 border-t border-gray-800 pt-2">
      [Input: {tokens.prompt_tokens} tokens ({tokens.prompt_chars} chars), 
       Output: {tokens.generated_tokens} tokens ({tokens.output_chars} chars), 
       Total: {tokens.total_tokens} tokens]
      <span className="ml-2 text-gray-600">
        ({tokens.chars_per_token.toFixed(2)} chars/token)
      </span>
    </div>
  );
}
```

### Backend Integration

**Update LuciferAI plugin to return token stats:**

```python
# LUCID-BACKEND/core/stdio_agent.py
def handle_command(command: str) -> dict:
    result = execute_command(command)
    
    return {
        "success": True,
        "output": result.output,
        "tokens": {
            "prompt_tokens": result.prompt_tokens,
            "generated_tokens": result.generated_tokens,
            "total_tokens": result.total_tokens,
            "prompt_chars": len(command),
            "output_chars": len(result.output),
            "chars_per_token": result.chars_per_token
        },
        "validation": [
            {"id": "parse", "label": "Parsing", "status": "success"},
            {"id": "route", "label": "Routing", "status": "success"},
            {"id": "execute", "label": "Executing", "status": "success"}
        ]
    }
```

---

## 6. Plugin Manager UI

### Component Structure

```typescript
// src/components/Plugins/PluginManager.tsx
export function PluginManager({ onClose }: { onClose: () => void }) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  
  useEffect(() => {
    // Load plugins from registry
    window.lucidAPI.plugins.list().then(setPlugins);
  }, []);
  
  return (
    <div className="plugin-manager-modal">
      <header>
        <h2>Plugin Manager</h2>
        <button onClick={onClose}>×</button>
      </header>
      
      <div className="plugin-list">
        {plugins.map(plugin => (
          <PluginCard
            key={plugin.id}
            plugin={plugin}
            onClick={() => setSelectedPlugin(plugin)}
            onToggle={() => togglePlugin(plugin.id)}
          />
        ))}
        
        <AddPluginButton />
      </div>
      
      {selectedPlugin && (
        <PluginDetails plugin={selectedPlugin} />
      )}
    </div>
  );
}
```

### PluginCard Component

```typescript
function PluginCard({ plugin, onClick, onToggle }: PluginCardProps) {
  return (
    <div 
      className="plugin-card"
      onClick={onClick}
    >
      <div className="plugin-header">
        <span className="plugin-icon">{plugin.icon}</span>
        <h3>{plugin.name}</h3>
        <span className="plugin-version">v{plugin.version}</span>
        <span className={`status-badge status-${plugin.status}`}>
          {plugin.status}
        </span>
      </div>
      
      <p className="plugin-description">{plugin.description}</p>
      
      <div className="plugin-footer">
        <div className="capabilities">
          {plugin.capabilities.map(cap => (
            <span key={cap} className="capability-badge">{cap}</span>
          ))}
        </div>
        
        <button
          className="toggle-button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {plugin.status === 'mounted' ? 'Dismount' : 'Mount'}
        </button>
      </div>
    </div>
  );
}
```

### Add Plugin Button in Header

```typescript
// src/components/Layout/Header.tsx (or StatusBar)
export function Header() {
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [activePlugins, setActivePlugins] = useState(0);
  
  useEffect(() => {
    window.lucidAPI.plugins.list().then(plugins => {
      setActivePlugins(plugins.filter(p => p.status === 'mounted').length);
    });
  }, []);
  
  return (
    <header className="app-header">
      {/* Other header content */}
      
      <button
        className="plugin-button"
        onClick={() => setShowPluginManager(true)}
      >
        <Puzzle size={18} />
        {activePlugins > 0 && (
          <span className="plugin-count">{activePlugins}</span>
        )}
      </button>
      
      {showPluginManager && (
        <PluginManager onClose={() => setShowPluginManager(false)} />
      )}
    </header>
  );
}
```

---

## 7. Plugin IPC Layer

### New IPC Handlers

```typescript
// electron/ipc/plugins.ts
import { ipcMain } from 'electron';
import { PluginRegistry } from '../core/PluginRegistry';

const registry = new PluginRegistry();

export function registerPluginHandlers() {
  // List all plugins
  ipcMain.handle('plugins:list', async () => {
    return registry.list();
  });
  
  // Get plugin details
  ipcMain.handle('plugins:get', async (_, pluginId: string) => {
    return registry.get(pluginId);
  });
  
  // Mount plugin
  ipcMain.handle('plugins:mount', async (_, pluginId: string) => {
    return registry.mount(pluginId);
  });
  
  // Dismount plugin
  ipcMain.handle('plugins:dismount', async (_, pluginId: string) => {
    return registry.dismount(pluginId);
  });
  
  // Execute command via plugin
  ipcMain.handle('plugins:execute', async (_, pluginId: string, command: string, options?: ExecuteOptions) => {
    return registry.execute(pluginId, command, options);
  });
  
  // Install new plugin
  ipcMain.handle('plugins:install', async (_, pluginPath: string) => {
    return registry.install(pluginPath);
  });
  
  // Uninstall plugin
  ipcMain.handle('plugins:uninstall', async (_, pluginId: string) => {
    return registry.uninstall(pluginId);
  });
  
  // Get plugin capabilities
  ipcMain.handle('plugins:getCapabilities', async (_, pluginId: string) => {
    return registry.getCapabilities(pluginId);
  });
}
```

### PluginRegistry Class

```typescript
// electron/core/PluginRegistry.ts
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

export class PluginRegistry {
  private plugins: Map<string, PluginInstance> = new Map();
  private registryPath: string;
  
  constructor() {
    this.registryPath = path.join(
      process.env.HOME || process.env.USERPROFILE!,
      '.lucid-terminal',
      'plugins',
      'registry.json'
    );
    this.load();
  }
  
  async load() {
    try {
      const data = await fs.readFile(this.registryPath, 'utf-8');
      const registry = JSON.parse(data);
      
      for (const plugin of registry.plugins) {
        await this.loadPlugin(plugin.id);
      }
    } catch (error) {
      // No registry yet - create default
      await this.createDefaultRegistry();
    }
  }
  
  async mount(pluginId: string): Promise<{success: boolean, error?: string}> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return { success: false, error: 'Plugin not found' };
    }
    
    if (plugin.status === 'mounted') {
      return { success: true };
    }
    
    try {
      // Start plugin process
      const process = spawn(plugin.manifest.command, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      plugin.process = process;
      plugin.status = 'mounted';
      plugin.mountedAt = Date.now();
      
      // Set up IPC communication
      this.setupPluginIPC(plugin);
      
      return { success: true };
    } catch (error) {
      plugin.status = 'error';
      return { success: false, error: String(error) };
    }
  }
  
  async dismount(pluginId: string): Promise<{success: boolean}> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || plugin.status !== 'mounted') {
      return { success: true };
    }
    
    try {
      plugin.process?.kill();
      plugin.status = 'unmounted';
      plugin.process = null;
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }
  
  async execute(
    pluginId: string,
    command: string,
    options?: ExecuteOptions
  ): Promise<ExecuteResult> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || plugin.status !== 'mounted') {
      return {
        success: false,
        output: '',
        error: 'Plugin not mounted'
      };
    }
    
    // Send command to plugin via stdin
    return new Promise((resolve) => {
      const request = JSON.stringify({ command, options }) + '\n';
      plugin.process!.stdin.write(request);
      
      // Listen for response on stdout
      const handler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          plugin.process!.stdout.off('data', handler);
          resolve(response);
        } catch (error) {
          // Continue waiting for complete response
        }
      };
      
      plugin.process!.stdout.on('data', handler);
      
      // Timeout
      setTimeout(() => {
        plugin.process!.stdout.off('data', handler);
        resolve({
          success: false,
          output: '',
          error: 'Plugin timeout'
        });
      }, options?.timeout || 60000);
    });
  }
  
  private setupPluginIPC(plugin: PluginInstance) {
    // Handle plugin events
    plugin.process!.on('error', (error) => {
      console.error(`Plugin ${plugin.manifest.id} error:`, error);
      plugin.status = 'error';
    });
    
    plugin.process!.on('exit', (code) => {
      console.log(`Plugin ${plugin.manifest.id} exited with code ${code}`);
      plugin.status = 'unmounted';
    });
  }
  
  list(): Plugin[] {
    return Array.from(this.plugins.values()).map(p => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      author: p.manifest.author,
      command: p.manifest.command,
      capabilities: p.manifest.capabilities,
      status: p.status
    }));
  }
}

interface PluginInstance {
  manifest: PluginManifest;
  status: PluginStatus;
  process: ChildProcess | null;
  mountedAt: number | null;
}
```

---

## 8. Terminal Core Refactor

### Remove Python Dependencies

**Before (Terminal.tsx):**
```typescript
// ❌ Hardcoded LuciferAI integration
const result = await window.lucidAPI.lucid.command(command);
```

**After (Terminal.tsx):**
```typescript
// ✅ Plugin-agnostic execution
const plugins = await window.lucidAPI.plugins.list();
const aiPlugin = plugins.find(p => 
  p.capabilities.includes('code_generation') && 
  p.status === 'mounted'
);

if (!aiPlugin) {
  // Graceful degradation - offer to mount plugin
  setBlocks(prev => [...prev, {
    ...newBlock,
    output: '⚠️ No AI plugin available\n\nMount a plugin:\n1. Click plugins icon 🧩\n2. Mount LuciferAI\n3. Try again',
    isComplete: true
  }]);
  return;
}

// Execute via plugin
const result = await window.lucidAPI.plugins.execute(
  aiPlugin.id,
  command,
  { returnStats: true }
);
```

### Plugin-Aware Command Router

```typescript
// src/utils/commandRouter.ts

export async function routeCommand(
  parsed: ParsedCommand
): Promise<CommandRoute> {
  const validation: ValidationStep[] = [];
  
  // Step 1: Determine if plugin needed
  const needsPlugin = ['agent', 'build', 'create', 'fixnet', 'llm'].includes(parsed.type);
  
  if (!needsPlugin) {
    // Direct shell execution
    return {
      type: 'shell',
      handler: 'terminal',
      validation: [
        { id: 'parse', label: 'Parsed', status: 'success', timestamp: Date.now() },
        { id: 'route', label: 'Direct shell', status: 'success', timestamp: Date.now() }
      ]
    };
  }
  
  // Step 2: Find capable plugin
  const plugins = await window.lucidAPI.plugins.list();
  const requiredCapability = getCapabilityForCommand(parsed.type);
  const capablePlugins = plugins.filter(p =>
    p.status === 'mounted' &&
    p.capabilities.includes(requiredCapability)
  );
  
  if (capablePlugins.length === 0) {
    return {
      type: 'error',
      handler: null,
      validation: [
        { id: 'parse', label: 'Parsed', status: 'success', timestamp: Date.now() },
        { id: 'route', label: 'No plugin available', status: 'error', timestamp: Date.now(), message: 'Mount AI plugin required' }
      ]
    };
  }
  
  // Step 3: Select best plugin (priority order)
  const selectedPlugin = capablePlugins[0];
  
  return {
    type: 'plugin',
    handler: selectedPlugin.id,
    validation: [
      { id: 'parse', label: 'Parsed', status: 'success', timestamp: Date.now() },
      { id: 'route', label: `Routed to ${selectedPlugin.name}`, status: 'success', timestamp: Date.now() }
    ]
  };
}

function getCapabilityForCommand(commandType: CommandType): Capability {
  const mapping: Record<string, Capability> = {
    'agent': Capability.NATURAL_LANGUAGE,
    'build': Capability.CODE_GENERATION,
    'create': Capability.CODE_GENERATION,
    'fixnet': Capability.ERROR_FIXING,
    'llm': Capability.MODEL_MANAGEMENT,
    'github': Capability.GITHUB_INTEGRATION
  };
  return mapping[commandType] || Capability.NATURAL_LANGUAGE;
}
```

---

## 9. LuciferAI Plugin Adaptation

### stdio_agent.py Updates

```python
#!/usr/bin/env python3
"""
LuciferAI Plugin for Lucid Terminal
Communicates via JSON over stdin/stdout
"""
import sys
import json
from core.enhanced_agent import EnhancedAgent

def main():
    agent = EnhancedAgent()
    
    while True:
        try:
            # Read command from stdin
            line = sys.stdin.readline()
            if not line:
                break
            
            request = json.loads(line)
            command = request.get('command', '')
            options = request.get('options', {})
            
            # Execute command
            result = agent.process_command(command)
            
            # Parse token stats from result
            tokens = extract_token_stats(result)
            
            # Generate validation steps
            validation = [
                {"id": "parse", "label": "Parsing", "status": "success", "timestamp": time.time()},
                {"id": "route", "label": "Routing", "status": "success", "timestamp": time.time()},
                {"id": "execute", "label": "Executing", "status": "success", "timestamp": time.time()},
                {"id": "complete", "label": "Complete", "status": "success", "timestamp": time.time()}
            ]
            
            # Send response to stdout
            response = {
                "success": True,
                "output": result.output,
                "error": None,
                "stats": tokens,
                "validation": validation
            }
            
            sys.stdout.write(json.dumps(response) + '\n')
            sys.stdout.flush()
            
        except Exception as e:
            # Error response
            error_response = {
                "success": False,
                "output": "",
                "error": str(e),
                "stats": None,
                "validation": [
                    {"id": "error", "label": "Error", "status": "error", "timestamp": time.time(), "message": str(e)}
                ]
            }
            sys.stdout.write(json.dumps(error_response) + '\n')
            sys.stdout.flush()

def extract_token_stats(result) -> dict:
    """Extract token statistics from agent result."""
    return {
        "prompt_tokens": result.get('prompt_tokens', 0),
        "generated_tokens": result.get('generated_tokens', 0),
        "total_tokens": result.get('total_tokens', 0),
        "prompt_chars": result.get('prompt_chars', 0),
        "output_chars": result.get('output_chars', 0),
        "chars_per_token": result.get('chars_per_token', 0)
    }

if __name__ == '__main__':
    main()
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create plugin types and interfaces
- [ ] Implement PluginRegistry class
- [ ] Add plugin IPC handlers
- [ ] Create plugin directory structure
- [ ] Write LuciferAI plugin manifest

### Phase 2: UI Components (Week 2)
- [ ] Create PluginManager component
- [ ] Add plugins button to header
- [ ] Implement PluginCard component
- [ ] Add plugin status indicators
- [ ] Create plugin settings panel

### Phase 3: Validation System (Week 3)
- [ ] Add validation state to TerminalBlock
- [ ] Create ValidationIndicator component
- [ ] Update commandRouter with validation
- [ ] Implement real-time step updates
- [ ] Add checkmark/X icons

### Phase 4: Token Tracking (Week 4)
- [ ] Create TokenDisplay component
- [ ] Parse token stats from plugin responses
- [ ] Update Block component to show tokens
- [ ] Add token aggregation per session
- [ ] Create token statistics panel

### Phase 5: Terminal Refactor (Week 5)
- [ ] Remove hardcoded LuciferAI references
- [ ] Update command routing to use plugins
- [ ] Implement graceful degradation
- [ ] Add plugin capability detection
- [ ] Test standalone terminal

### Phase 6: LuciferAI Plugin (Week 6)
- [ ] Update stdio_agent.py for JSON I/O
- [ ] Add validation step generation
- [ ] Implement token stats extraction
- [ ] Test plugin mount/dismount
- [ ] Verify end-to-end flow

### Phase 7: Testing & Polish (Week 7)
- [ ] Test complete plugin lifecycle
- [ ] Test command validation flow
- [ ] Verify token tracking accuracy
- [ ] Test error handling
- [ ] Performance optimization

### Phase 8: Documentation (Week 8)
- [ ] Write plugin development guide
- [ ] Document plugin API
- [ ] Create example plugins
- [ ] Update user documentation
- [ ] Create video tutorials

---

## 11. Benefits

### For Users
- **Flexibility**: Install only plugins you need
- **Performance**: No overhead from unused features
- **Reliability**: Plugin crash doesn't kill terminal
- **Transparency**: See exactly what each command does
- **Trust**: Validation checkmarks build confidence

### For Developers
- **Clean Architecture**: Separation of concerns
- **Easy Testing**: Test plugins independently
- **Extensibility**: Add new plugins without core changes
- **Standards**: Consistent plugin interface
- **Community**: Anyone can create plugins

---

## 12. Migration Path

### Backward Compatibility

**During Migration:**
1. Keep old lucidAPI.lucid.* methods working
2. Add deprecation warnings
3. Gradually migrate to plugins API
4. Remove old API in v3.0.0

**Deprecation Notice:**
```typescript
// @deprecated Use window.lucidAPI.plugins.execute() instead
lucid.command(cmd): {
  console.warn('lucid.command() is deprecated. Use plugins API.');
  return plugins.execute('luciferai', cmd);
}
```

---

## 13. Future Plugins

### GitHub Copilot CLI Plugin

```json
{
  "id": "github-copilot",
  "name": "GitHub Copilot CLI",
  "version": "1.0.0",
  "description": "GitHub Copilot integration for terminal",
  "author": "GitHub",
  "command": "gh copilot suggest -t shell",
  "capabilities": ["code_generation", "natural_language"],
  "icon": "🤖"
}
```

### Custom Script Runner Plugin

```json
{
  "id": "custom-scripts",
  "name": "Custom Scripts",
  "version": "1.0.0",
  "description": "Run your custom automation scripts",
  "author": "User",
  "command": "/Users/you/scripts/runner.sh",
  "capabilities": ["file_operations"],
  "icon": "📜"
}
```

---

## 14. Security Considerations

### Plugin Sandboxing
- Plugins run as separate processes (isolated)
- No direct file system access from UI
- IPC communication only
- Permission system for sensitive operations

### Plugin Verification
- Checksum verification before installation
- Author signatures (future)
- Community ratings (future)
- Automatic security scans

### User Consent
- Show permissions before mounting
- Confirm destructive operations
- Audit log of plugin actions
- Easy dismount/uninstall

---

## 15. Success Criteria

### Functionality
- ✅ Terminal works without any plugins
- ✅ Plugins can be mounted/dismounted dynamically
- ✅ All commands show validation steps
- ✅ Token stats display for all LLM responses
- ✅ LuciferAI works as plugin

### Performance
- ✅ Plugin mount <1s
- ✅ Command parsing <10ms
- ✅ Validation UI updates <100ms
- ✅ Plugin IPC <50ms latency

### UX
- ✅ Clear plugin status indicators
- ✅ Helpful error messages
- ✅ Smooth animations
- ✅ Warp-quality polish

---

## Conclusion

This plan transforms Lucid Terminal into a **professional plugin-based system** with:
1. **True independence** - Terminal core has zero Python dependencies
2. **Warp-style validation** - Every command shows ✓/✗ steps
3. **Token transparency** - All LLM usage tracked and displayed
4. **Extensibility** - Easy to add new plugins
5. **Reliability** - Plugin failures don't crash terminal

**Estimated Timeline:** 8 weeks for complete implementation

**Ready to build!** 🩸
