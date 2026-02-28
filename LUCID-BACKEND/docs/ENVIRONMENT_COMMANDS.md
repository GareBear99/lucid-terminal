# Environment Management Commands

## Overview

LuciferAI provides comprehensive environment management tools that can discover, search, and help activate virtual environments across **all package managers** on your system.

## Features

### 🔍 Universal Environment Discovery
- **Conda** environments
- **venv/virtualenv** environments
- **pyenv** versions
- **Luci** environments
- **Poetry** environments (detected as venv)
- **Pipenv** environments (detected as venv)
- **Project-local** venvs (.venv, venv, env, etc.)

### 🎯 Smart Search
- Search by **name** (case-insensitive)
- Search by **path** (any part of the path)
- Search by **Python version** (e.g., "3.11")
- Search by **type** (conda, venv, pyenv, luci)

### 🚀 Easy Activation
- Generates activation commands for any environment
- Works with your shell (bash, zsh, etc.)
- Shows exact command to copy and run
- Handles multiple matches intelligently

---

## Commands

### 1. List All Environments

```bash
environments
# or
envs
```

**What it does:**
- Scans your entire system for virtual environments
- Shows all found environments grouped by type
- Displays Python versions and paths
- Indicates which environment is currently active
- Provides activation commands for each

**Example output:**
```
🩸 LuciferAI Environment Scanner

🎯 Active Environment:
  myproject (venv)

📊 Found Environments:
  Conda:      3 environments
  Luci:       2 environments
  Venv:       8 environments
  Total:      13 environments
```

---

### 2. Search for Environments

```bash
env search <query>
# or
environment search <query>
```

**Search by name:**
```bash
env search myproject
env search flask
env search test
```

**Search by Python version:**
```bash
env search 3.11
env search 3.9
```

**Search by type:**
```bash
env search conda
env search venv
env search pyenv
```

**Search by path:**
```bash
env search Desktop
env search virtualenvs
env search home
```

**Example output:**
```
╔════════════════════════════════════════════════════════════╗
║        🔍 Environment Search: myproject                    ║
╚════════════════════════════════════════════════════════════╝

✓ Found 2 matching environment(s):

🐍 Conda: (1 found)

  myproject
    Type: conda
    Python: 3.11.5
    Path: /Users/user/miniconda3/envs/myproject
    
    💡 Activate: conda activate myproject

📦 Venv/Virtualenv: (1 found)

  myproject_venv
    Type: venv
    Python: 3.11.0
    Path: /Users/user/.virtualenvs/myproject_venv
    
    💡 Activate: source /Users/user/.virtualenvs/myproject_venv/bin/activate
```

---

### 3. Activate Environment

```bash
activate <env_name>
# or
env activate <env_name>
# or
activate env <env_name>
```

**By name:**
```bash
activate myproject
activate venv
activate .venv
```

**By path:**
```bash
activate /Users/user/.virtualenvs/myenv
activate ~/Desktop/project/venv
```

**Example output (single match):**
```
╔════════════════════════════════════════════════════════════╗
║        🔥 Activate Environment: myproject                  ║
╚════════════════════════════════════════════════════════════╝

✓ Found environment:

  myproject
  Type: conda
  Python: 3.11.5
  Path: /Users/user/miniconda3/envs/myproject

═══════════════════════════════════════════════════════════

📋 Activation Command:

  conda activate myproject

═══════════════════════════════════════════════════════════

💡 To activate, copy and run the command above in your terminal
   (LuciferAI cannot directly activate environments in your shell)
```

**Example output (multiple matches):**
```
⚠️  Found 3 matching environments:

  [1] myproject
      Type: conda
      Python: 3.11.5
      Path: /Users/user/miniconda3/envs/myproject

  [2] myproject_dev
      Type: venv
      Python: 3.10.8
      Path: /Users/user/.virtualenvs/myproject_dev

  [3] myproject_test
      Type: venv
      Python: 3.11.0
      Path: /Users/user/projects/myproject/.venv

💡 Use exact name or full path to activate specific environment
   Example: activate myproject_dev
```

---

## How It Works

### Environment Detection

LuciferAI scans these locations:
- `~/.virtualenvs` (virtualenvwrapper)
- `~/.pyenv/versions` (pyenv)
- `~/.local/share/virtualenvs` (pipenv)
- `~/.conda/envs` (conda)
- `~/.luci_environments/envs` (luci)
- `~/envs`, `~/venv`, `~/.venv` (common locations)
- Current directory (`./venv`, `./.venv`, `./env`)

It also queries:
- **conda env list** (if conda installed)
- **pyenv versions** (if pyenv installed)

### Search Algorithm

1. **Exact match priority**: Exact name matches come first
2. **Partial matches**: Searches in name, path, Python version, and type
3. **Deduplication**: Removes duplicate paths
4. **Grouping**: Results grouped by type (conda, venv, pyenv, luci)

### Activation Command Generation

Based on environment type:
- **Conda**: `conda activate <name>`
- **Pyenv**: `pyenv activate <name>`
- **Luci**: `source <(luci activate <name>)`
- **Venv**: `source <path>/bin/activate`

---

## Use Cases

### Find all Python 3.11 environments
```bash
env search 3.11
```

### List all conda environments
```bash
env search conda
```

### Find project environment
```bash
env search myproject
```

### Activate environment for current project
```bash
# If you have ./venv in current directory
activate venv
```

### Check what's currently active
```bash
environments
# Look for the green * marker
```

---

## Tips

### 💡 Search Tips
- Use shorter terms for broader results (e.g., "py" instead of "python")
- Search by Python version to find compatible environments
- Search by type to see all environments of one kind
- Search by path segment if you know where it's located

### 💡 Activation Tips
- Be specific with names if you have multiple matches
- Use full path if exact match is ambiguous
- Copy the activation command exactly as shown
- Already active environments show a green checkmark

### 💡 Organization Tips
- Use consistent naming for your environments
- Group related environments with prefixes (e.g., `proj_dev`, `proj_test`)
- Keep environment names short but descriptive

---

## Testing

Run the comprehensive test suite:

```bash
cd tests
python3 test_environment_commands.py
```

**Tests include:**
- List all environments
- Search by name, version, type, and path
- Activate by name and path
- Handle multiple matches
- Handle no matches gracefully
- Error handling

---

## Technical Details

### Files
- `core/environment_scanner.py` - Main scanner and search logic
- `core/enhanced_agent.py` - Command routing and handlers
- `tests/test_environment_commands.py` - Comprehensive test suite

### Functions
- `scan_environments()` - Scan and list all environments
- `search_environment(query)` - Search with any criteria
- `activate_environment(query)` - Generate activation command

### Environment Info Structure
```python
{
    'name': str,           # Environment name
    'path': str,           # Full path
    'type': str,           # conda/venv/pyenv/luci
    'python_version': str, # Python version (e.g., "3.11.5")
    'active': bool         # Currently active?
}
```

---

## Troubleshooting

### No environments found
- Make sure you have virtual environments created
- Check that conda/pyenv is in your PATH if using those
- Try running `environments` to see if any are detected at all

### Wrong environment found
- Use more specific search terms
- Use the full path to be exact
- Use exact name match (case-insensitive)

### Activation command doesn't work
- Make sure you copied the entire command
- Check your shell type (bash, zsh, etc.)
- For conda, ensure conda is initialized in your shell
- For venv, make sure you have permission to execute

### Multiple matches when activating
- Use the exact name shown in the list
- Or use the full path to the environment
- Check the numbered list and use the exact name of the one you want

---

## Future Enhancements

Planned features:
- [ ] Create new environments from LuciferAI
- [ ] Delete/remove environments
- [ ] Show installed packages in environment
- [ ] Compare environments
- [ ] Export/import environment specs
- [ ] Auto-activate based on project detection

---

## Summary

The environment management commands provide a unified interface to work with all your Python virtual environments, regardless of how they were created. Search, discover, and activate environments effortlessly across conda, venv, pyenv, luci, poetry, and pipenv! 🚀
