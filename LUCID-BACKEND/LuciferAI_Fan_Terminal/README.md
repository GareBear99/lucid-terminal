# 🌀 LuciferAI Adaptive Fan Terminal

**Intelligent thermal management daemon for macOS** - Adaptive fan control with real-time temperature monitoring.

## Overview

This module provides adaptive fan control for Mac systems using SMC (System Management Controller). It monitors CPU, GPU, memory, SSD, and battery temperatures and dynamically adjusts fan speeds to maintain optimal thermal conditions.

## Features

✅ **Adaptive Control**
- Real-time temperature monitoring across multiple sensors
- Dynamic fan speed adjustment based on thermal load
- Intelligent trend detection (Rising/Cooling/Stable)
- Battery safety overrides (aggressive cooling at high temps)

✅ **Multi-Sensor Support**
- CPU (TC0P, TC1P)
- GPU (TG0P, TG1P)
- Memory (TM0P)
- Heat Sink (TH0P)
- SSD (Ts0P)
- Battery (TB0T, TB1T)

✅ **Logging & Monitoring**
- Comprehensive logging to `~/LuciferAI/logs/fan_terminal.log`
- Real-time terminal display with color-coded status
- 10-second interval logging for historical analysis
- Stores last 2160 readings (36 hours at 60s intervals)

## Installation

The module is already installed in your LuciferAI project at:
```
LuciferAI_Local/LuciferAI_Fan_Terminal/
```

### Requirements

- **macOS** (tested on Intel Macs)
- **smc binary** (from smcFanControl or standalone)
- **Python 3.7+**
- **colorama** package: `pip3 install colorama`
- **sudo privileges** (required for fan control)

### SMC Binary Locations

The daemon searches for `smc` in these locations:
1. `/Applications/smcFanControl.app/Contents/Resources/smc`
2. `/usr/local/bin/smc`
3. `/opt/homebrew/bin/smc`
4. `/usr/bin/smc`

If not found, install smcFanControl from: https://github.com/hholtmann/smcFanControl

## Usage

### Via LuciferAI Commands

The easiest way to use the fan control is through LuciferAI:

```bash
# Start LuciferAI
python3 lucifer.py

# In LuciferAI prompt:
LuciferAI> fan start    # Start adaptive fan control
LuciferAI> fan status   # Check if daemon is running
LuciferAI> fan logs     # View recent logs
LuciferAI> fan stop     # Stop daemon & restore auto mode
```

### Direct Execution

You can also run the daemon directly:

```bash
# Run in foreground (requires sudo)
sudo python3 LuciferAI_Fan_Terminal/lucifer_fan_terminal_adaptive_daemon_v1_1.py

# Stop with Ctrl+C (automatically restores auto fan control)
```

## How It Works

### Temperature Targets

Default target temperatures (configurable in script):

| Sensor | Target Temp |
|--------|-------------|
| CPU    | 45°C        |
| GPU    | 50°C        |
| Memory | 45°C        |
| Heat   | 50°C        |
| SSD    | 40°C        |
| Battery| 35°C        |

### Adaptive Algorithm

1. **Trend Detection**: Monitors temperature changes over 3-second window
   - Rising (Δ > +0.3°C) → Red indicator
   - Cooling (Δ < -0.3°C) → Cyan indicator
   - Stable → Normal display

2. **Target-Based Adjustment**: 
   - If max temp > target: Increase fan speed (ΔT × 100 RPM)
   - If max temp < target - 3°C: Decrease fan speed (ΔT × 40 RPM)
   - Range: 2000 RPM (quiet) to 6200 RPM (max)

3. **Battery Safety Override**:
   - Battery ≥ 40°C → Minimum 3500 RPM
   - Battery ≥ 45°C → Maximum 6200 RPM

4. **Active Enforcement**:
   - Compares actual fan speed vs target
   - Enforces correction if deviation > 150 RPM

### Display

```
👾 LuciferAI Adaptive Fan Terminal — v1.1

🌡️ CPU 42.5°C | GPU 48.2°C | MEM 40.1°C | HEAT 45.0°C | SSD 35.3°C | BAT 30.8°C
🎯 Target → CPU 45°C | GPU 50°C | MEM 45°C | HEAT 50°C | SSD 40°C | BAT 35°C
🧠 ΔTrend: +0.15°C | ΔTarget: -2.50°C | Target: 2400 RPM

🌀 Fan 0: 2401 RPM
🌀 Fan 1: 2398 RPM

💾 Logging all temps + fan data every 10 s
```

## Logging

Logs are stored at: `~/LuciferAI/logs/fan_terminal.log`

Log format:
```
[2025-10-23 10:30:00] AVG=43.2°C ΔTrend=+0.12°C ΔTarget=-1.80°C TARGET=2300 ACTUAL=2298 TEMPS={'CPU': 42.5, 'GPU': 48.2, ...}
```

View logs:
```bash
# Via LuciferAI
fan logs

# Or directly
tail -f ~/LuciferAI/logs/fan_terminal.log
```

## Safety Features

- **Auto-restore**: On exit (Ctrl+C or crash), automatically restores automatic fan control
- **Manual mode enforcement**: Prevents macOS from overriding fan settings
- **Battery protection**: Aggressive cooling when battery temps are high
- **Error handling**: Graceful degradation if sensors are unavailable

## Customization

Edit `TARGET_TEMPS` in the script to adjust target temperatures:

```python
TARGET_TEMPS = {
    "CPU": 45,   # Lower = more aggressive cooling
    "GPU": 50,
    "MEM": 45,
    "HEAT": 50,
    "SSD": 40,
    "BAT": 35
}
```

## Troubleshooting

### "smc binary not found"
- Install smcFanControl or download standalone smc binary
- Place in one of the searched locations
- Ensure it's executable: `chmod +x /path/to/smc`

### "Permission denied"
- Fan control requires sudo privileges
- Run with: `sudo python3 lucifer_fan_terminal_adaptive_daemon_v1_1.py`
- Or use LuciferAI's `fan start` (prompts for password)

### Fans stuck at high speed
- Stop the daemon: `fan stop` or kill the process
- This automatically restores macOS auto control
- Or manually: `sudo smc -k "FS! " -w 00`

### No temperature readings
- Some sensors may not be available on all Mac models
- Script averages available sensors only
- Check with: `smc -l | grep Temp`

## Version History

**v1.1** (Current)
- Added adaptive thermal management
- Multi-sensor support (CPU/GPU/MEM/HEAT/SSD/BAT)
- Trend detection
- Battery safety overrides
- Active enforcement
- 10-second logging interval
- 2160-reading history buffer

**v1.0**
- Initial release with basic fan control

## Credits

**System:** LuciferAI Adaptive Fan Terminal  
**Version:** 1.1  
**Author:** TheRustySpoon  
**License:** MIT

Part of the LuciferAI Local project.

---

Made with 🩸 by TheRustySpoon
