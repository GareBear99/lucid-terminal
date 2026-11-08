# Lucid Terminal - Complete Command Reference

> **Real terminal (Gary, 2026-11-07: "terminal is not a terminal at
> all").** The terminal is a real PTY running your login interactive
> shell: bare words typed at the prompt go to the SHELL, always —
> `history` is zsh history, `help` is the shell's help, `clear`
> clears the screen. Lucid commands are EXPLICIT slash commands
> (`/fix`, `/llm`, `/help`, `/plan`, `/tokens`, `/workflow status`,
> `/history`, `/browser diagnose`, …). The tables below describe
> those Lucid commands in their slash form where they are Lucid's;
> the shell rows (`ls`, `cd`, `pwd`, `cat`, `clear`, `exit`, …) are
> bare because they are the shell's own commands.

**Total Commands**: 40+ (including aliases: 50+)

All commands work **100% deterministically** without LLM dependency (except where marked with ⚡ LLM).

---

## 📖 Core Commands

| Command | Aliases | Description | LLM? |
|---------|---------|-------------|------|
| `help [cmd]` | `?`, `man` | Show help for commands | ❌ |
| `clear` | `cls` | Clear terminal screen | ❌ |
| `exit` | `quit`, `q` | Exit terminal | ❌ |
| `version` | `ver`, `v` | Show version | ❌ |
| `info` | `system` | System diagnostics | ❌ |
| `memory` | - | Show conversation memory | ❌ |
| `test [model]` | - | Run system tests | ❌ |

---

## 🧭 Navigation Commands

| Command | Aliases | Description | LLM? |
|---------|---------|-------------|------|
| `cd <path>` | `chdir` | Change directory | ❌ |
| `pwd` | - | Print working directory | ❌ |

---

## 📁 File Operations

| Command | Aliases | Description | LLM? |
|---------|---------|-------------|------|
| `ls [path]` | `dir`, `list` | List directory contents | ❌ |
| `cat <file>` | `type`, `read` | Display file contents | ❌ |
| `mkdir <name>` | `md` | Create directory | ❌ |
| `touch <file>` | `create` | Create file | ❌ |
| `rm <path>` | `del`, `delete` | Remove file/directory ⚠️ | ❌ |
| `cp <src> <dest>` | `copy` | Copy file/directory | ❌ |
| `mv <src> <dest>` | `move`, `rename` | Move/rename file | ❌ |
| `find <pattern>` | `search` | Search for files | ❌ |
| `open <file>` | - | Open with default app | ❌ |

---

## ⚙️ Process Management

| Command | Aliases | Description | LLM? |
|---------|---------|-------------|------|
| `ps` | `processes` | List running processes | ❌ |
| `kill <pid>` | `stop` | Kill process by PID ⚠️ | ❌ |

---

## 🔧 Script Operations

| Command | Aliases | Description | LLM? |
|---------|---------|-------------|------|
| `run <script>` | `execute` | Execute a script file | ❌ |
| `fix <script>` | - | Auto-fix script errors | ❌ |
| `autofix <target>` | - | Apply consensus fixes | ❌ |

**Note**: Script operations use deterministic error detection and FixNet consensus (no LLM required for basic fixing).

---

## 🤖 Model Management

| Command | Aliases | Description | LLM? |
|---------|---------|-------------|------|
| `llm <subcommand>` | `model` | Manage LLM models | ❌ |
| `llm list` | - | List installed models | ❌ |
| `llm enable <model>` | - | Enable a model | ❌ |
| `llm disable <model>` | - | Disable a model | ❌ |
| `llm info` | - | Show model info | ❌ |
| `install <target>` | - | Install models/packages 🌐 | ❌ |
| `models <subcommand>` | - | Model operations | ❌ |

**Subcommands**:
- `llm list` - Show all installed models
- `llm enable mistral` - Enable Mistral model
- `llm disable tinyllama` - Disable TinyLlama
- `install tier 2` - Install tier 2 models
- `install mistral` - Install specific model

---

## 📊 Session Management

| Command | Aliases | Description | LLM? |
|---------|---------|-------------|------|
| `session <subcommand>` | - | Manage sessions | ❌ |
| `session list` | - | List recent sessions | ❌ |
| `session open <id>` | - | Open session log | ❌ |
| `session info` | - | Current session stats | ❌ |
| `session stats` | - | Overall statistics | ❌ |

**Features**:
- 6 months of history
- Command tracking
- Duration metrics
- Model usage stats

---

## 🌍 Environment Management

| Command | Aliases | Description | LLM? |
|---------|---------|-------------|------|
| `environments` | `envs`, `env` | List virtual environments | ❌ |
| `activate <env>` | - | Activate environment | ❌ |

**Supported Environments**:
- Python venv
- virtualenv
- conda
- poetry
- pyenv

---

## 🐙 GitHub Integration

| Command | Aliases | Description | LLM? |
|---------|---------|-------------|------|
| `github <subcommand>` | `gh` | GitHub operations 🌐 | ❌ |
| `github link` | - | Link GitHub account | ❌ |
| `github status` | - | Check connection | ❌ |
| `github projects` | - | List repositories | ❌ |
| `github upload <proj>` | - | Upload project | ❌ |
| `github update <proj>` | - | Update repository | ❌ |
| `github sync` | - | Sync fixes to FixNet | ❌ |

---

## 🏗️ Build & Create

| Command | Aliases | Description | LLM? |
|---------|---------|-------------|------|
| `create <type> <name>` | `new` | Create files/folders | ❌ |
| `generate <type>` | - | Generate from templates | ⚡ |

**Create Types**:
- `create file script.py` - Create new file
- `create folder myproject` - Create new folder

**Generate Types** (⚡ requires LLM):
- `generate flask app` - Flask application
- `generate react component` - React component

---

## 🔍 Command Examples

### File Operations (No LLM)
```bash
# List files
ls
ls -la ~

# Read file
cat package.json

# Find files
find *.py

# Create and move
mkdir project
touch script.py
mv script.py project/
```

### Script Operations (No LLM)
```bash
# Execute script
run test.py

# Fix errors automatically
fix broken.py

# Batch autofix
autofix myproject/
```

### Model Management (No LLM)
```bash
# List models
llm list

# Enable/disable
llm enable mistral
llm disable tinyllama

# Install
install tier 2
install core models
```

### Session Management (No LLM)
```bash
# View sessions
session list
session info
session stats

# Open specific session
session open 123
```

### Environment Management (No LLM)
```bash
# List environments
environments
envs

# Activate
activate myproject
```

### GitHub Integration (No LLM for routing)
```bash
# Link account
github link

# View projects
github projects

# Upload
github upload myproject

# Check status
github status
```

---

## 🎯 Command Flags

### LLM Dependency Indicators

- ❌ **No LLM** - Works 100% without AI
- ⚡ **LLM Optional** - Enhanced with AI but has fallback
- 🌐 **Internet** - Requires internet connection
- ⚠️ **Dangerous** - Can modify/delete files

### Performance Targets

| Operation | Target | Status |
|-----------|--------|--------|
| Direct command routing | < 10ms | ✅ |
| Fuzzy matching | < 50ms | ✅ |
| File operations | < 200ms | ✅ |
| Script execution | Variable | ✅ |

---

## 📚 Command Categories Summary

| Category | Commands | LLM-Free? |
|----------|----------|-----------|
| System | 7 | ✅ 100% |
| Navigation | 2 | ✅ 100% |
| File | 9 | ✅ 100% |
| Process | 2 | ✅ 100% |
| Script | 3 | ✅ 100% |
| Model | 3 | ✅ 100% |
| Session | 1 (+4 subcommands) | ✅ 100% |
| Environment | 2 | ✅ 100% |
| GitHub | 1 (+6 subcommands) | ✅ 100% |
| Build | 2 | ⚠️ 50% (generate requires LLM) |

**Total**: 40+ base commands, all with deterministic routing

---

## 🚀 NO_LLM_CORE=1 Mode

Run the terminal with zero AI dependency:

```bash
NO_LLM_CORE=1 npm run dev
```

### What Works:
✅ All file operations \
✅ All navigation commands \
✅ All process management \
✅ Script execution & fixing (via FixNet) \
✅ Model management (listing, enabling) \
✅ Session management \
✅ Environment detection \
✅ GitHub operations (deterministic routing) \
✅ Help system \
✅ Autocomplete \
✅ Fuzzy matching \
✅ Exit codes

### What Doesn't Work:
❌ `generate` command (template generation) \
❌ Natural language queries \
❌ AI explanations

**Success Rate**: 95% of commands work without LLM

---

## 📖 Getting Help

```bash
# Show all commands
help

# Get help for specific command
help ls
help cd
help llm

# Show command categories
help
```

---

## 🔧 Adding New Commands

See `electron/core/README.md` for instructions on adding commands to the registry.

All new commands should:
1. Be defined in `helpGrammar.ts`
2. Have a handler in `commandRouter.ts`
3. Include tests in `commandRouter.test.ts`
4. Work deterministically (no LLM in routing)

---

**Architecture**: Deterministic command router with optional LLM assist

**Inspired by**: LuciferAI's 80+ command system

**Built for**: Lucid Terminal v1.0.0
