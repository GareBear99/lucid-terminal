# 👾 LuciferAI Quick Reference

## 🚀 Getting Started
```bash
python3 lucifer.py
```

## 📋 Core Commands

### Self-Healing
| Command | Description | Example |
|---------|-------------|---------|
| `run <script.py>` | Execute with auto-fix on error | `run test.py` |
| `fix <script.py>` | Manually trigger fix analysis | `fix broken.py` |
| `search fixes for "<error>"` | Search FixNet for solutions | `search fixes for "NameError"` |

### FixNet
| Command | Description |
|---------|-------------|
| `fixnet sync` | Sync with remote fixes |
| `fixnet stats` | View dictionary statistics |

### File Operations
| Command | Description | Example |
|---------|-------------|---------|
| `read <file>` | Read file contents | `read main.py` |
| `find <pattern>` | Find files matching pattern | `find "*.py"` |
| `list <dir>` | List directory contents | `list .` |

### System Commands
| Command | Description |
|---------|-------------|
| `where am i` | Show environment info |
| `help` | Show all capabilities |
| `clear` | Clear screen |
| `exit` / `quit` / `q` | Exit terminal |

## 🎨 Visual System

### Color Meanings
| Color | Meaning |
|-------|---------|
| 🟣 **Purple** | Identity, AI core, idle |
| 🟢 **Green** | Success, completion |
| 🟡 **Yellow** | Warning, caution, steps |
| 🔴 **Red** | Error, failure |
| 🔵 **Cyan** | Info, prompts, analysis |
| ⚪ **Grey** | Background, debug |

### Key Emojis
| Emoji | Meaning |
|-------|---------|
| 👾 | LuciferAI identity |
| 🩸 | Idle / heartbeat |
| ✨ | Success / magic |
| 🔧 | Fix applied |
| ⚡ | Command execution |
| 🔍 | Searching / reading |
| 🚀 | Uploading to FixNet |
| ✅ | Operation complete |
| ❌ | Operation failed |
| ⚠️ | Warning |

## 💡 Tips

1. **Auto-Fix**: Just run scripts - errors are automatically fixed and uploaded to FixNet
2. **Learning System**: LuciferAI learns from every fix and shares with the community
3. **Offline AI**: Run `./setup_ollama.sh` to enable AI-powered suggestions
4. **Color Coding**: Watch the colors - they tell you what's happening
5. **FixNet**: Your fixes help others automatically

## 🔥 Example Workflow

```bash
# Start LuciferAI
python3 lucifer.py

# Run a script with errors
> run test.py

# LuciferAI will:
# [1/5] Search for similar fixes
# [2/5] Try known fix if available
# [3/5] Generate new fix if needed
# [4/5] Apply the fix
# [5/5] Upload to FixNet
# ✨ Script fixed and uploaded!

# Check what's in the dictionary
> fixnet stats

# Search for specific error
> search fixes for "ModuleNotFoundError"

# List current directory
> list .

# Exit when done
> exit
```

## 🎭 Motto
**"Forged in Neon, Born of Silence."**

---
For full documentation, see `VISUAL_SYSTEM.md`
