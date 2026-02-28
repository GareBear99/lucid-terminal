# Additional Features Documentation

Comprehensive documentation for stats tracking, daemon workflows, testing systems, and fan management.

---

## 📊 Stats Command

### Overview
The `stats` command provides comprehensive statistics about your FixNet usage, contributions, and system status.

### Usage
```bash
# Show FixNet statistics
fixnet stats
dictionary stats
stats
```

### Metrics Displayed

#### 1. User Profile
- **User ID**: Your unique identifier (GitHub username or anonymous ID)
- **Account Status**: Linked GitHub account or local-only mode

#### 2. Local Dictionary
- **Total Fixes**: Number of fixes stored locally
- **Error Types**: Unique error types in your dictionary
- **Branch Connections**: Network of related fixes (inspired_by relationships)

#### 3. Remote FixNet
- **Community Fixes Available**: Total fixes accessible from the global FixNet
- **Sync Status**: Last sync timestamp and available updates

#### 4. Smart Filter Performance
- **Novel Uploads**: Unique fixes you've contributed to FixNet
- **Rejected Duplicates**: Duplicate submissions prevented
- **Rejection Rate**: Percentage of duplicate/low-quality uploads blocked
  - **High rejection rate (>50%)** = Excellent filter performance
  - Prevents pollution of the global FixNet

#### 5. GitHub Integration
- **Total Commits**: Number of fix commits uploaded to FixNet repo
- **Contribution Streak**: Days of continuous contributions
- **Last Upload**: Timestamp of most recent upload

### Example Output
```
═══════════════════════════════════════════════════════════
📊 Integrated FixNet Statistics
═══════════════════════════════════════════════════════════

👤 User ID: TheRustySpoon

📚 Local Dictionary:
   • Total fixes: 1,247
   • Error types: 89
   • Branch connections: 234

🌐 Remote FixNet:
   • Community fixes available: 10,472

🎯 Smart Filter:
   • Novel uploads: 47
   • Rejected duplicates: 134
   • Rejection rate: 74.0%

📤 GitHub Commits:
   • Total commits: 47

✨ Excellent! Smart filter is preventing duplicate pollution.

═══════════════════════════════════════════════════════════
```

### Understanding the Metrics

**Rejection Rate**:
- **Above 50%**: Excellent - Your filter is working well
- **30-50%**: Good - Most duplicates are caught
- **Below 30%**: Check filter settings - May be uploading duplicates

**Branch Connections**:
- Shows how fixes evolve through "inspired_by" relationships
- Higher numbers indicate active fix refinement and collaboration

---

## 👁️ Daemon Watch Workflow

### Overview
The daemon watch system monitors Python scripts for errors and automatically suggests or applies fixes from the FixNet consensus dictionary.

### Two Operating Modes

#### 1. Watch Mode (Suggest Fixes)
Monitors scripts and **suggests** fixes when errors are detected. User confirms before applying.

```bash
# Via LuciferAI
daemon watch
daemon start watch

# Or directly with script name
daemon watch script_name.py
```

#### 2. Autofix Mode (Auto-Apply)
Monitors scripts and **automatically applies** trusted fixes without user confirmation.

```bash
daemon autofix
daemon auto
```

### Complete Workflow

#### Step 1: Add Scripts to Watch List
```bash
# Add a single file
daemon add path/to/script.py

# Add a directory (watches all Python files)
daemon add path/to/directory/

# List watched paths
daemon list
```

#### Step 2: Start Daemon
```bash
# Watch mode (suggest fixes)
daemon watch

# Autofix mode (auto-apply trusted fixes)
daemon autofix
```

#### Step 3: Daemon Monitors Files
When a watched file is modified:
1. **Detects Change** - Uses file system events (watchdog library)
2. **Runs Script** - Executes the script to catch errors
3. **Analyzes Errors** - Parses error messages and stack traces
4. **Searches FixNet** - Queries consensus dictionary for matching fixes
5. **Evaluates Trust** - Checks success rate, unique users, and trust level

#### Step 4: Fix Application Logic

**Watch Mode** (daemon watch):
```
Error Detected → Search FixNet → Show Matches → User Confirms → Apply Fix
```

**Autofix Mode** (daemon autofix):
```
Error Detected → Search FixNet → Check Trust Level → Auto-Apply if Trusted
```

**Trust Levels**:
- **Highly Trusted** (≥90% success): Auto-applied in autofix mode
- **Trusted** (≥70% success): Suggested in watch mode, optional in autofix
- **Experimental** (≥40% success): Suggested with warning
- **Quarantined** (<40% success): Not suggested

#### Step 5: Daemon Logging
All actions are logged to `~/.luciferai/logs/daemon.log`:
- File changes detected
- Errors found
- Fixes applied (with fix_hash)
- User confirmations/rejections

### Daemon Commands

| Command | Action |
|---------|--------|
| `daemon add <path>` | Add file/directory to watch list |
| `daemon remove <path>` | Remove from watch list |
| `daemon list` | Show all watched paths |
| `daemon watch` | Start in watch mode (suggest fixes) |
| `daemon autofix` | Start in autofix mode (auto-apply) |
| `daemon stop` | Stop the daemon |
| `daemon status` | Check if daemon is running |

### Example Session
```bash
LuciferAI> daemon add myproject/

🔍 Added to watch list:
   • myproject/ (12 Python files)

LuciferAI> daemon watch

👁️ Daemon started in WATCH mode
   Monitoring: myproject/ (12 files)
   Mode: Suggest fixes (user confirms)

[User edits myproject/api.py - introduces error]

🚨 Error detected in myproject/api.py:
   Line 45: NameError: name 'json' is not defined

🔍 Searching FixNet...

💡 Fix found (97% success, 23 users):
   Solution: import json
   Trust: Highly Trusted
   
Apply this fix? (y/n): y

✅ Fix applied successfully!
```

### Visual Step Workflow

When LuciferAI processes a complex task, it shows a dynamic step-by-step checklist:

**1. Initial Checklist** (all steps unchecked):
```
────────────────────────────────────────────────────────
📋 Task Checklist:
────────────────────────────────────────────────────────

  [ ] 1. Create Python file for the script
  [ ] 2. Write code to implement functionality
  [ ] 3. Test script execution

────────────────────────────────────────────────────────
```

**2. Step-by-Step Execution**:
```
────────────────────────────────────────────────────────
📝 Step 1/3: Create Python file for the script

📝 Created: myproject/api_client.py

  [✓] 1. Create Python file for the script

────────────────────────────────────────────────────────
📝 Step 2/3: Write code to implement functionality

🤔 mistral (Tier 2) thinking: [streaming code generation...]
   [Input: 89 tokens (356 chars), Output: 245 tokens (980 chars), Total: 334 tokens]

✅ Code written successfully

  [✓] 2. Write code to implement functionality

────────────────────────────────────────────────────────
📝 Step 3/3: Test script execution

🎯 Running script: myproject/api_client.py
✅ Script executed successfully (exit code: 0)

  [✓] 3. Test script execution
```

**3. Final Checklist Recap**:
```
────────────────────────────────────────────────────────
📋 Final Checklist:
────────────────────────────────────────────────────────

  [✓] 1. Create Python file for the script
  [✓] 2. Write code to implement functionality
  [✓] 3. Test script execution

────────────────────────────────────────────────────────

🎉 All steps completed successfully!

💬 mistral - Execution Summary:
Created api_client.py with REST API functionality. All tests passed successfully.
   [Input: 67 tokens (268 chars), Output: 23 tokens (92 chars), Total: 90 tokens]
```

**Failure Example** (Step 2 fails):
```
────────────────────────────────────────────────────────
📝 Step 2/3: Write code to implement functionality

❌ mistral (Tier 2) failed
   Reason: Connection timeout
🔄 Trying next tier...

❌ tinyllama (Tier 0) failed
   Reason: Model not available

⚠️  All LLM models failed or timed out
🔄 Using dynamic fallback parser for step generation

  [✗] 2. Write code to implement functionality

────────────────────────────────────────────────────────
📋 Final Checklist:
────────────────────────────────────────────────────────

  [✓] 1. Create Python file for the script
  [✗] 2. Write code to implement functionality
  [ ] 3. Test script execution

────────────────────────────────────────────────────────

⚠️  Workflow completed with errors
```

**Legend**:
- `[ ]` = Step pending
- `[✓]` = Step completed successfully (green)
- `[✗]` = Step failed (red)
- `────` = Visual separator between sections
- `📝` = Step execution header
- `📋` = Checklist display

### Safety Features
- **Backups**: Creates `.bak` files before applying fixes
- **Undo Support**: Can revert to previous version
- **Trust Threshold**: Only applies fixes above confidence threshold
- **User Override**: Watch mode always asks for confirmation

---

## 🧪 Test Command Variants

### Overview
LuciferAI includes a comprehensive automated test suite to validate command parsing, model performance, and system functionality across all tiers.

### Test Suite Structure

#### 1. Model-Specific Tests
Test a single model with full command suite (76 tests):

```bash
# Test specific model
test tinyllama
test mistral
tinyllama test
mistral test

# Or with explicit "run"
run tinyllama test
run mistral test
```

**Test Categories** (76 tests total):
- **9 Natural Language Queries**: "how to create file", "show me Python files", etc.
- **8 Information Commands**: help, info, memory, history, pwd, models, llm list
- **14 Complex AI Tasks**: Code generation, multi-step workflows, planning
- **9 File Operations**: list, read, find, copy, move, create
- **6 Daemon/Watcher & Fix**: run scripts, fix consensus, daemon watch
- **6 Model Management**: llm list, enable/disable, models info
- **6 Build Tasks**: create folder/file, context tracking
- **12 Edge Cases**: empty input, unusual formatting, unreasonable requests
- **6 Command History**: persistent 120 commands, search, reuse

#### 2. Test All Models
Run full test suite on **all installed models** (76 tests × N models):

```bash
test all
run test
run tests
test suite
```

**Features**:
- Tests each model sequentially
- Tracks pass/fail per model
- Generates detailed logs
- Shows tier-based performance comparison

#### 3. Short Test (Quick Validation)
Runs **5 quick queries** on all models for rapid validation:

```bash
short test
quick test
run short test
```

**Quick Test Queries**:
1. "hello" - Basic response
2. "list files" - Command parsing
3. "help" - Information retrieval
4. "what is Python" - Knowledge query
5. "create folder test" - Task execution

#### 4. Interactive Model Test
Prompts you to select which model to test:

```bash
test
```

**Interactive Menu**:
```
🧪 Which model would you like to test?

  [1] tinyllama
  [2] mistral
  [3] llama3.2
  [A] All models
  [0] Cancel

Select model (number/A):
```

### Test Results and Logs

#### Console Output
```
═══════════════════════════════════════════════════════════
🧪 LuciferAI Model Test Suite
═══════════════════════════════════════════════════════════

Testing TINYLLAMA (Tier 0)
─────────────────────────────────────────────────────────

✅ Natural Language: 9/9 passed
✅ Information Commands: 8/8 passed
✅ Complex AI Tasks: 14/14 passed
✅ File Operations: 9/9 passed
✅ Daemon/Fix: 6/6 passed
✅ Model Management: 6/6 passed
✅ Build Tasks: 6/6 passed
⚠️  Edge Cases: 5/6 passed (1 timeout)
✅ Command History: 6/6 passed

─────────────────────────────────────────────────────────
TINYLLAMA Results: 75/76 tests passed (98.7%)
```

#### Detailed Log File
All test runs are saved to `~/.luciferai/logs/last_test_run.log`:

```
═══════════════════════════════════════════════════════════
LuciferAI Automated Test Run
Timestamp: 2025-01-23 10:30:00
═══════════════════════════════════════════════════════════

Test Coverage:
  - 9 Natural Language Queries
  - 8 Information Commands
  - 14 Complex AI Tasks
  - 9 File Operations (list, read, find, copy, move, create)
  - 6 Daemon/Watcher & Fix (run, fix consensus, daemon watch)
  - 6 Model Management (llm list, enable/disable, models info)
  - 6 Edge Cases (empty, unusual, unreasonable)
  Total: 76 test commands per model

Execution Details:
  - Models Tested: 2
  - Total Individual Tests: 152
  - Test Format: Each command runs against ALL installed models

═══════════════════════════════════════════════════════════
Model: TINYLLAMA (Tier 0)
═══════════════════════════════════════════════════════════
Result: 75/76 passed (98.7%)

[Full test output for each command...]

═══════════════════════════════════════════════════════════
SUMMARY
═══════════════════════════════════════════════════════════
Total Models Tested: 2

✅ Overall Result: ALL MODELS PASSED
```

### Test Automation Script

The tests are implemented in `tests/test_all_commands.py`:
- **100% automated** - No user interaction required
- **Timeout handling** - Prevents hung tests (60s limit)
- **Error detection** - Validates responses and catches failures
- **Regression testing** - Ensures updates don't break existing features

### Performance Benchmarks by Tier

| Tier | Model | Avg Test Time | Pass Rate | Notes |
|------|-------|--------------|-----------|-------|
| 0 | TinyLlama | 8-12s/test | 95-98% | Fast, occasional timeouts on complex tasks |
| 1 | Llama2 | 10-15s/test | 97-99% | Balanced speed and accuracy |
| 2 | Mistral | 12-18s/test | 98-100% | High accuracy, template generation |
| 3 | DeepSeek | 15-22s/test | 99-100% | Expert-level, handles all edge cases |

---

## 🌀 Fan Management System

### Overview
**LuciferAI Adaptive Fan Terminal** provides intelligent thermal management for macOS systems. It monitors CPU, GPU, memory, SSD, and battery temperatures and dynamically adjusts fan speeds to maintain optimal thermal conditions.

### Features
- **Adaptive Control**: Real-time temperature monitoring with dynamic fan speed adjustment
- **Multi-Sensor Support**: CPU, GPU, Memory, Heat Sink, SSD, Battery
- **Trend Detection**: Identifies Rising/Cooling/Stable temperature patterns
- **Battery Safety Overrides**: Aggressive cooling when battery temps exceed thresholds
- **Comprehensive Logging**: Stores 36 hours of thermal history (2160 readings)

### Installation Requirements
- **macOS** (Intel Macs - tested and validated)
- **smc binary** from smcFanControl or standalone
- **Python 3.7+**
- **colorama** package: `pip3 install colorama`
- **sudo privileges** (required for fan control)

### Fan Commands

| Command | Action |
|---------|--------|
| `fan start` | Start adaptive fan control daemon |
| `fan stop` | Stop daemon and restore macOS auto control |
| `fan status` | Check if daemon is running (shows PID) |
| `fan logs` | View last 50 log entries |

### How It Works

#### Temperature Targets (Configurable)
Default target temperatures optimized for performance and longevity:

| Sensor | Target Temp |
|--------|-------------|
| CPU | 45°C |
| GPU | 50°C |
| Memory | 45°C |
| Heat Sink | 50°C |
| SSD | 40°C |
| Battery | 35°C |

#### Adaptive Algorithm

**1. Trend Detection** (3-second window):
- **Rising** (Δ > +0.3°C): Red indicator, increase fan speed
- **Cooling** (Δ < -0.3°C): Cyan indicator, maintain or decrease fan
- **Stable**: Normal display, gradual adjustments

**2. Target-Based Adjustment**:
```
If (max_temp > target):
    fan_speed += (delta_temp × 100 RPM)
Else if (max_temp < target - 3°C):
    fan_speed -= (delta_temp × 40 RPM)

Range: 2000 RPM (quiet) to 6200 RPM (max)
```

**3. Battery Safety Override**:
```
If (battery_temp ≥ 45°C):
    fan_speed = 6200 RPM (MAXIMUM)
Else if (battery_temp ≥ 40°C):
    fan_speed = max(fan_speed, 3500 RPM)
```

**4. Active Enforcement**:
- Compares actual fan speed vs target every cycle
- Enforces correction if deviation > 150 RPM
- Prevents macOS from overriding manual fan control

### Real-Time Display
```
👾 LuciferAI Adaptive Fan Terminal — v1.1

🌡️ CPU 42.5°C | GPU 48.2°C | MEM 40.1°C | HEAT 45.0°C | SSD 35.3°C | BAT 30.8°C
🎯 Target → CPU 45°C | GPU 50°C | MEM 45°C | HEAT 50°C | SSD 40°C | BAT 35°C
🧠 ΔTrend: +0.15°C | ΔTarget: -2.50°C | Target: 2400 RPM

🌀 Fan 0: 2401 RPM
🌀 Fan 1: 2398 RPM

💾 Logging all temps + fan data every 10 s
```

**Color Coding**:
- **Red**: Temperature rising rapidly
- **Cyan**: Temperature cooling
- **Yellow**: Temperature above target
- **Green**: Temperature optimal
- **Dim**: Temperature below target

### Logging System

**Log Location**: `~/LuciferAI/logs/fan_terminal.log`

**Log Format** (every 10 seconds):
```
[2025-10-23 10:30:00] AVG=43.2°C ΔTrend=+0.12°C ΔTarget=-1.80°C TARGET=2300 ACTUAL=2298 TEMPS={'CPU': 42.5, 'GPU': 48.2, 'MEM': 40.1, 'HEAT': 45.0, 'SSD': 35.3, 'BAT': 30.8}
```

**Historical Data**:
- Stores last 2160 readings (36 hours at 60s intervals)
- Useful for thermal analysis and performance tuning
- Can be imported into spreadsheet tools for visualization

### Example Usage
```bash
# Start LuciferAI
python3 lucifer.py

# In LuciferAI prompt
LuciferAI> fan start
🌀 Starting adaptive fan control daemon...
⚠️  This requires sudo privileges. You may be prompted for your password.

[sudo] password for user: ********

✅ Fan daemon started successfully (PID: 12345)
💡 Use "fan stop" to stop the daemon

# Check status
LuciferAI> fan status
🌀 Fan daemon is running (PID: 12345)

# View recent logs
LuciferAI> fan logs
📄 Last 50 log entries:

[2025-10-23 10:30:00] AVG=43.2°C ΔTrend=+0.12°C ΔTarget=-1.80°C TARGET=2300...
[2025-10-23 10:30:10] AVG=43.4°C ΔTrend=+0.15°C ΔTarget=-1.60°C TARGET=2350...
...

# Stop daemon
LuciferAI> fan stop
👻 Stopping fan daemon...
✅ Fan daemon stopped. Automatic fan control restored.
```

### Safety Features

#### 1. Auto-Restore on Exit
When daemon stops (Ctrl+C or crash), automatically restores macOS auto fan control:
```bash
sudo smc -k "FS! " -w 00
```

#### 2. Manual Mode Enforcement
Continuously sets fans to manual mode to prevent macOS override:
```bash
sudo smc -k "FS! " -w 01
```

#### 3. Battery Protection
Aggressive cooling when battery temps are high:
- **≥40°C**: Minimum 3500 RPM (prevents thermal damage)
- **≥45°C**: Maximum 6200 RPM (emergency cooling)

#### 4. Error Handling
Graceful degradation if sensors are unavailable:
- Averages only available sensors
- Continues operation with remaining thermal data
- Logs sensor failures for diagnostics

### Customization

Edit `TARGET_TEMPS` in the fan script to adjust target temperatures:

```python
# In LuciferAI_Fan_Terminal/lucifer_fan_terminal_adaptive_daemon_v1_1.py

TARGET_TEMPS = {
    "CPU": 45,   # Lower = more aggressive cooling
    "GPU": 50,   # Higher = quieter operation
    "MEM": 45,
    "HEAT": 50,
    "SSD": 40,
    "BAT": 35
}
```

**Tips**:
- **Lower targets**: Cooler temps, higher fan speeds (louder)
- **Higher targets**: Quieter operation, warmer temps
- **Battery target**: Keep ≤35°C for longevity

### Troubleshooting

#### "smc binary not found"
```bash
# Install smcFanControl from:
# https://github.com/hholtmann/smcFanControl

# Or download standalone smc binary and place in:
/usr/local/bin/smc
/opt/homebrew/bin/smc

# Make it executable:
chmod +x /path/to/smc
```

#### "Permission denied"
Fan control requires sudo:
```bash
# Via LuciferAI (prompts for password):
fan start

# Or run directly:
sudo python3 LuciferAI_Fan_Terminal/lucifer_fan_terminal_adaptive_daemon_v1_1.py
```

#### Fans Stuck at High Speed
Stop the daemon to restore auto control:
```bash
# Via LuciferAI:
fan stop

# Or manually:
sudo pkill -f lucifer_fan_terminal_adaptive_daemon

# Or force restore:
sudo smc -k "FS! " -w 00
```

#### No Temperature Readings
Check available sensors:
```bash
smc -l | grep Temp

# Example output:
# TC0P  [sp78]  (bytes 00 00)  # CPU
# TG0P  [sp78]  (bytes 00 00)  # GPU
# TB0T  [sp78]  (bytes 00 00)  # Battery
```

Some sensors may not be available on all Mac models. The daemon averages only available sensors.

### Performance Notes
- **CPU Usage**: <1% (background daemon)
- **Update Interval**: 3 seconds (configurable)
- **Log Interval**: 10 seconds (2160 readings = 36 hours)
- **Memory**: <20MB resident

---

## ⚙️ Llamafile Binary Assembly (Technical Detail)

### Overview
LuciferAI includes an intelligent binary assembly system that reconstructs the llamafile executable from split parts on first run. This solves GitHub's 100MB file size limit while maintaining a simple installation process.

### How It Works

#### The Problem
- **llamafile binary**: ~120-150MB (self-contained AI runtime)
- **GitHub limit**: 100MB per file
- **Solution**: Split binary into parts, reassemble on startup

#### Startup Process
When you run `python3 lucifer.py`, the system automatically:

**1. Check for Existing Binary**
```python
llamafile_path = Path('.luciferai/bin/llamafile')
if llamafile_path.exists():
    return True  # Already assembled, skip
```

**2. Detect Split Parts**
```python
project_bin = Path(__file__).parent / 'bin'
part_aa = project_bin / 'llamafile.part.aa'

if part_aa.exists():
    # Found parts - proceed with assembly
```

**3. Assemble Binary from Parts**
```python
import glob
parts = sorted(glob.glob('bin/llamafile.part.*'))

with open('llamafile', 'wb') as outfile:
    for part in parts:
        with open(part, 'rb') as infile:
            outfile.write(infile.read())  # Concatenate
```

**4. Make Executable**
```python
import os
os.chmod(llamafile_path, 0o755)  # rwxr-xr-x
```

### Split Binary Format

**Repository Structure**:
```
LuciferAI_Local/
├── bin/
│   ├── llamafile.part.aa   # 50MB (part 1)
│   ├── llamafile.part.ab   # 50MB (part 2)
│   └── llamafile.part.ac   # 30MB (part 3)
│
└── .luciferai/bin/
    └── llamafile           # 130MB (assembled at runtime)
```

**Creating Split Parts** (for developers):
```bash
# Split llamafile into 50MB chunks
split -b 50M llamafile llamafile.part.

# Results in:
# llamafile.part.aa (50MB)
# llamafile.part.ab (50MB)
# llamafile.part.ac (30MB)

# Git can now track these individually
git add bin/llamafile.part.*
```

### Advantages

**1. Git-Friendly**
- Each part is <100MB
- Can be tracked in version control
- No need for Git LFS (large file storage)

**2. Automatic Assembly**
- User runs `python3 lucifer.py`
- Binary assembles automatically
- Takes ~2-3 seconds
- One-time operation

**3. Cross-Platform**
- Works on macOS, Linux, Windows (with WSL)
- Python handles binary I/O consistently
- No external tools required (no need for `cat`, `dd`, etc.)

**4. Integrity Verification** (optional)
```python
import hashlib

# Verify assembled binary
with open('llamafile', 'rb') as f:
    file_hash = hashlib.sha256(f.read()).hexdigest()

if file_hash == EXPECTED_HASH:
    print("✅ Binary integrity verified")
```

### Performance

**Assembly Metrics**:
- **Time**: 2-3 seconds (one-time)
- **Memory**: <200MB peak (streaming reads)
- **Disk I/O**: ~130MB write
- **CPU**: Minimal (I/O bound)

### Fallback Behavior

If assembly fails or parts are missing:
```python
if not assemble_llamafile_from_parts():
    # Offer to download complete binary
    print("⚠️  Split parts not found")
    print("📥 Downloading complete llamafile binary...")
    download_llamafile(LLAMAFILE_URL, llamafile_path)
```

### Technical Details

**Why llamafile?**
- **Self-contained**: Bundles model + runtime in one file
- **Cross-platform**: Runs on macOS, Linux, Windows, BSD
- **No dependencies**: Doesn't require Python, Node, etc.
- **Fast**: Optimized C++ core with GGML backend
- **Portable**: Can be copied to any machine and run

**Binary Format**:
```
llamafile structure:
┌─────────────────────┐
│ Cosmopolitan APE    │ ← Actually Portable Executable
│ (runs on any OS)    │
├─────────────────────┤
│ llamafile runtime   │ ← Server + inference engine
├─────────────────────┤
│ GGUF model          │ ← Optional embedded model
│ (TinyLlama, etc.)   │
└─────────────────────┘

Total: ~130MB (varies by version)
```

### Alternative: External Models

You can also use llamafile with separate `.gguf` files:
```bash
# Don't embed model in binary
./llamafile -m tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

# Advantages:
# - Smaller llamafile binary (~5MB)
# - Swap models easily
# - Share models between llamafiles
```

LuciferAI supports both approaches:
- **Embedded**: Model bundled in `.llamafile` (default)
- **External**: Separate `.gguf` + `llamafile` binary

---

## Integration with Core Systems

### FixNet Consensus Integration
- **Stats Command**: Queries consensus_dictionary.py for metrics
- **Daemon Watch**: Uses relevance_dictionary.py for fix matching
- **Test Suite**: Validates NLP parser and model routing

### Thermal Analytics Integration
The fan management system can optionally integrate with LuciferAI's thermal analytics:
```bash
# Enable thermal tracking
thermal baseline

# View stats alongside fan logs
thermal stats
```

### Session Logging
All commands log to `~/.luciferai/logs/session.log`:
- Stats queries
- Daemon events
- Test runs
- Fan control actions

---

## See Also
- [NO_LLM_OPERATION.md](NO_LLM_OPERATION.md) - Zero-LLM fallback systems
- [INTELLIGENT_PARSING_SYSTEMS.md](INTELLIGENT_PARSING_SYSTEMS.md) - NLP and routing architecture
- [README.md](../README.md) - Main documentation
- [CUSTOM_MODELS.md](CUSTOM_MODELS.md) - Model installation and configuration

---

**System:** LuciferAI Local  
**Version:** 2.1  
**Last Updated:** 2025-01-23  
**Author:** TheRustySpoon  
**License:** MIT

Made with 🩸 by TheRustySpoon
