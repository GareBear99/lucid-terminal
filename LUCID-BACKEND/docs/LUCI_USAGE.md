# 📦 Luci! Package Manager - Usage Guide

The Luci! package manager is a **universal installer** that can install any package available in brew or conda, plus specialized AI models and image generation tools.

## Setup

```bash
# Run setup (adds 'luci' function to your shell)
./setup_luci.sh

# Reload shell
source ~/.bashrc  # or ~/.bash_profile or ~/.zshrc
```

## Commands

### From Terminal (after setup)
```bash
luci install <package>      # Install a package
luci list                   # List all available packages
luci uninstall <package>    # Uninstall a package
luci update                 # Update all packages
```

### Direct Usage (without setup)
```bash
python3 luci/package_manager.py install <package>
python3 luci/package_manager.py list
python3 luci/package_manager.py uninstall <package>
python3 luci/package_manager.py update
```

### From within LuciferAI
Inside LuciferAI, the package manager is integrated:
```
install ollama
install llama3.2
```

## Examples

```bash
# View all packages
luci list

# Install AI stack
luci install ollama           # AI platform
luci install llama3.2         # 2GB, fast model
luci install mistral          # 7GB, advanced
luci install deepseek-coder   # 6.7GB, expert coding

# Install image generation
luci install flux             # Modern (24GB)
luci install stable-diffusion # Legacy-compatible (5GB)

# Install ANY brew package
luci install htop             # System monitor
luci install wget             # File downloader
luci install tree             # Directory viewer
luci install ffmpeg           # Video processing
luci install docker           # Containers
luci install node             # JavaScript runtime
luci install git              # Version control

# Install ANY conda package
luci install pytorch          # Deep learning
luci install tensorflow       # ML framework
luci install matplotlib       # Plotting
luci install jupyter          # Notebooks
luci install opencv           # Computer vision

# Install Python packages
luci install numpy
luci install pandas
luci install flask
```

## Available Packages

### AI Platforms
- `ollama` - Local AI engine

### AI Models (requires Ollama)
- `llama3.2` (2GB) - Fast model
- `mistral` (7GB) - Advanced with web search
- `deepseek-coder` (6.7GB) - Expert coding assistant

### Image Models
- `flux` (~24GB) - Modern fast generation
- `stable-diffusion` (~5GB) - CPU-friendly
- `diffusionbee` (~2GB) - GUI for macOS

### System Tools
- `brew` - Homebrew
- `conda` - Anaconda/Miniconda

## File Locations

All packages install to:
```
~/.luciferai/
├── bin/              # Executables
├── packages/         # Installed packages
├── models/           # AI models
└── image_models/     # Image generation models
```

## Notes

- **Universal Installer**: Can install ANY package from brew or conda
- Command is `luci` (no exclamation in terminal due to shell escaping)
- Branding is "Luci!" (with exclamation)
- Automatically tries brew → conda → pip for unknown packages
- All packages auto-integrate with LuciferAI
- Restart LuciferAI after installing AI models

## How It Works

1. Checks if package is in predefined list (AI models, image gen, etc.)
2. If not found, tries **Homebrew** first (macOS packages)
3. If brew fails, **asks to try Conda** (y/n single-key prompt)
4. If conda fails, **asks to try pip** (y/n single-key prompt)
5. Continues until success or all sources exhausted
6. Shows beautiful progress and installation details

### Smart Fallback System

- **First source** is tried automatically
- **Failed?** → Luci! asks: "Try [next source]? (y/n)"
- **Press `y`** → Proceeds to next source
- **Press `n`** → Skips to next or aborts
- **No Enter needed!** Single-key response

See [FALLBACK_FEATURE.md](FALLBACK_FEATURE.md) for detailed examples.
