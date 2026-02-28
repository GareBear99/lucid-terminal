# 📖 LuciferAI Complete Command Reference

> Comprehensive documentation of all 80+ commands available in LuciferAI

**Quick Navigation:**
- [Core Commands](#core-commands)
- [File Operations](#file-operations)
- [Script Operations](#script-operations)
- [Build & Create](#build--create)
- [Model Management](#model-management)
- [FixNet & Consensus](#fixnet--consensus)
- [Session Management](#session-management)
- [Environment Management](#environment-management)
- [GitHub Integration](#github-integration)
- [Package Management](#package-management)
- [Testing & Validation](#testing--validation)
- [Compression](#compression)
- [Image Operations](#image-operations)
- [Fan & Thermal Management](#fan--thermal-management)
- [User Progress & Fun](#user-progress--fun)
- [Natural Language](#natural-language-queries)

---

## Core Commands

**Availability:** ✅ 100% offline | ⚡ <10ms execution | ❌ No LLM required

| Command | Description | Example |
|---------|-------------|---------|
| `help` | Show complete command list | `help` |
| `exit`, `quit`, `q` | Exit LuciferAI | `exit` |
| `clear`, `cls` | Clear screen | `clear` |
| `mainmenu`, `menu` | Show main menu | `mainmenu` |
| `info`, `system test` | System diagnostics | `info` |
| `pwd` | Show current directory | `pwd` |
| `demo` | Run feature showcase | `demo` |
| `memory` | Show conversation memory | `memory` |

---

## File Operations

**Availability:** ✅ 100% offline | ⚡ <200ms execution | ❌ No LLM required

All file operations work without any LLM using native OS-level commands.

| Command | Description | Example | Speed |
|---------|-------------|---------|-------|
| `list <path>` | List directory contents | `list ~/Documents` | <50ms |
| `read <file>` | Display file contents | `read config.json` | <100ms |
| `copy <src> <dest>` | Copy files or folders | `copy file.txt backup.txt` | <200ms |
| `move <src> <dest>` | Move files or folders | `move old.txt new.txt` | <200ms |
| `delete <target>` | Move to trash with confirmation | `delete old_file.txt` | <100ms |
| `open <file>` | Open with app selection | `open README.md` | <500ms |
| `find <pattern>` | Search for files | `find *.py` | <1s |

**Features:**
- Recursive directory operations
- Trash integration (reversible delete)
- Smart app selection for `open`
- Cross-platform (macOS, Linux, Windows)
- 99.8% success rate across 10,000+ operations

---

## Script Operations

**Availability:** ✅ 100% offline | ⚡ Variable | ❌ No LLM required

Execute and fix Python scripts with FixNet consensus integration.

| Command | Description | Example | FixNet |
|---------|-------------|---------|--------|
| `run <script>` | Execute Python script | `run test.py` | ✅ Auto-error detection |
| `fix <script>` | Fix broken script | `fix broken.py` | ✅ Apply consensus fixes |
| `daemon watch <script>` | Watch for errors | `daemon watch calculator.py` | ✅ Live monitoring |
| `daemon autofix` | Auto-apply trusted fixes | `daemon autofix` | ✅ ≥90% consensus |
| `autofix <target>` | Apply consensus fixes | `autofix myproject/` | ✅ Batch fixing |

**FixNet Workflow (No LLM):**
```
1. Execute script → Detect error
2. Search FixNet database (local + remote)
3. Calculate consensus (success rate, users)
4. Present fix: "✅ 94% success rate (119 users)"
5. Apply fix → Report result
```

---

## Build & Create

**Availability:** ⚠️ Partial offline | ⚡ Variable | ⚠️ Optional LLM

Basic templates work without LLM. AI generation requires model.

| Command | Description | Example | LLM Required |
|---------|-------------|---------|--------------|
| `create folder <name>` | Create folder on Desktop | `create folder myproject` | ❌ No |
| `create file <name>` | Create file with template | `create file script.py` | ❌ No |
| `write a script that...` | Generate code from description | `write a script that sorts files` | ✅ Yes |
| `make me a program...` | Build complete programs | `make me a program that checks weather` | ✅ Yes |
| `build something that...` | AI-powered code generation | `build something that downloads images` | ✅ Yes |
| `generate <type>` | Template generation | `generate flask app` | ⚠️ Templates work without LLM |

**Template System (No LLM):**
- 85 built-in templates
- Web scraping, API clients, file ops, data processing
- Keyword matching for selection
- 89% average success rate

---

## Model Management

**Availability:** ✅ 100% offline | ⚡ <100ms | ❌ No LLM required

Manage models without needing LLM running.

| Command | Description | Example |
|---------|-------------|---------|
| `llm list` | Show installed models | `llm list` |
| `llm list all` | Show all 85+ supported models | `llm list all` |
| `llm enable <model>` | Enable a model | `llm enable mistral` |
| `llm disable <model>` | Disable a model | `llm disable tinyllama` |
| `llm enable all` | Enable all installed models | `llm enable all` |
| `llm enable tier 2` | Enable tier 2 models | `llm enable tier 2` |
| `models info` | Show model capabilities | `models info` |
| `backup models` | Set backup models directory | `backup models` |

### Model Installation

| Command | Description | Size | Time |
|---------|-------------|------|------|
| `install core models` | **Recommended!** 4 core models | 20-30 GB | 20-40 min |
| `install all models` | Install ALL 85+ models | 350-450 GB | 4-8 hours |
| `install tier 0` | Basic (TinyLlama) | 3-4 GB | 5-10 min |
| `install tier 1` | General (Llama2) | 30-35 GB | 30-60 min |
| `install tier 2` | Advanced (Mistral) | 50-60 GB | 1-2 hours |
| `install tier 3` | Expert (DeepSeek) | 80-100 GB | 2-3 hours |
| `install tier 4` | Ultra (Llama 70B) | 200-250 GB | 4-6 hours |

**Core Models Include:**
- Tier 0: TinyLlama (1.1B) - Fast responses
- Tier 1: Llama2 (7B) - General chat
- Tier 2: Mistral (7B) - Best quality
- Tier 3: DeepSeek-Coder (6.7B) - Code expert

---

## FixNet & Consensus

**Availability:** ✅ 100% offline (cached) | ⚡ <500ms | ❌ No LLM required

Community fix database with consensus validation.

| Command | Description | Example |
|---------|-------------|---------|
| `fixnet sync` | Sync with community fixes | `fixnet sync` |
| `fixnet stats` | Show FixNet statistics | `fixnet stats` |
| `fixnet search <error>` | Search for fixes | `fixnet search NameError` |
| `dictionary stats` | Show dictionary metrics | `dictionary stats` |

**Stats Shown:**
- 📊 Local fixes stored
- 🌐 Remote fixes available
- 🎯 Smart filter rejection rate (71.4%)
- 📤 GitHub commits uploaded
- 👤 User profile & badges

**Consensus Trust Levels:**
- **Highly Trusted** (≥75%): Auto-recommend
- **Trusted** (51-74%): Recommend
- **Experimental** (30-50%): Warn user
- **Quarantined** (<30%): Block

📘 **[Complete FixNet Documentation](FIXNET_SYSTEM.md)**

---

## Session Management

**Availability:** ✅ 100% offline | ⚡ <50ms | ❌ No LLM required

Track 6 months of command history.

| Command | Description | Details |
|---------|-------------|---------|
| `session list` | List recent sessions | Last 10 sessions |
| `session open <id>` | View full session log | Complete command history |
| `session info` | Current session stats | Commands, duration, model usage |
| `session stats` | Overall statistics | Total sessions, avg duration |

**Session Storage:**
- Location: `~/.luciferai/sessions/`
- Format: JSON with metadata
- Retention: 6 months (auto-cleanup)
- Size: 2-5KB per session

---

## Environment Management

**Availability:** ✅ 100% offline | ⚡ <2s scan | ❌ No LLM required

Detect and manage virtual environments.

| Command | Description | Example |
|---------|-------------|---------|
| `environments`, `envs` | List all virtual environments | `environments` |
| `env search <query>` | Search environments | `env search myproject` |
| `activate <env>` | Activate environment | `activate myproject` |

**Supported Environments:**
- **venv** (Python standard)
- **virtualenv**
- **conda** environments
- **poetry** environments
- **pyenv** versions

**Scan Coverage:**
- Conda: `~/anaconda3/envs/`, `~/miniconda3/envs/`
- Venv: Recursive search for `bin/activate`
- Pyenv: `~/.pyenv/versions/`
- Poetry: `~/.cache/pypoetry/virtualenvs/`

---

## GitHub Integration

**Availability:** ❌ Requires internet | ⚡ Variable | ❌ No LLM required

| Command | Description | Example |
|---------|-------------|---------|
| `github link` | Link GitHub account | `github link` |
| `github status` | Check connection status | `github status` |
| `github projects` | List your repositories | `github projects` |
| `github upload [proj]` | Upload project to GitHub | `github upload myproject` |
| `github update [proj]` | Update existing repository | `github update myproject` |
| `github sync` | Sync fixes to FixNet repo | `github sync` |
| `admin push` | Admin: Push consensus to repo | `admin push` |

**Authentication:** SSH key-based (no tokens exposed)

---

## Package Management

**Availability:** ❌ Requires internet | ⚡ Variable | ❌ No LLM required

| Command | Description | Example |
|---------|-------------|---------|
| `install <package>` | Install Python package | `install requests` |
| `luci install <pkg>` | Install to LuciferAI global env | `luci install flask` |
| `modules search <name>` | Search for module | `modules search numpy` |

**Package Managers:**
- pip (Python packages)
- conda (Anaconda packages)
- brew (macOS system packages)

---

## Testing & Validation

**Availability:** ✅ Offline tests | ⚡ 8-22s per test | ⚠️ Tests validate LLM

| Command | Description | Tests |
|---------|-------------|-------|
| `test` | Interactive model selection | - |
| `test tinyllama` | Test TinyLlama specifically | 76 tests |
| `test mistral` | Test Mistral specifically | 76 tests |
| `test all` | Test all installed models | 76 tests × N models |
| `run test` | Run full test suite | 76 tests × N models |
| `short test` | Quick validation (5 queries) | 5 tests × N models |

**Test Categories (76 tests total):**
- Natural Language (9 tests)
- Information Commands (8 tests)
- Complex AI Tasks (14 tests)
- File Operations (9 tests)
- Daemon/Fix (6 tests)
- Model Management (6 tests)
- Build Tasks (6 tests)
- Edge Cases (12 tests)
- Command History (6 tests)

**Performance by Tier:**
- Tier 0 (TinyLlama): 8-12s/test, 95-98% pass
- Tier 1 (Llama2): 10-15s/test, 97-99% pass
- Tier 2 (Mistral): 12-18s/test, 98-100% pass
- Tier 3 (DeepSeek): 15-22s/test, 99-100% pass

📘 **[Testing Documentation](ADDITIONAL_FEATURES.md#test-command-variants)**

---

## Compression

**Availability:** ✅ 100% offline | ⚡ <3s | ❌ No LLM required

| Command | Description | Example |
|---------|-------------|---------|
| `zip <target>` | Create zip archive | `zip my_folder` |
| `unzip <file>` | Extract zip archive | `unzip archive.zip` |

---

## Image Operations

**Availability:** ❌ Requires internet | ⚡ Variable | ✅ Requires Tier 2+

Requires Mistral or DeepSeek model enabled.

| Command | Description | Example |
|---------|-------------|---------|
| `image search <query>` | Search for images | `image search cute cats` |
| `image download <query>` | Download images (5) | `image download mountains` |
| `image generate <prompt>` | Generate AI images | `image generate sunset over ocean` |
| `image list` | List cached images | `image list` |
| `image clear` | Clear image cache | `image clear` |

**Supported Backends:**
- Google Images (search/download)
- Flux.1 (generation)
- Stable Diffusion (generation)
- Fooocus (advanced generation)

**Storage:** `~/.luciferai/images/`

---

## Fan & Thermal Management

**Availability:** ✅ Offline (macOS only) | ⚡ Real-time | ❌ No LLM required

**Platform:** macOS (Intel Macs)  
**Requires:** sudo privileges, smc binary

| Command | Description | Requires |
|---------|-------------|----------|
| `fan start` | Start adaptive fan control | sudo |
| `fan stop` | Stop daemon & restore auto | sudo |
| `fan status` | Check if daemon running | - |
| `fan logs` | View last 50 log entries | - |

**Features:**
- 6-sensor monitoring (CPU, GPU, MEM, HEAT, SSD, BAT)
- Battery safety overrides (≥45°C = max cooling)
- 36 hours thermal history logging
- Real-time trend detection
- Adaptive fan speed (2000-6200 RPM)

📘 **[Fan Management Documentation](ADDITIONAL_FEATURES.md#fan-management-system)**

---

## User Progress & Fun

**Availability:** ✅ 100% offline | ⚡ <50ms | ❌ No LLM required

| Command | Description | Details |
|---------|-------------|---------|
| `badges` | Show achievement badges | 13 badge system |
| `soul` | Soul modulator status | Rarity, level, stats |
| `diabolical mode` | Toggle enhanced mode | Unrestricted AI mode |
| `zodiac <sign>` | Get zodiac information | `zodiac scorpio` |
| `stats` | User statistics | Commands run, fixes applied |

**Badge System (13 Achievements):**
- 🌱 First Contribution (20 contributions)
- 🌿 Active Contributor (200 contributions)
- 🌳 Veteran Contributor (1000 contributions)
- ⭐ Elite Contributor (2000 contributions)
- 📚 Template Master (400 templates)
- 🔧 Fix Specialist (400 fixes)
- 🌟 Community Favorite (2000 downloads)
- 💎 Quality Contributor (4.5+ avg rating)
- Plus 5 more badges with multiple levels

**Rewards:**
- 7 badges → Special gift
- 13 badges → Easter egg + secret content

---

## Natural Language Queries

**Availability:** ⚠️ Depends on query | ⚡ Variable | ✅ Requires LLM

| Example Query | What It Does |
|---------------|--------------|
| `what is Python?` | Get explanations |
| `how do I...?` | Get instructions |
| `show me all Python files` | Natural language file operations |
| `explain this code` | Code analysis |
| `what's my IP address?` | System queries |

**Fallback Behavior:**
- No LLM: Returns "LLM not available, try installing TinyLlama"
- Pattern matching: Some queries work via rules (e.g., "list files")

---

## Quick Stats

**Total Commands:** 80+  
**Work Offline:** 72% (58+ commands)  
**No LLM Required:** 80% (64+ commands)  
**Average Response Time:** 15-50ms (without LLM)

**Most Used Commands:**
1. `help` - Show all commands
2. `llm list` - Check installed models
3. `fix <script>` - Auto-fix errors
4. `run <script>` - Execute scripts
5. `create file/folder` - Build structures

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Up/Down arrows | Navigate command history (120 commands) |
| Ctrl+C | Graceful shutdown |
| `clear` | Clear screen |
| `exit` | Exit LuciferAI |

---

## Command Routing Logic

```
User Input
    │
    ├─► Exact match? (help, exit, badges)
    │     └─► Execute locally (instant) ✅
    │
    ├─► File operation? (list, read, copy)
    │     └─► Execute with file_tools.py ✅
    │
    ├─► Script command? (run, fix)
    │     └─► Execute with FixNet integration ✅
    │
    ├─► Question? (what, how, why, ?)
    │     └─► Route to LLM (if available)
    │
    └─► Creation task? (create, write, build)
          └─► Route to LLM with step system
```

---

## See Also

- [NO_LLM_OPERATION.md](NO_LLM_OPERATION.md) - Zero-LLM fallback systems
- [FIXNET_SYSTEM.md](FIXNET_SYSTEM.md) - Complete FixNet architecture
- [ADDITIONAL_FEATURES.md](ADDITIONAL_FEATURES.md) - Stats, daemon, testing, fan management
- [QUICKSTART.md](QUICKSTART.md) - Getting started guide
- [README.md](../README.md) - Main documentation

---

**System:** LuciferAI Local  
**Version:** 2.1  
**Last Updated:** 2026-01-23  
**License:** MIT

Made with 🩸 by LuciferAI
