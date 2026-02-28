#!/usr/bin/env python3
import os, sys, subprocess, time, datetime
from collections import deque
from colorama import Fore, Style, init

init(autoreset=True)

LOG_DIR = os.path.expanduser("~/LuciferAI/logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "fan_terminal.log")

MAX_HISTORY = 2160

TARGET_TEMPS = {
    "CPU": 45, "GPU": 50, "MEM": 45, "HEAT": 50, "SSD": 40, "BAT": 35
}

def log(msg):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def ensure_root_privileges():
    if os.geteuid() != 0:
        print(Fore.YELLOW + "⚠️  Re-launching with sudo privileges..." + Style.RESET_ALL)
        os.execvp("sudo", ["sudo", "python3"] + sys.argv)

def find_smc():
    paths = [
        "/Applications/smcFanControl.app/Contents/Resources/smc",
        "/usr/local/bin/smc",
        "/opt/homebrew/bin/smc",
        "/usr/bin/smc"
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return None

def read_smc_temp(smc_path, key):
    try:
        out = subprocess.check_output([smc_path, "-k", key, "-r"]).decode().strip()
        for token in out.split():
            try:
                val = float(token)
                if 0 < val < 150:
                    return val
            except ValueError:
                continue
    except Exception:
        pass
    return None

def get_all_temps(smc_path):
    sensors = {
        "CPU": ["TC0P", "TC1P"],
        "GPU": ["TG0P", "TG1P"],
        "MEM": ["TM0P"],
        "HEAT": ["TH0P"],
        "SSD": ["Ts0P"],
        "BAT": ["TB0T", "TB1T"]
    }
    readings = {}
    for name, keys in sensors.items():
        vals = [read_smc_temp(smc_path, k) for k in keys]
        vals = [v for v in vals if v is not None]
        if vals:
            readings[name] = sum(vals)/len(vals)
    return readings

def get_fan_data(smc_path):
    try:
        out = subprocess.check_output([smc_path, "-f"]).decode().strip().splitlines()
        return [line for line in out if line.strip()]
    except Exception as e:
        return [f"Fan read error: {e}"]

def get_current_fan_speed(smc_path):
    try:
        out = subprocess.check_output([smc_path, "-k", "F0Ac", "-r"]).decode()
        for token in out.split():
            try:
                val = float(token)
                if val > 0:
                    return val
            except:
                continue
    except:
        pass
    return 0

def force_manual_mode(smc_path):
    try:
        subprocess.call([smc_path, "-k", "FS! ", "-w", "01"])
    except Exception:
        pass

def restore_auto_mode(smc_path):
    try:
        subprocess.call([smc_path, "-k", "FS! ", "-w", "00"])
        log("🔚 Restored automatic fan control.")
    except Exception:
        log("⚠️ Could not restore auto mode.")

def set_fan_speed(smc_path, rpm):
    try:
        force_manual_mode(smc_path)
        subprocess.call([smc_path, "-k", "F0Tg", "-w", f"{int(rpm):04X}"])
        subprocess.call([smc_path, "-k", "F1Tg", "-w", f"{int(rpm):04X}"])
    except Exception as e:
        log(f"⚠️ Could not set fan speed: {e}")

def adaptive_fan_control(smc_path):
    # Clear logs at startup
    if os.path.exists(LOG_FILE):
        open(LOG_FILE, "w").close()
        log("🧹 Cleared previous logs — new session started.")
    log(f"[Startup] Python {sys.version.split()[0]} | smcFanControl path: {smc_path}")

    target_rpm = 2000
    last_temps, trend_dir = [], "Stable"
    history = deque(maxlen=MAX_HISTORY)
    last_log = time.time()

    while True:
        color = Fore.WHITE
        delta = 0.0

        readings = get_all_temps(smc_path)
        valid_temps = [v for v in readings.values() if v is not None]
        if not valid_temps:
            print("❌ No sensors readable.")
            time.sleep(1)
            continue

        avg_temp = sum(valid_temps)/len(valid_temps)
        max_temp = max(valid_temps)
        hottest_sensor = max(readings, key=readings.get)
        history.append((avg_temp, target_rpm))

        # Trend calculation
        last_temps.append(avg_temp)
        if len(last_temps) > 3:
            delta = last_temps[-1] - last_temps[-3]
            if delta > 0.3:
                color, trend_dir = Fore.RED, "Rising"
            elif delta < -0.3:
                color, trend_dir = Fore.CYAN, "Cooling"
            else:
                trend_dir = "Stable"
            last_temps = last_temps[-3:]

        # Target temperature logic
        target_temp = TARGET_TEMPS.get(hottest_sensor, 50)
        delta_target = max_temp - target_temp
        base_rpm = target_rpm
        if delta_target > 0:
            target_rpm = min(6200, target_rpm + int(delta_target * 100))
        elif delta_target < -3:
            target_rpm = max(2000, target_rpm + int(delta_target * 40))

        # Battery safety override
        if "BAT" in readings and readings["BAT"] >= 40:
            target_rpm = max(target_rpm, 3500)
        if "BAT" in readings and readings["BAT"] >= 45:
            target_rpm = 6200

        # Active enforcement: compare actual and target RPM
        actual_rpm = get_current_fan_speed(smc_path)
        if actual_rpm < target_rpm - 150:
            log(f"⚙️ Enforcing fan speed → Actual {actual_rpm:.0f} < Target {target_rpm} → Increasing...")
            set_fan_speed(smc_path, target_rpm)
        elif actual_rpm > target_rpm + 200:
            log(f"🧊 Cooling sufficient → Actual {actual_rpm:.0f} > Target {target_rpm} → Lowering...")
            set_fan_speed(smc_path, max(2000, target_rpm - 300))

        os.system("clear")
        print(f"{Fore.MAGENTA}👾 LuciferAI Adaptive Fan Terminal — v1.1{Style.RESET_ALL}\n")
        print("🌡️ " + " | ".join([f"{k} {v:.1f}°C" for k, v in readings.items()]))
        print("🎯 Target → " + " | ".join([f"{k} {v}°C" for k, v in TARGET_TEMPS.items()]))
        print(f"{color}🧠 ΔTrend: {delta:+.2f}°C | ΔTarget: {delta_target:+.2f}°C | Target: {target_rpm} RPM{Style.RESET_ALL}\n")
        fan_data = get_fan_data(smc_path)
        for line in fan_data:
            print(f"🌀 {line}")
        print(f"\n💾 Logging all temps + fan data every 10 s")

        now = time.time()
        if now - last_log >= 10:
            log(f"AVG={avg_temp:.1f}°C ΔTrend={delta:+.2f}°C ΔTarget={delta_target:+.2f}°C TARGET={target_rpm} ACTUAL={actual_rpm} TEMPS={readings}")
            last_log = now

        time.sleep(1)

def main():
    ensure_root_privileges()
    smc_path = find_smc()
    if not smc_path:
        log("❌ smc binary not found.")
        sys.exit(1)
    try:
        adaptive_fan_control(smc_path)
    except KeyboardInterrupt:
        restore_auto_mode(smc_path)
        print("\n🔚 Exiting — restoring automatic fan control…")
    except Exception as e:
        restore_auto_mode(smc_path)
        log(f"💀 Fatal error: {e}")

if __name__ == "__main__":
    main()
