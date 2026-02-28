# 🩸 Luc! Quick Start Guide

## Installation

Run the installer to set up the `luc` command globally:

```bash
./install_luc.sh
```

Then either:
- Run `source ~/.bashrc` (or `~/.zshrc`)
- Or open a new terminal

---

## Usage

### Install Packages

```bash
# Smart install (checks external first, then internal environment)
luc install requests

# Install multiple packages
luc install flask sqlalchemy

# Force specific package manager
luc install numpy --manager pip
luc install git --manager brew
```

### Environment Management

```bash
# Create new environment
luc create myproject

# List all environments
luc list

# Show activation script
luc activate myproject

# Remove environment
luc remove myproject

# Show current environment info
luc info
```

### Help & Info

```bash
# Show help
luc help

# Show version
luc version
```

---

## Examples

### Web Development Project

```bash
# Create environment
luc create webapp

# Install packages
luc install flask
luc install sqlalchemy
luc install jinja2

# List environments
luc list
```

### Data Science Project

```bash
# Create environment
luc create datascience

# Install packages
luc install numpy
luc install pandas
luc install matplotlib

# Check what's installed
luc info
```

### System Tools

```bash
# Install system commands
luc install curl
luc install htop
luc install tree
```

---

## How It Works

1. **External Check** - Checks if package already exists (system Python or PATH)
2. **Luci Install** - Tries LuciferAI's package manager first
3. **Internal Environment** - Installs to `.luc/env/venv/` if not external
4. **System Managers** - Falls back to brew/apt/pip/conda if needed
5. **Stub Creation** - Creates mock module as last resort
6. **Emergency Mode** - Shows installation instructions if all else fails

---

## Where Are Packages Installed?

### Internal Environment
```
.luc/env/venv/
```
- Used when package not found externally
- Project-local (doesn't pollute system)
- Survives system Python updates

### User Environments
```
.luc/environments/envs/myproject/
```
- Isolated environments (like conda)
- Created with `luc create`

---

## Tips

### Add to PATH (Optional)

For even easier access, add the project to your PATH:

```bash
# Add to ~/.bashrc or ~/.zshrc
export PATH="/Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local:$PATH"
```

Then you can run `luc` from anywhere!

### Check Installation Location

```bash
which luc
# Should show: alias luc='/path/to/LuciferAI_Local/luc'
```

### Verify Package Install

```bash
# Check if django is in internal environment
.luc/env/venv/bin/python -c "import django; print(django.__version__)"
```

---

## Troubleshooting

### "command not found: luc"

Run the installer again:
```bash
./install_luc.sh
source ~/.bashrc
```

### "Package not installing"

Check logs:
```bash
cat ~/.luciferai/logs/fallback_trace.log
```

### "Need to use specific package manager"

Use the `--manager` flag:
```bash
luc install package --manager brew
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `luc install <pkg>` | Install package |
| `luc create <env>` | Create environment |
| `luc list` | List environments |
| `luc activate <env>` | Show activation script |
| `luc remove <env>` | Remove environment |
| `luc info` | Show current env info |
| `luc help` | Show help |
| `luc version` | Show version |

---

🩸 **Happy coding with Luc!**
