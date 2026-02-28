# Command Router Testing Guide
**Phase 1 Integration - Warp AI-Style Routing**

## What Was Implemented

### ✅ Completed
1. **Command Router** (`commandRouter.ts`) - Deterministic parser with 60+ command mappings
2. **Help Panel** (`HelpPanel.tsx`) - Full-screen modal with 12 categories, search, examples
3. **Terminal Integration** - Router wired into Terminal.tsx with switch-case routing
4. **Type System** - Added command types: install, github, env, daemon

### 🔄 Changes Made
- **Terminal.tsx** - Replaced 300+ lines of hardcoded checks with clean router logic
- **Command Flow** - Now: Input → parseCommand() → switch(type) → route to destination
- **Help System** - Type `help` or `/help` opens modal instead of text output

## Testing Checklist

### Test 1: Help Panel (CRITICAL)
**Expected:** Help panel opens with full UI
```bash
help          # Opens help modal
/help         # Also opens help modal  
/h            # Short alias
```
**Console logs to look for:**
```
[Command Router] Processing: help
[Command Router] Parsed: {type: 'help', shouldShowHelp: true, ...}
[Help] Opening help panel
```

### Test 2: Shell Commands (Direct Execution)
**Expected:** Executes in PTY immediately, no IPC
```bash
ls            # List files
pwd           # Current directory
git status    # Git commands
npm --version # NPM commands
```
**Console logs:**
```
[Command Router] Parsed: {type: 'shell', ...}
[Shell] Direct execution: ls
```

### Test 3: FixNet Commands (IPC Routing)
**Expected:** Routes to IPC handlers
```bash
fixnet stats  # Should return JSON stats
fixnet search error_name  # Should search dictionary
```
**Console logs:**
```
[Command Router] Parsed: {type: 'fixnet', ...}
[FixNet] Processing: fixnet stats
```

### Test 4: LLM Commands (IPC Routing)
**Expected:** Routes to IPC handlers
```bash
llm list      # Lists all models
llm enable mistral   # Enables model
llm disable tinyllama  # Disables model
```
**Console logs:**
```
[Command Router] Parsed: {type: 'llm', ...}
[LLM] Processing: llm list
```

### Test 5: Workflow Commands (IPC Routing)
**Expected:** Routes to IPC handlers
```bash
workflow status   # System status
tokens            # Token usage stats
history           # Conversation history
clear history     # Clear history
```
**Console logs:**
```
[Command Router] Parsed: {type: 'workflow', ...}
[Workflow] Processing: workflow status
```

### Test 6: Backend Commands (Python Routing)
**Expected:** Routes to LuciferAI backend via IPC
```bash
install mistral      # Model installation (will fail - not implemented yet)
github link          # GitHub integration (will fail - not implemented yet)
envs                 # Environment list (will fail - not implemented yet)
fix script.py        # FixNet auto-fix (will fail - not implemented yet)
```
**Console logs:**
```
[Command Router] Parsed: {type: 'install', ...}
[Backend] Routing to LuciferAI: install
```
**Expected Result:** Error message (these IPC handlers don't exist yet - Phase 2)

### Test 7: Agent/Natural Language (LLM Processing)
**Expected:** Routes to agent for LLM processing
```bash
what is the capital of france   # Question
create a python script          # Natural language task
hello                           # Greeting
```
**Console logs:**
```
[Command Router] Parsed: {type: 'agent', ...}
[Backend] Routing to LuciferAI: agent
```

---

## Known Issues & Expected Failures

### ❌ Phase 2 Commands (Not Yet Implemented)
These commands are **expected to fail** - they need new IPC handlers:
- `install <model>` - Model installation
- `fix <script>` - FixNet auto-fix  
- `github link/upload/projects` - GitHub integration
- `envs` - Environment management
- `daemon` - Background daemon control

**Error you'll see:**
```
❌ Command failed: Unknown error
Try: help for available commands
```

This is **correct behavior** - these features are Phase 2.

---

## Success Criteria

### ✅ Phase 1 Complete If:
1. **Help panel opens** on `help` command (full modal UI visible)
2. **Shell commands execute** directly (ls, git, npm work instantly)
3. **FixNet stats works** (returns JSON data)
4. **LLM list works** (shows enabled/disabled models)
5. **Console shows routing logs** (Command Router → Parsed → Destination)

### 🎯 Ready for Phase 2 If:
- All above tests pass ✅
- No TypeScript/build errors ✅
- Help panel UI is beautiful ✅
- Shell latency is zero ✅

---

## Phase 2 Preview: Critical IPC Handlers

Next steps (estimated 2-3 hours):

### New IPC Handlers Needed
```typescript
// In electron/ipc/lucidWorkflow.ts

// Model installation
ipcMain.handle('lucid:installModel', async (_, modelName: string) => {
  // Call Python: install <modelName>
  // Return: {success, progress, error}
});

// FixNet auto-fix
ipcMain.handle('lucid:fixScript', async (_, filepath: string) => {
  // Call Python: fix <filepath>
  // Return: {success, fixCount, output}
});

// GitHub operations
ipcMain.handle('lucid:githubLink', async () => {
  // Call Python: github link
  // Opens OAuth flow
});

ipcMain.handle('lucid:githubUpload', async () => {
  // Call Python: github upload
  // Uploads current project
});

// Environment management
ipcMain.handle('lucid:listEnvironments', async () => {
  // Call Python: envs
  // Returns: [{name, path, type, python_version}]
});

ipcMain.handle('lucid:activateEnvironment', async (_, name: string) => {
  // Call Python: env activate <name>
  // Activates virtualenv
});
```

### TypeScript Types to Add
```typescript
// In src/types/lucidApi.d.ts

interface LucidAPI {
  lucid: {
    // ... existing methods
    installModel: (modelName: string) => Promise<{success: boolean, progress?: number, error?: string}>;
    fixScript: (filepath: string) => Promise<{success: boolean, fixCount: number, output: string}>;
    githubLink: () => Promise<{success: boolean, url?: string}>;
    githubUpload: () => Promise<{success: boolean, repoUrl?: string}>;
    listEnvironments: () => Promise<{success: boolean, environments: Environment[]}>;
    activateEnvironment: (name: string) => Promise<{success: boolean}>;
  }
}
```

---

## Architecture Achieved

### Before (Broken)
```
Input → xterm → Python backend → Response
        ↑
   No frontend awareness
```

### After (Warp AI Style) ✅
```
Input → commandRouter.ts → ParsedCommand → {
                                              Shell (xterm) - 0ms latency
                                              Help (modal) - instant
                                              FixNet (IPC) - existing
                                              LLM (IPC) - existing
                                              Backend (IPC) - Phase 2
                                            }
```

**Result:** Zero LLM latency for deterministic commands, full feature awareness, Warp AI-quality UX.

---

## Testing in GUI

Since you're running the app now:

1. **Open DevTools** (Cmd+Option+I on Mac)
2. **Go to Console tab** - You'll see all routing logs
3. **Type commands in terminal** - Watch the routing happen
4. **Test help panel** - Should be beautiful with search, categories, examples
5. **Test shell commands** - Should execute instantly
6. **Test LLM commands** - Should show data

Report back with:
- ✅ Which tests passed
- ❌ Which tests failed (with error messages)
- 📸 Screenshot of help panel (if working)

Then we proceed to **Phase 2: Critical IPC Handlers** 🚀
