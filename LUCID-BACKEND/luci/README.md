# 📦 Luci! Package Manager

Universal package installer with intelligent fallback system for AI models, system tools, and image generation models.

## Quick Start

```bash
# Install the terminal command
./setup_luci.sh
source ~/.bashrc

# Use it!
luci install ollama
luci install llama3.2
luci list
```

**LuciferAI's intelligent package management system** - like conda, but smarter.

## Overview

Luci is LuciferAI's built-in package manager that intelligently handles package installation across all operating systems with automatic fallback to system package managers.

## Features

✅ **Smart Fallback Cascade**
- Try Luci first (LuciferAI's native package manager)
- Fall back to first available system package manager (brew/apt/choco/pip/etc)
- Prompt user to install package manager if none found

✅ **Cross-Platform**
- macOS (Homebrew, MacPorts)
- Linux (apt, yum, dnf, pacman, zypper)
- Windows (Chocolatey, WinGet, Scoop)
- Universal (pip, conda, npm)

✅ **Intelligent Detection**
- Automatically detects available package managers
- Prioritizes best manager for your OS
- Shows helpful prompts when setup is needed

## Installation Priority

```
0. Check External Availability (skip if already installed)
   ↓ (if not found)
1. Luci Package Manager → Internal Environment
   ↓ (if fails)
2. Internal Environment pip install
   ↓ (if fails)
3. System Package Managers
   ↓ (if fails)
4. Stub Module Creation
   ↓ (if fails)
5. Prompt User + Auto-Repair
```

## Internal Environment

**Luci maintains its own internal global environment** (like conda's base environment):

- **Location:** `~/.luci/env/venv/`
- **Purpose:** Isolated package installation without polluting system Python
- **Behavior:** Packages install here if not already available externally
- **Detection:** Checks external availability before installation

## Usage

### Python API

```python
from luci import install_package

# Install package with smart fallback
success = install_package('curl')

# Force specific package manager
success = install_package('git', force_manager='brew')
```

### Command Line

```bash
# Install package (tries luci first, then system managers)
python -m luci.smart_installer curl

# Force specific manager
python -m luci.smart_installer git --manager brew
```

### Integration with LuciferAI

```python
# In your LuciferAI code
from luci import install_package

if not package_available('requests'):
    install_package('requests')
```

## How It Works

### Tier 1: Luci Package Manager

Luci first attempts to use its own package management system:

```
[1/3] Attempting Luci package manager...
```

- Checks if `luci` command is available
- Runs `luci install <package>`
- Uses LuciferAI's curated package repository

### Tier 2: System Package Managers

If Luci fails, it cascades through available system package managers:

```
[2/3] Checking available system package managers...

Available package managers:
  ✓ Homebrew (brew)
  ✓ pip3 (pip3)
  ✓ Conda (conda)

🔄 Attempting install via Homebrew...
✅ Successfully installed via Homebrew
```

**Supported Managers:**

| OS | Package Managers |
|----|------------------|
| **macOS** | brew, port, pip3, pip, conda, npm |
| **Linux** | apt, apt-get, yum, dnf, pacman, zypper, pip3, pip, conda, npm |
| **Windows** | choco, winget, scoop, pip, conda, npm |

### Tier 3: Installation Prompt

If all package managers fail, Luci provides helpful guidance:

```
[3/3] All available package managers failed

╔══════════════════════════════════════════════════════════╗
║  ⚠️  No suitable package manager found                    ║
╚══════════════════════════════════════════════════════════╝

💡 Recommended Package Manager for Darwin:

Homebrew
The Missing Package Manager for macOS

🔗 Website: https://brew.sh

📦 Installation:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

💡 Alternative: Use Python's pip
pip is already available with Python
Command: /usr/bin/python3 -m pip install <package>

After installing a package manager, try again:
luci install <package>
```

## Examples

### Install System Tool

```python
from luci import install_package

# Install git
install_package('git')
```

### Install Python Package

```python
from luci import install_package

# Install requests
install_package('requests')
```

### Force Specific Manager

```python
from luci import install_package

# Only use Homebrew
install_package('curl', force_manager='brew')

# Only use pip
install_package('numpy', force_manager='pip3')
```

## Directory Structure

```
luci/
├── __init__.py           # Package initialization
├── smart_installer.py    # Core installer with fallback logic
└── README.md            # This file
```

## Configuration

Luci stores its data in:

```
~/.luci/
├── env/
│   └── venv/           # Internal global environment (like conda base)
├── packages/            # Installed packages metadata
└── cache/              # Download cache
```

### Environment Behavior

1. **External Check:** Before installing, Luci checks if package is already available externally (system Python or PATH)
2. **Internal Install:** If not found externally, installs to `~/.luci/env/venv/`
3. **No Pollution:** System Python remains clean
4. **Persistent:** Survives system Python updates

## Integration with Fallback System

Luci works seamlessly with LuciferAI's 5-tier fallback system:

- **Tier 0:** Direct install via Luci
- **Tier 1:** Virtual environment fallback
- **Tier 2:** System package managers (Luci integrates here)
- **Tier 3:** Stub modules
- **Tier 4:** Emergency mode

## Future Enhancements

- [ ] Luci package repository with curated packages
- [ ] Binary caching for offline installs
- [ ] Package verification and signing
- [ ] Dependency resolution
- [ ] Version pinning and constraints
- [ ] Luci environments (like conda environments)

## Credits

**System:** LuciferAI Package Manager  
**Version:** 1.0.0  
**Inspired by:** conda, pip, homebrew
