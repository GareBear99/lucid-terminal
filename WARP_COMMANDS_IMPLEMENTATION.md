# Warp-Style /Commands Implementation Plan

## ✅ COMPLETED
1. **Help Data Structure** (`src/data/helpData.ts`)
   - Compartmentalized help categories
   - Searchable command database
   - Tags and examples for each command

2. **Help Panel Component** (`src/components/Help/HelpPanel.tsx`)
   - Interactive Warp-style UI
   - Search functionality
   - Category cards with drill-down
   - Copy buttons for commands
   - System stats display

3. **Command Router** (`src/utils/commandRouter.ts`)
   - Parses `/commands` and direct commands
   - Auto-routes unrecognized input to `/agent`
   - Shell command detection
   - Slash command aliases (`/h`, `/f`, `/b`, etc.)

## 🚧 REMAINING IMPLEMENTATION

### 1. Update Terminal.tsx
```typescript
import { HelpPanel } from '../Help/HelpPanel';
import { parseCommand, getCommandDescription, shouldStreamOutput } from '../../utils/commandRouter';

// Add state
const [showHelp, setShowHelp] = useState(false);

// In handleSubmit:
const parsed = parseCommand(input);

if (parsed.shouldShowHelp) {
  setShowHelp(true);
  return;
}

switch (parsed.type) {
  case 'shell':
    // Execute in xterm
    xterm.write(input + '\r\n');
    break;
    
  case 'fix':
  case 'fixnet':
  case 'llm':
  case 'workflow':
  case 'tokens':
  case 'history':
    // Route to lucidAPI (existing handlers)
    await handleLuciferAICommand(parsed);
    break;
    
  case 'agent':
  case 'build':
  case 'create':
    // Route to stdio_agent.py with streaming
    await handleAgentCommand(parsed);
    break;
}

// Render help panel
{showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
```

### 2. Integrate LuciferAI stdio_agent.py Backend
The backend is already running (confirmed in logs):
```
Local AI Backend Ready
📝 New session started: Thursday, February 26, 2026 at 10:08 AM
👤 User ID: B35EE32A34CE37C2
```

**Add IPC handler for agent streaming:**
```typescript
// electron/ipc/lucidWorkflow.ts
ipcMain.handle('lucid:agent', async (_, query: string) => {
  // Stream to stdio_agent.py
  // Return streamed response
});
```

### 3. Command Status Indicator
Add visual feedback while processing:
```typescript
{processing && (
  <div className="command-status">
    <Loader className="animate-spin" />
    {getCommandDescription(currentCommand.type)}
  </div>
)}
```

### 4. Command Autocomplete
Add `/` command suggestions in InputArea:
```typescript
import { getCommandExamples } from '../../utils/commandRouter';

// Show autocomplete dropdown when typing /
{input.startsWith('/') && (
  <CommandSuggestions 
    prefix={input}
    suggestions={getCommandExamples(input)}
  />
)}
```

## 📋 COMMAND ROUTING FLOW

```
User Input
    ↓
parseCommand()
    ↓
┌─────────────────────────────────────┐
│ /help or help   → Help Panel        │
│ /fix <error>    → FixNet            │
│ /llm list       → Model Management  │
│ /build <desc>   → AI Code Gen       │
│ ls, git, npm    → Shell (xterm)     │
│ Anything else   → /agent (AI)       │
└─────────────────────────────────────┘
```

## 🎯 AUTO /AGENT ROUTING

**Unrecognized commands automatically route to LuciferAI agent:**
- "How do I deploy to AWS?"  → `/agent How do I deploy to AWS?`
- "Explain Docker"            → `/agent Explain Docker`
- "Set up a new project"      → `/agent Set up a new project`

**Shell commands detected and executed directly:**
- `ls -la`       → Shell
- `git status`   → Shell  
- `npm install`  → Shell

## 🔧 SLASH COMMAND ALIASES

- `/h`, `/help`, `/?`       → Help
- `/f`, `/fix`              → Fix
- `/fn`, `/fixnet`          → FixNet
- `/m`, `/model`, `/llm`    → Models
- `/b`, `/build`            → Build
- `/c`, `/create`           → Create
- `/w`, `/wf`, `/workflow`  → Workflow
- `/t`, `/tokens`           → Tokens
- `/agent`, `/ai`, `/ask`   → Agent (explicit)

## 📊 SYSTEM INTEGRATION

**Backend**: LuciferAI stdio_agent.py (already running)
**Frontend**: Lucid Terminal React UI
**Bridge**: Electron IPC handlers

**Data Flow**:
```
User → Terminal → Command Router → {
  Help Panel (UI)
  FixNet (lucidAPI)
  Models (lucidAPI)
  Agent (stdio_agent.py via IPC)
  Shell (xterm)
}
```

## 🚀 NEXT STEPS

1. Update Terminal.tsx with command router
2. Add help panel integration
3. Create agent streaming IPC handler
4. Test all command routes
5. Add command autocomplete
6. Polish UI transitions

All data structures and components are ready. Just need to wire them together!
