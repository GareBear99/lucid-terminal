# 🩸 LuciferAI Demo & Test Scripts

This folder contains demonstration and test scripts for LuciferAI features.

## 📋 Test Scripts

### Core Feature Tests

| Script | Description |
|--------|-------------|
| `test_comprehensive_fixes.py` | Test fix dictionary with 30 common Python issues |
| `test_daemon_complete.py` | Test daemon watch and autofix modes |
| `test_all.py` | Complete command test suite - tests all LuciferAI commands |
| `test_populate_fixes.py` | Populate fix dictionary with sample fixes |

### Environment & Module Tests

| Script | Description |
|--------|-------------|
| `test_env_system.py` | Test environment scanner (conda, venv, Luci, pyenv) |
| `test_modules.py` | Test module tracker across all package managers |

### UI/UX Tests

| Script | Description |
|--------|-------------|
| `test_heartbeat.py` | Test idle heartbeat animation |
| `test_cd.py` | Test directory navigation with awareness |

### Demo Scripts

| Script | Description |
|--------|-------------|
| `demo_autofix.py` | Interactive demo of auto-fix functionality |
| `test_broken_script.py` | Broken script for testing fixes |

### Shell Scripts

| Script | Description |
|--------|-------------|
| `test_all.sh` | Shell script to test basic functions |
| `test_all_functions.sh` | Test all LuciferAI functions |
| `test_all_commands.sh` | Test command execution |

## 🚀 Quick Start

### Test Complete System
```bash
cd Demo
python3 test_all.py
```

### Test Fix Dictionary
```bash
python3 test_comprehensive_fixes.py
```

### Test Daemon (Watch & Autofix)
```bash
python3 test_daemon_complete.py
```

### Test Environment Scanner
```bash
python3 test_env_system.py
```

### Test Module Tracker
```bash
python3 test_modules.py
```

### Interactive Auto-Fix Demo
```bash
python3 demo_autofix.py
```

## 📝 Notes

- All tests are standalone and don't affect production data
- Tests create temporary files in `/tmp` or on Desktop
- Some tests require user interaction (press Enter to continue)
- Tests will show colored output with status indicators

## 🎯 Test Order for New Users

1. `test_heartbeat.py` - See the UI in action
2. `demo_autofix.py` - See auto-fix capabilities
3. `test_comprehensive_fixes.py` - See fix dictionary
4. `test_daemon_complete.py` - See daemon modes
5. `test_all.py` - See all commands working together
6. `test_env_system.py` - See environment scanning
7. `test_modules.py` - See module tracking

## 🛠️ Development Tests

These tests are useful during development:

- `test_cd.py` - Testing directory awareness
- `test_populate_fixes.py` - Populate fix database
- `test_broken_script.py` - Sample broken script

---

**Made with 🩸 by LuciferAI**
