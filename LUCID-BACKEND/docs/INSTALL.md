# 🩸 LuciferAI Installation Guide

Install LuciferAI globally and use the `LuciferAI` command from anywhere.

## 🚀 Quick Install

### Universal Installer (Recommended)

```bash
./install.sh
```

Choose your preferred installation method:
1. pip (standard)
2. pip --user (no sudo required)
3. pip -e (development mode)
4. Homebrew
5. conda
6. Luci Environment

## 📦 Installation Methods

### Method 1: pip (Global)

```bash
pip install .
```

Or from GitHub:
```bash
pip install git+https://github.com/TheRustySpoon/LuciferAI_Local.git
```

### Method 2: pip --user (No sudo)

```bash
pip install --user .
```

Add to PATH if needed:
```bash
export PATH="$PATH:$(python3 -m site --user-base)/bin"
```

### Method 3: Development Mode

```bash
pip install -e .
```

Changes to source code will be reflected immediately.

### Method 4: Homebrew (Future)

Once published to Homebrew:
```bash
brew install luciferai
```

### Method 5: conda

```bash
conda install luciferai
```

Or with pip in conda environment:
```bash
pip install .
```

### Method 6: Luci Environment

```bash
# Create a Luci environment
luci create myenv

# Activate it
source <(luci activate myenv)

# Install LuciferAI
pip install .
```

## ✅ Verify Installation

```bash
LuciferAI --version
```

Or just run:
```bash
LuciferAI
```

## 🎯 Available Commands

After installation, you can use any of these commands:

```bash
LuciferAI          # Main command (capitalized)
luciferai          # Lowercase version
lucifer            # Short version
```

All three commands do the same thing!

## 🛠️ Troubleshooting

### Command not found

If `LuciferAI` command is not found after installation:

1. **Check pip bin directory is in PATH:**

```bash
echo $PATH | grep "$(python3 -m site --user-base)/bin"
```

2. **Add to PATH manually:**

Add to `~/.bashrc` or `~/.zshrc`:
```bash
export PATH="$PATH:$(python3 -m site --user-base)/bin"
```

Then reload:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

3. **Find where pip installed it:**

```bash
which LuciferAI
# or
python3 -m site --user-base
```

### Permission denied

Use `--user` flag:
```bash
pip install --user .
```

Or use `sudo` (not recommended):
```bash
sudo pip install .
```

### Already installed

Reinstall or upgrade:
```bash
pip install --upgrade --force-reinstall .
```

## 🔄 Uninstall

```bash
pip uninstall luciferai
```

## 📝 Requirements

- Python 3.8 or higher
- pip
- Unix-like system (macOS, Linux)

## 🌐 From GitHub

Install directly from GitHub:

```bash
pip install git+https://github.com/TheRustySpoon/LuciferAI_Local.git
```

Or clone and install:

```bash
git clone https://github.com/TheRustySpoon/LuciferAI_Local.git
cd LuciferAI_Local
pip install .
```

## 💡 Usage After Installation

```bash
# Start interactive mode
LuciferAI

# Install packages
LuciferAI install requests

# Run tests
LuciferAI test

# Show version
LuciferAI version

# Get help
LuciferAI help
```

---

**Made with 🩸 by LuciferAI**
