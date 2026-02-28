# LuciferAI Plugin Architecture 🔌

**Lucid Terminal = Standalone Terminal + Optional LuciferAI Plugin**

## Philosophy

The terminal works **independently** and treats LuciferAI as a **dynamic plugin** that enhances capabilities when available. This means:

- ✅ Terminal works perfectly without LuciferAI backend running
- ✅ Shell commands (ls, git, npm, etc.) always work at zero latency
- ✅ LuciferAI features activate dynamically when backend connects
- ✅ Graceful degradation when backend disconnects
- ✅ Auto-reconnection every 30 seconds
- ✅ Clear visual indicators of plugin status

---

## Architecture

### Standalone Mode (Default)
```
Terminal UI
    ↓
Shell Commands → PTY → Shell → Output
Help Command → HelpPanel Modal
```

**Features:**
- All standard shell commands work
- Help panel with full documentation
- File system operations via xterm.js
- Git, npm, docker, etc. work natively
- Zero dependencies on Python backend

### Enhanced Mode (Plugin Connected)
```
Terminal UI
    ↓
    ├→ Shell Commands → PTY (instant)
    ├→ Help Command → HelpPanel Modal (instant)
    └→ AI Commands → IPC → LuciferAI Backend
                               ↓
                      60+ Python handlers
                      • Model installation
                      • FixNet auto-fix
                      • GitHub integration
                      • Environment management
                      • Natural language processing
```

---

## Plugin States

### State 1: Checking (⏳ Yellow)
**Initial state when terminal starts**

```typescript
luciferAIChecking: true
luciferAIAvailable: false
```

**Behavior:**
- Terminal is initializing
- Attempting to connect to backend
- AI commands show: "⏳ Connecting to LuciferAI plugin..."
- Shell commands work immediately

**UI Indicator:** ⏳ (pulsing yellow)

### State 2: Connected (🩸 Green)
**Plugin successfully connected**

```typescript
luciferAIChecking: false
luciferAIAvailable: true
```

**Behavior:**
- All features available
- AI commands route to Python backend
- Shell commands still execute directly
- Help panel shows all 60+ commands

**UI Indicator:** 🩸 (green drop)

**Commands Available:**
- `install mistral` - Model installation
- `fix script.py` - Auto-fix Python errors
- `github link` - GitHub integration
- `envs` - Environment management
- `what is X?` - Natural language queries
- And 55+ more AI-powered commands

### State 3: Disconnected (⚪ Gray)
**Plugin unavailable or backend offline**

```typescript
luciferAIChecking: false
luciferAIAvailable: false
```

**Behavior:**
- Shell commands work normally
- Help panel still accessible
- AI commands show helpful error:
  ```
  ⚠️  LuciferAI Plugin Not Available
  
  The "install mistral" command requires the LuciferAI backend plugin.
  
  To enable AI features:
  1. Start the LuciferAI backend: python3 LUCID-BACKEND/core/stdio_agent.py
  2. Terminal will auto-reconnect in 30 seconds
  
  The terminal continues to work in standalone mode with shell commands.
  ```

**UI Indicator:** ⚪ (gray circle)

**Auto-Reconnection:** Retries every 30 seconds automatically

---

## Command Routing Matrix

| Command Type | Standalone Mode | Plugin Mode | Notes |
|--------------|----------------|-------------|-------|
| `ls`, `git`, `npm` | ✅ Direct PTY | ✅ Direct PTY | Always instant |
| `help`, `/help` | ✅ Modal UI | ✅ Modal UI | Always available |
| `install <model>` | ❌ Plugin required | ✅ Via IPC | Shows helpful error |
| `fix <script>` | ❌ Plugin required | ✅ Via IPC | FixNet auto-fix |
| `github link` | ❌ Plugin required | ✅ Via IPC | OAuth flow |
| `envs` | ❌ Plugin required | ✅ Via IPC | Environment scan |
| `llm list` | ❌ Plugin required | ✅ Via IPC | Model management |
| Natural language | ❌ Plugin required | ✅ Via IPC | LLM processing |
| Unknown commands | ⚠️ Try shell | ✅ Agent routing | Intelligent fallback |

---

## Implementation Details

### Plugin State Management

**Location:** `src/components/Terminal/Terminal.tsx`

```typescript
// State
const [luciferAIAvailable, setLuciferAIAvailable] = useState(false);
const [luciferAIChecking, setLuciferAIChecking] = useState(true);

// Initialization
useEffect(() => {
  const initLuciferAI = async () => {
    try {
      const result = await window.lucidAPI.lucid.init();
      if (result.success) {
        console.log('[Plugin] ✅ LuciferAI plugin loaded and ready');
        setLuciferAIAvailable(true);
      } else {
        console.log('[Plugin] ⚠️  LuciferAI plugin unavailable');
        setLuciferAIAvailable(false);
      }
    } catch (error) {
      console.log('[Plugin] ⚠️  Backend not running - standalone mode');
      setLuciferAIAvailable(false);
    } finally {
      setLuciferAIChecking(false);
    }
  };
  
  initLuciferAI();
  
  // Retry every 30s
  const retryInterval = setInterval(() => {
    if (!luciferAIAvailable) {
      initLuciferAI();
    }
  }, 30000);
  
  return () => clearInterval(retryInterval);
}, [luciferAIAvailable]);
```

### Command Handler Logic

```typescript
switch (parsed.type) {
  case 'shell':
    // Always works - direct PTY
    window.lucidAPI.terminal.write(tabId, command + '\n');
    break;
    
  case 'help':
    // Always works - modal UI
    setShowHelpPanel(true);
    break;
    
  case 'install':
  case 'github':
  case 'env':
  case 'agent':
    // Requires plugin
    if (luciferAIAvailable) {
      // Route to backend
      const result = await window.lucidAPI.lucid.command(command);
      displayResult(result);
    } else if (luciferAIChecking) {
      // Still connecting
      showMessage('⏳ Connecting to plugin...');
    } else {
      // Plugin offline
      showMessage('⚠️  LuciferAI plugin required. Start backend to enable.');
    }
    break;
}
```

### Error Handling

**Plugin dies during operation:**
```typescript
try {
  const result = await window.lucidAPI.lucid.command(command);
  // Process result...
} catch (error) {
  console.error('[Plugin] LuciferAI error:', error);
  showMessage('❌ Plugin disconnected. Retrying in 30s...');
  // Mark as unavailable to trigger reconnection
  setLuciferAIAvailable(false);
}
```

---

## User Experience

### Starting Terminal WITHOUT Backend

**What user sees:**
1. Terminal opens instantly
2. Status indicator shows: ⚪ (gray - plugin offline)
3. Can immediately use: `ls`, `cd`, `git`, etc.
4. Typing `help` opens full help panel
5. Typing `install mistral` shows:
   ```
   ⚠️  LuciferAI Plugin Not Available
   
   To enable AI features:
   1. Start backend: python3 LUCID-BACKEND/core/stdio_agent.py
   2. Auto-reconnect in 30 seconds
   ```

### Starting Terminal WITH Backend

**What user sees:**
1. Terminal opens
2. Status indicator: ⏳ (yellow - connecting)
3. After 1-2 seconds: 🩸 (green - connected)
4. All 60+ commands now available
5. Console shows: `[Plugin] ✅ LuciferAI plugin loaded and ready`

### Backend Dies During Use

**What user sees:**
1. Next AI command shows: `❌ Plugin disconnected. Retrying in 30s...`
2. Status changes: 🩸 → ⚪
3. Shell commands continue working
4. After 30s: ⏳ (trying to reconnect)
5. If backend restarted: 🩸 (reconnected)

---

## Starting the LuciferAI Backend

### Method 1: Direct Python
```bash
cd LUCID-BACKEND/core
python3 stdio_agent.py
```

### Method 2: From Project Root
```bash
python3 LUCID-BACKEND/core/stdio_agent.py
```

### Method 3: As Background Service
```bash
# Start in background
python3 LUCID-BACKEND/core/stdio_agent.py &

# Check status
ps aux | grep stdio_agent

# Stop
pkill -f stdio_agent
```

**Backend Output:**
```
🩸 Enhanced LuciferAI Ready
User ID: B35EE32A34CE37C2
Working Directory: /Users/...
WiFi: Connected to TELUS2820
Template Mode: Online (Web-Enhanced)
✅ Synced 17 remote fixes
✅ Offline templates loaded: 16
```

---

## Benefits of Plugin Architecture

### 1. **Independence**
- Terminal doesn't depend on Python
- Works on any system with Node/Electron
- No backend = no problem

### 2. **Performance**
- Shell commands are always instant (0ms)
- No Python startup delay for basic operations
- AI features load asynchronously

### 3. **Reliability**
- Backend crash doesn't kill terminal
- Graceful degradation
- Auto-recovery with reconnection

### 4. **Development**
- Test terminal without backend
- Iterate on UI independently
- Backend can be updated separately

### 5. **Deployment**
- Ship terminal standalone
- Backend is optional add-on
- Users choose what they need

### 6. **Debugging**
- Clear separation of concerns
- Plugin status always visible
- Console logs show connection state

---

## Plugin Stream CLI Architecture

### How It Works

**Electron Main Process:**
```typescript
// electron/main.ts
import { spawn } from 'child_process';

let luciferBackend: ChildProcess | null = null;

// Start plugin when requested
function startLuciferPlugin() {
  luciferBackend = spawn('python3', [
    'LUCID-BACKEND/core/stdio_agent.py'
  ], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Stream JSON over stdin/stdout
  luciferBackend.stdout.on('data', (data) => {
    const response = JSON.parse(data.toString());
    // Send to renderer
    win.webContents.send('lucifer:response', response);
  });
}

// Stop plugin when terminal closes
function stopLuciferPlugin() {
  if (luciferBackend) {
    luciferBackend.kill();
    luciferBackend = null;
  }
}
```

**Communication Protocol:**
```json
// Request (stdin)
{
  "command": "install mistral",
  "session_id": "abc123",
  "timestamp": 1234567890
}

// Response (stdout) 
{
  "success": true,
  "output": "Installing mistral...\n✅ Model installed",
  "execution_time": 15.3
}
```

---

## Configuration

### Enable/Disable Plugin

**Environment Variable:**
```bash
# Disable plugin completely
export LUCID_DISABLE_PLUGIN=true
npm run dev

# Enable plugin (default)
export LUCID_DISABLE_PLUGIN=false
npm run dev
```

**Settings UI (Future):**
```typescript
// Settings panel toggle
<Toggle
  label="Enable LuciferAI Plugin"
  checked={pluginEnabled}
  onChange={togglePlugin}
  description="Provides AI features, model installation, and FixNet auto-fix"
/>
```

---

## Troubleshooting

### Plugin Won't Connect

**Check 1: Backend Running?**
```bash
ps aux | grep stdio_agent
# Should show: python3 .../stdio_agent.py
```

**Check 2: Port Available?**
```bash
# Default: IPC via stdin/stdout (no port needed)
# If using HTTP: lsof -i :11434
```

**Check 3: Console Logs**
```
[Plugin] Checking LuciferAI availability...
[Plugin] ⚠️  Backend not running - standalone mode
```

**Fix:**
```bash
cd LUCID-BACKEND/core
python3 stdio_agent.py
# Wait 30s for auto-reconnect
# Or restart terminal
```

### Plugin Keeps Disconnecting

**Possible Causes:**
1. Backend crashed (check Python logs)
2. Memory limit reached (check `memory` command)
3. Network issue (if using remote backend)
4. IPC pipe broken

**Debug:**
```bash
# Check backend logs
tail -f ~/.luciferai/logs/session_*.log

# Check memory usage
memory

# Restart backend
pkill -f stdio_agent
python3 LUCID-BACKEND/core/stdio_agent.py
```

### Shell Commands Slow

**This should never happen!**

Shell commands bypass the plugin entirely and execute directly in PTY. If they're slow:
1. Check system load (`top`)
2. Check disk I/O (`iostat`)
3. Not a plugin issue - system issue

---

## Future Enhancements

### Multiple Plugin Support
```typescript
// Support for multiple AI backends
const plugins = {
  luciferAI: { available: true, version: '2.0' },
  openAI: { available: true, apiKey: 'sk-...' },
  anthropic: { available: false }
};

// Route based on plugin availability
if (plugins.luciferAI.available) {
  useLuciferAI(command);
} else if (plugins.openAI.available) {
  useOpenAI(command);
}
```

### Plugin Marketplace
```typescript
// Install plugins from registry
lucid plugin install @lucid/github-copilot
lucid plugin install @lucid/docker-assistant
lucid plugin list
lucid plugin remove @lucid/github-copilot
```

### Hot Reload
```typescript
// Reload plugin without restarting terminal
lucid plugin reload luciferAI
```

---

## Testing

### Test Standalone Mode
```bash
# 1. Start terminal WITHOUT backend
npm run dev

# 2. Verify indicator shows: ⚪

# 3. Test shell commands
ls
git status
pwd

# 4. Should all work instantly

# 5. Test AI command
install mistral
# Should show: ⚠️  Plugin required
```

### Test Plugin Mode
```bash
# 1. Start backend
python3 LUCID-BACKEND/core/stdio_agent.py

# 2. Start terminal
npm run dev

# 3. Verify indicator shows: ⏳ then 🩸

# 4. Test AI commands
install mistral
llm list
github status

# 5. Should all work
```

### Test Reconnection
```bash
# 1. Start with backend running (🩸)

# 2. Kill backend
pkill -f stdio_agent

# 3. Indicator changes: 🩸 → ⚪

# 4. Test AI command
install mistral
# Shows: ⚠️  Plugin required

# 5. Restart backend
python3 LUCID-BACKEND/core/stdio_agent.py

# 6. Wait 30s
# Indicator changes: ⚪ → ⏳ → 🩸

# 7. Test AI command again
install mistral
# Now works!
```

---

## Conclusion

**Lucid Terminal = Powerful Standalone + Optional AI Superpowers**

The plugin architecture ensures:
- ✅ Terminal always works
- ✅ Zero-latency shell commands
- ✅ Graceful plugin handling
- ✅ Clear visual feedback
- ✅ Auto-reconnection
- ✅ Perfect for development and production

**Philosophy:** Essential features work always. Enhanced features work when available.

**Result:** Professional-grade terminal that respects user's environment and provides maximum flexibility. 🚀
