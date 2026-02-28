#!/usr/bin/env python3
"""
🌡️ LuciferAI Thermal Analytics - Heat Dispersion Tracking & Analysis
Monitors thermal performance and calculates cooling efficiency metrics
"""
import os
import json
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from collections import deque

from lucifer_colors import c, Colors, Emojis


class ThermalAnalytics:
    """
    Tracks and analyzes thermal performance with heat dispersion metrics.
    Only tracks when user ID is linked and validated.
    """
    
    def __init__(self, user_id: str, validated: bool = False):
        self.user_id = user_id
        self.validated = validated
        
        self.lucifer_home = Path.home() / ".luciferai"
        self.thermal_data_dir = self.lucifer_home / "thermal"
        self.thermal_data_dir.mkdir(parents=True, exist_ok=True)
        
        self.thermal_log = self.thermal_data_dir / f"{user_id}_thermal.json"
        self.session_data = []
        self.baseline_temps = None
        
        # Thermal history (last 100 readings)
        self.temp_history = deque(maxlen=100)
        
        # SMC path
        self.smc_path = self._find_smc()
    
    def _find_smc(self) -> Optional[str]:
        """Find smc binary."""
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
    
    def is_tracking_enabled(self) -> bool:
        """Check if thermal tracking is enabled (requires validation)."""
        return self.validated and self.smc_path is not None
    
    def get_current_temps(self) -> Optional[Dict[str, float]]:
        """Get current temperature readings from SMC."""
        if not self.smc_path:
            return None
        
        try:
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
                vals = []
                for key in keys:
                    try:
                        out = subprocess.check_output(
                            [self.smc_path, "-k", key, "-r"],
                            stderr=subprocess.DEVNULL
                        ).decode().strip()
                        
                        for token in out.split():
                            try:
                                val = float(token)
                                if 0 < val < 150:
                                    vals.append(val)
                                    break
                            except ValueError:
                                continue
                    except:
                        continue
                
                if vals:
                    readings[name] = sum(vals) / len(vals)
            
            return readings if readings else None
        
        except Exception:
            return None
    
    def get_fan_speed(self) -> Optional[float]:
        """Get current fan speed."""
        if not self.smc_path:
            return None
        
        try:
            out = subprocess.check_output(
                [self.smc_path, "-k", "F0Ac", "-r"],
                stderr=subprocess.DEVNULL
            ).decode()
            
            for token in out.split():
                try:
                    val = float(token)
                    if val > 0:
                        return val
                except:
                    continue
            return None
        except:
            return None
    
    def set_baseline(self):
        """Set baseline temperatures for comparison."""
        temps = self.get_current_temps()
        if temps:
            self.baseline_temps = temps
            print(c(f"{Emojis.THERMOMETER} Baseline temperatures recorded", "green"))
            for sensor, temp in temps.items():
                print(c(f"   {sensor}: {temp:.1f}°C", "blue"))
    
    def record_reading(self, context: str = "general"):
        """Record a thermal reading."""
        if not self.is_tracking_enabled():
            return
        
        temps = self.get_current_temps()
        fan_speed = self.get_fan_speed()
        
        if not temps:
            return
        
        reading = {
            "timestamp": datetime.now().isoformat(),
            "context": context,
            "temperatures": temps,
            "fan_speed": fan_speed,
            "average_temp": sum(temps.values()) / len(temps),
            "max_temp": max(temps.values()),
            "hottest_sensor": max(temps, key=temps.get)
        }
        
        # Calculate dispersion if we have baseline
        if self.baseline_temps:
            dispersion = self._calculate_dispersion(temps)
            reading["dispersion_metrics"] = dispersion
        
        self.session_data.append(reading)
        self.temp_history.append(reading)
    
    def _calculate_dispersion(self, current_temps: Dict[str, float]) -> Dict:
        """Calculate heat dispersion metrics."""
        if not self.baseline_temps:
            return {}
        
        # Calculate per-sensor delta
        deltas = {}
        for sensor in current_temps:
            if sensor in self.baseline_temps:
                deltas[sensor] = self.baseline_temps[sensor] - current_temps[sensor]
        
        # Overall metrics
        avg_baseline = sum(self.baseline_temps.values()) / len(self.baseline_temps)
        avg_current = sum(current_temps.values()) / len(current_temps)
        avg_dispersion = avg_baseline - avg_current
        
        # Dispersion percentage (higher is better)
        # Positive = cooler than baseline, negative = hotter
        dispersion_pct = (avg_dispersion / avg_baseline) * 100 if avg_baseline > 0 else 0
        
        # Efficiency rating
        if dispersion_pct > 10:
            efficiency = "Excellent"
        elif dispersion_pct > 5:
            efficiency = "Good"
        elif dispersion_pct > 0:
            efficiency = "Moderate"
        elif dispersion_pct > -5:
            efficiency = "Poor"
        else:
            efficiency = "Critical"
        
        return {
            "per_sensor_delta": deltas,
            "average_baseline": avg_baseline,
            "average_current": avg_current,
            "average_dispersion_c": avg_dispersion,
            "dispersion_percentage": dispersion_pct,
            "efficiency_rating": efficiency
        }
    
    def get_dispersion_stats(self) -> Optional[Dict]:
        """Get current heat dispersion statistics."""
        if not self.baseline_temps or not self.session_data:
            return None
        
        latest = self.session_data[-1]
        
        if "dispersion_metrics" not in latest:
            return None
        
        metrics = latest["dispersion_metrics"]
        
        return {
            "baseline_avg": metrics["average_baseline"],
            "current_avg": metrics["average_current"],
            "dispersion_c": metrics["average_dispersion_c"],
            "dispersion_pct": metrics["dispersion_percentage"],
            "efficiency": metrics["efficiency_rating"],
            "per_sensor": metrics["per_sensor_delta"],
            "fan_speed": latest.get("fan_speed", "N/A"),
            "hottest_sensor": latest.get("hottest_sensor", "Unknown")
        }
    
    def print_thermal_status(self):
        """Print current thermal status."""
        if not self.is_tracking_enabled():
            print(c(f"{Emojis.WARNING} Thermal tracking disabled", "yellow"))
            print(c("  Reason: ID not validated or SMC not available", "dim"))
            return
        
        temps = self.get_current_temps()
        fan_speed = self.get_fan_speed()
        
        if not temps:
            print(c(f"{Emojis.CROSS} Unable to read temperatures", "red"))
            return
        
        print(c(f"\n{Emojis.THERMOMETER} Current Thermal Status", "cyan"))
        print(c("─" * 50, "dim"))
        
        for sensor, temp in temps.items():
            color = "green" if temp < 50 else "yellow" if temp < 70 else "red"
            print(c(f"  {sensor:6s} {temp:5.1f}°C", color))
        
        avg_temp = sum(temps.values()) / len(temps)
        print(c(f"\n  Average: {avg_temp:.1f}°C", "blue"))
        
        if fan_speed:
            print(c(f"  Fan Speed: {fan_speed:.0f} RPM", "purple"))
        
        # Show dispersion if available
        if self.baseline_temps:
            stats = self.get_dispersion_stats()
            if stats:
                print(c(f"\n{Emojis.SPARKLE} Heat Dispersion Analysis", "cyan"))
                print(c("─" * 50, "dim"))
                print(c(f"  Baseline:   {stats['baseline_avg']:.1f}°C", "blue"))
                print(c(f"  Current:    {stats['current_avg']:.1f}°C", "blue"))
                
                disp_color = "green" if stats['dispersion_c'] > 0 else "red"
                print(c(f"  Dispersion: {stats['dispersion_c']:+.1f}°C ({stats['dispersion_pct']:+.1f}%)", disp_color))
                
                eff_color = "green" if stats['efficiency'] in ["Excellent", "Good"] else "yellow" if stats['efficiency'] == "Moderate" else "red"
                print(c(f"  Efficiency: {stats['efficiency']}", eff_color))
                print(c(f"  Hottest:    {stats['hottest_sensor']}", "yellow"))
    
    def save_session(self):
        """Save session data to disk."""
        if not self.session_data:
            return
        
        # Load existing data
        existing = []
        if self.thermal_log.exists():
            try:
                with open(self.thermal_log, 'r') as f:
                    existing = json.load(f)
            except:
                existing = []
        
        # Append new data
        existing.extend(self.session_data)
        
        # Keep last 1000 readings
        if len(existing) > 1000:
            existing = existing[-1000:]
        
        # Save
        with open(self.thermal_log, 'w') as f:
            json.dump(existing, f, indent=2)
        
        print(c(f"{Emojis.CHECKMARK} Thermal session saved ({len(self.session_data)} readings)", "green"))
    
    def get_session_summary(self) -> Optional[Dict]:
        """Get summary of current session."""
        if not self.session_data:
            return None
        
        temps_over_time = [r["average_temp"] for r in self.session_data]
        
        summary = {
            "readings_count": len(self.session_data),
            "avg_temp": sum(temps_over_time) / len(temps_over_time),
            "min_temp": min(temps_over_time),
            "max_temp": max(temps_over_time),
            "temp_variance": max(temps_over_time) - min(temps_over_time)
        }
        
        # Calculate average dispersion if available
        dispersions = [r.get("dispersion_metrics", {}).get("dispersion_percentage", 0) 
                      for r in self.session_data 
                      if "dispersion_metrics" in r]
        
        if dispersions:
            summary["avg_dispersion_pct"] = sum(dispersions) / len(dispersions)
            summary["best_dispersion_pct"] = max(dispersions)
            summary["worst_dispersion_pct"] = min(dispersions)
        
        return summary


def print_thermal_banner(validated: bool, user_id: str):
    """Print thermal tracking status banner."""
    print(c("\n╔═══════════════════════════════════════════════════════════╗", "purple"))
    print(c("║  🌡️  Thermal Analytics & Heat Dispersion Tracking         ║", "purple"))
    print(c("╚═══════════════════════════════════════════════════════════╝", "purple"))
    
    if validated:
        print(c(f"\n✅ Thermal tracking ENABLED for user: {user_id[:12]}...", "green"))
        print(c("   Heat dispersion metrics will be automatically tracked", "blue"))
        print(c("   and saved throughout this session.\n", "blue"))
    else:
        print(c(f"\n⚠️  Thermal tracking DISABLED", "yellow"))
        print(c("   Reason: User ID not validated in consensus", "dim"))
        print(c("   Link your GitHub account and validate to enable tracking.\n", "dim"))
