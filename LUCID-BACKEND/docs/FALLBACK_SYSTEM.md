# 🩸 LuciferAI Fallback System

## Overview

The **LuciferAI Fallback System** is a comprehensive 5-tier self-healing environment adapter that ensures LuciferAI can run even in hostile, broken, or incomplete system environments.

The system automatically detects environment failures and progressively falls back through multiple recovery tiers until a working state is achieved.

---

## Architecture

### 5-Tier Fallback Cascade

```
┌─────────────────────────────────────────────────────────┐
│  Tier 0: Native Mode (🟢)                               │
│  All dependencies satisfied - optimal performance       │
└─────────────────────────────────────────────────────────┘
                        ↓ (Missing dependencies)
┌─────────────────────────────────────────────────────────┐
│  Tier 1: Virtual Environment Fallback (🩹 Cyan)         │
│  Create/activate Python venv, install missing packages  │
└─────────────────────────────────────────────────────────┘
                        ↓ (Venv creation fails)
┌─────────────────────────────────────────────────────────┐
│  Tier 2: Mirror Binary Fallback (🔄 Yellow)             │
│  Download from mirrors, try multiple package managers   │
└─────────────────────────────────────────────────────────┘
                        ↓ (All package managers fail)
┌─────────────────────────────────────────────────────────┐
│  Tier 3: Stub Layer (🧩 Purple)                         │
│  Create mock/shim modules to prevent import crashes     │
└─────────────────────────────────────────────────────────┘
                        ↓ (Catastrophic failure)
┌─────────────────────────────────────────────────────────┐
│  Tier 4: Emergency CLI Mode (☠️ Red)                    │
│  Minimal text-only interface with core commands         │
└─────────────────────────────────────────────────────────┘
                        ↓ (Fallback streak >= 3)
┌─────────────────────────────────────────────────────────┐
│  Recovery: Automated System Repair (💫 Green)           │
│  Rebuild environment, purge broken links, restore state │
└─────────────────────────────────────────────────────────┘
```

---

## Tier Details

### **Tier 0: Native Mode** 🟢

**Status:** Optimal

**Description:**  
All dependencies are satisfied. LuciferAI runs with full functionality.

**Features:**
- Full GUI and CLI access
- All integrations active (GitHub, WiFi, etc.)
- Maximum performance
- No degradation

**Indicator:** No warning messages

---

### **Tier 1: Virtual Environment Fallback** 🩹

**Status:** Minor degradation

**Color:** Cyan

**Trigger:**  
Missing Python packages (e.g., `colorama`, `requests`, `psutil`)

**Actions:**
1. Create virtual environment at `~/.luciferai/envs/lucifer_env`
2. Activate the virtual environment
3. Install missing packages from `requirements.txt`
4. Fallback to critical package list if no requirements file

**Features:**
- Isolated Python environment
- Package installation without system pollution
- Offline wheel support (future)

**Visual Indicator:**
```
🩹 Tier 1: Virtual Environment Fallback
Rebuilding virtual environment...
```

---

### **Tier 2: Mirror Binary Fallback** 🔄

**Status:** Moderate degradation

**Color:** Yellow

**Trigger:**  
Virtual environment creation failed, or system tools missing (e.g., `git`, `curl`)

**Actions:**
1. Try multiple package managers in priority order:
   - **macOS:** `brew`, `port`
   - **Linux:** `apt`, `yum`, `dnf`, `pacman`
   - **Windows:** `choco`, `winget`
   - **Universal:** `pip3`, `pip`, `conda`, `npm`
2. Download precompiled binaries from trusted mirrors
3. Verify SHA256 hashes for security
4. Mount temporary binaries to `/tmp/lucifer_fallback_bin`
5. Patch system PATH

**Features:**
- Multi-source download support
- Cryptographic verification (SHA256)
- Automatic package manager selection
- Mirror repository fallback

**Visual Indicator:**
```
🔄 Tier 2: Mirror Binary Fallback
Fetching git from mirror...
```

---

### **Tier 3: Stub Layer** 🧩

**Status:** Significant degradation

**Color:** Purple

**Trigger:**  
All package managers failed, critical modules still missing

**Actions:**
1. Create Python stub modules for missing APIs
2. Stub modules provide no-op implementations to prevent import crashes
3. Log all stub method calls for debugging

**Features:**
- Prevents `ImportError` crashes
- Graceful degradation of functionality
- Debug logging of stub usage
- Allows core functionality to continue

**Stub Example:**
```python
class ColoramaStub:
    def __init__(self):
        print("[STUB] colorama fallback active")
    
    def __getattr__(self, name):
        def stub_method(*args, **kwargs):
            print(f"[STUB] colorama.{name}() called")
            return None
        return stub_method
```

**Visual Indicator:**
```
🧩 Tier 3: Stub Layer
Creating stub for colorama...
```

---

### **Tier 4: Emergency CLI Mode** ☠️

**Status:** Critical

**Color:** Red

**Trigger:**  
Catastrophic environment failure

**Actions:**
1. Disable all non-essential features
2. Disable daemons and background services
3. Enable minimal text-only CLI
4. Save emergency state to logs

**Features:**
- Core commands only: `fix`, `analyze`, `status`, `logs`, `help`, `exit`
- No GUI, no integrations
- Minimal resource usage
- Survival mode operation

**Available Commands:**
```
fix      - Attempt automated system repair
analyze  - Analyze environment failures
status   - Show system status
logs     - View emergency logs
help     - Show help
exit     - Exit emergency mode
```

**Visual Indicator:**
```
╔═══════════════════════════════════════════╗
║  ☠️  LUCIFERAI EMERGENCY MODE  ☠️         ║
╚═══════════════════════════════════════════╝
```

---

### **Recovery: Automated System Repair** 💫

**Status:** Recovery in progress

**Color:** Green

**Trigger:**  
Fallback streak >= 3 (three consecutive fallback activations)

**Actions:**
1. **Phase 1:** Rebuild virtual environment from scratch
2. **Phase 2:** Reinstall missing system tools (`git`, `curl`, `wget`)
3. **Phase 3:** Purge broken symbolic links and temp files
4. **Phase 4:** Verify system integrity and PATH

**Features:**
- Fully automated recovery
- No user intervention required
- Progressive repair steps
- Verification and rollback

**Visual Indicator:**
```
💫 System Repair Initiated
Attempting automated recovery...

[1/4] Rebuilding virtual environment...
[2/4] Checking system tools...
[3/4] Purging broken symbolic links...
[4/4] Verifying system integrity...

💫 System Restored Successfully
```

---

## Usage

### **Automatic Integration**

The fallback system is automatically activated during LuciferAI startup:

```python
# In your main entry point
from core.startup import boot_luciferai

if __name__ == "__main__":
    tier = boot_luciferai()
    
    if tier < 4:
        # Continue to main application
        main()
```

### **Manual Fallback Testing**

Run the comprehensive test suite:

```bash
python Demo/test_fallback.py
```

### **Manual Emergency Mode**

Enter emergency CLI directly:

```bash
python core/emergency_cli.py
```

### **Check System Status**

```python
from core.fallback_system import get_fallback_system

system = get_fallback_system()
env = system.check_system_env()

print(f"Current Tier: {system.current_tier}")
print(f"Fallback Streak: {system.fallback_streak}")
```

---

## Fallback Streak Counter

The system tracks consecutive fallback activations:

- **Streak 0-2:** Normal fallback operation
- **Streak 3+:** Auto-repair triggered automatically

**Example:**
```
First fallback  → Tier 1 (Streak = 1)
Second fallback → Tier 2 (Streak = 2)
Third fallback  → Tier 3 (Streak = 3) → 💫 Auto-repair triggered!
```

---

## Logging

All fallback activity is logged to:

| Log File | Purpose |
|----------|---------|
| `~/.luciferai/logs/system_check.log` | Environment audit results (JSON) |
| `~/.luciferai/logs/fallback_trace.log` | Detailed fallback activity trace |
| `~/.luciferai/logs/system_repair.log` | System repair operations |
| `~/.luciferai/logs/emergency/state.json` | Emergency mode state |

---

## Security Features

### **SHA256 Verification**

All downloaded binaries from mirrors are verified:

```python
system.verify_fallback_integrity(
    file_path=Path("/tmp/lucifer_fallback_bin/git"),
    expected_hash="abc123def456..."
)
```

### **Non-Elevated Emergency Mode**

Emergency mode runs without admin privileges to prevent security risks.

### **Trusted Mirror Sources**

Only verified mirror repositories are used:
- GitHub releases: `https://github.com/GareBear99/LuciferAI_Mirror/releases`

---

## OS-Specific Behavior

### **macOS**

- Virtual env: `~/.luciferai/envs/lucifer_env`
- Package manager priority: `brew`, `port`, `pip3`, `conda`
- Fallback bin: `/tmp/lucifer_fallback_bin`

### **Linux**

- Virtual env: `~/.luciferai/envs/lucifer_env`
- Package manager priority: `apt`, `yum`, `dnf`, `pacman`, `pip3`
- Fallback bin: `/tmp/lucifer_fallback_bin`

### **Windows**

- Virtual env: `%USERPROFILE%\.luciferai\envs\lucifer_env`
- Package manager priority: `choco`, `winget`, `pip`, `conda`
- Fallback bin: `%TEMP%\lucifer_fallback_bin`

### **Raspberry Pi**

- Optimized for resource constraints
- Prefers lightweight packages
- Extended timeouts for slow systems

---

## Files

| File | Description |
|------|-------------|
| `core/fallback_system.py` | Main fallback system implementation |
| `core/emergency_cli.py` | Emergency CLI mode |
| `core/startup.py` | Boot sequence with fallback integration |
| `Demo/test_fallback.py` | Comprehensive test suite |

---

## API Reference

### `FallbackSystem`

```python
class FallbackSystem:
    def __init__(self):
        """Initialize fallback system."""
    
    def check_system_env(self) -> Dict[str, any]:
        """Audit environment and return status."""
    
    def fallback_virtual_env(self) -> bool:
        """Tier 1: Create/activate virtual environment."""
    
    def fallback_mirror_download(self, tool: str) -> bool:
        """Tier 2: Download tool from mirrors."""
    
    def fallback_stub_module(self, module_name: str):
        """Tier 3: Create stub module."""
    
    def fallback_emergency_cli(self) -> bool:
        """Tier 4: Enter emergency CLI mode."""
    
    def system_repair(self) -> bool:
        """Recovery: Automated system repair."""
    
    def verify_fallback_integrity(self, file_path: Path, expected_hash: str) -> bool:
        """Verify SHA256 hash of file."""
    
    def should_auto_repair(self) -> bool:
        """Check if auto-repair should trigger."""
```

### Global Functions

```python
def get_fallback_system() -> FallbackSystem:
    """Get global fallback system instance."""
```

---

## Troubleshooting

### Issue: "Virtual environment creation failed"

**Solution:**  
The system will automatically fall back to Tier 2 (Mirror Download).

### Issue: "All package managers failed"

**Solution:**  
The system will create stub modules (Tier 3) to prevent crashes.

### Issue: "Emergency mode activated"

**Solution:**  
Run `fix` command in emergency CLI to trigger system repair.

### Issue: "Auto-repair keeps triggering"

**Cause:**  
Persistent environment issues.

**Solution:**  
1. Check logs: `~/.luciferai/logs/fallback_trace.log`
2. Manually install missing dependencies
3. Verify PATH integrity

---

## Future Enhancements

- [ ] Offline wheel packages for air-gapped systems
- [ ] Docker container fallback
- [ ] Cloud-based repair service
- [ ] Predictive failure detection
- [ ] Performance impact monitoring

---

## Credits

**Design:** GareBear99  
**System:** LuciferAI
**Version:** 1.0  

**Inspired by:** Military-grade fault tolerance systems
