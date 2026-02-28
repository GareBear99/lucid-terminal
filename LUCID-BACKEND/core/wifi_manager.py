#!/usr/bin/env python3
"""
🩸 LuciferAI WiFi Manager
Cross-platform WiFi management for all OS:
- macOS (all versions)
- Windows (7, 8, 10, 11)
- Linux (NetworkManager, wpa_supplicant)
- Raspberry Pi
"""
import os
import sys
import subprocess
import platform
import re
from pathlib import Path
from typing import List, Dict, Optional

# Colors
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
CYAN = '\033[36m'
DIM = '\033[2m'
RESET = '\033[0m'


class WiFiManager:
    """Cross-platform WiFi management."""
    
    def __init__(self):
        self.os_type = platform.system().lower()
        self.is_macos = self.os_type == 'darwin'
        self.is_linux = self.os_type == 'linux'
        self.is_windows = self.os_type == 'windows'
        self.is_raspberry_pi = self._is_raspberry_pi()
        
        # Detect WiFi interface
        self.interface = self._detect_interface()
    
    def _is_raspberry_pi(self) -> bool:
        """Check if running on Raspberry Pi."""
        if not self.is_linux:
            return False
        
        try:
            if Path("/proc/device-tree/model").exists():
                with open("/proc/device-tree/model", "r") as f:
                    return "raspberry pi" in f.read().lower()
        except:
            pass
        return False
    
    def _detect_interface(self) -> Optional[str]:
        """Detect WiFi interface name."""
        if self.is_macos:
            # macOS uses 'en0' or 'en1' typically
            try:
                result = subprocess.run(
                    ['networksetup', '-listallhardwareports'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                lines = result.stdout.split('\n')
                for i, line in enumerate(lines):
                    if 'Wi-Fi' in line or 'AirPort' in line:
                        # Next line should have Device: enX
                        if i + 1 < len(lines):
                            device_line = lines[i + 1]
                            if 'Device:' in device_line:
                                return device_line.split(':')[1].strip()
            except:
                pass
            return 'en0'  # Default
        
        elif self.is_linux:
            # Linux uses wlan0, wlp2s0, etc.
            try:
                result = subprocess.run(
                    ['iw', 'dev'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                for line in result.stdout.split('\n'):
                    if 'Interface' in line:
                        return line.split()[1]
            except:
                pass
            
            # Fallback: check /sys/class/net
            net_path = Path('/sys/class/net')
            if net_path.exists():
                for iface in net_path.iterdir():
                    if iface.name.startswith(('wlan', 'wlp')):
                        return iface.name
            
            return 'wlan0'  # Default
        
        elif self.is_windows:
            # Windows WiFi interface
            try:
                result = subprocess.run(
                    ['netsh', 'wlan', 'show', 'interfaces'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                for line in result.stdout.split('\n'):
                    if 'Name' in line:
                        return line.split(':')[1].strip()
            except:
                pass
            return 'Wi-Fi'  # Default Windows interface name
        
        return None
    
    def scan_networks(self) -> List[Dict[str, str]]:
        """Scan for available WiFi networks."""
        networks = []
        
        if self.is_macos:
            networks = self._scan_macos()
        elif self.is_linux:
            networks = self._scan_linux()
        elif self.is_windows:
            networks = self._scan_windows()
        
        return networks
    
    def _scan_macos(self) -> List[Dict[str, str]]:
        """Scan WiFi on macOS."""
        try:
            # Use airport utility
            airport = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport'
            
            result = subprocess.run(
                [airport, '-s'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            networks = []
            lines = result.stdout.strip().split('\n')[1:]  # Skip header
            
            for line in lines:
                parts = line.split()
                if len(parts) >= 3:
                    ssid = parts[0]
                    bssid = parts[1]
                    rssi = parts[2]
                    
                    # Security type (WPA, WPA2, Open, etc.)
                    security = 'Open'
                    if 'WPA2' in line:
                        security = 'WPA2'
                    elif 'WPA' in line:
                        security = 'WPA'
                    elif 'WEP' in line:
                        security = 'WEP'
                    
                    networks.append({
                        'ssid': ssid,
                        'bssid': bssid,
                        'signal': rssi,
                        'security': security
                    })
            
            return networks
        
        except Exception as e:
            print(f"{RED}Error scanning WiFi: {e}{RESET}")
            return []
    
    def _scan_linux(self) -> List[Dict[str, str]]:
        """Scan WiFi on Linux."""
        try:
            # Try nmcli first (NetworkManager)
            result = subprocess.run(
                ['nmcli', '-t', '-f', 'SSID,BSSID,SIGNAL,SECURITY', 'dev', 'wifi'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                networks = []
                for line in result.stdout.strip().split('\n'):
                    parts = line.split(':')
                    if len(parts) >= 3:
                        networks.append({
                            'ssid': parts[0],
                            'bssid': parts[1] if len(parts) > 1 else '',
                            'signal': parts[2] if len(parts) > 2 else '0',
                            'security': parts[3] if len(parts) > 3 else 'Open'
                        })
                return networks
        
        except FileNotFoundError:
            pass
        
        # Fallback: iw scan
        try:
            result = subprocess.run(
                ['sudo', 'iw', self.interface, 'scan'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            networks = []
            current_net = {}
            
            for line in result.stdout.split('\n'):
                line = line.strip()
                
                if line.startswith('BSS'):
                    if current_net and 'ssid' in current_net:
                        networks.append(current_net)
                    current_net = {'bssid': line.split()[1].rstrip('(on)')}
                
                elif 'SSID:' in line:
                    current_net['ssid'] = line.split('SSID:')[1].strip()
                
                elif 'signal:' in line:
                    signal = line.split('signal:')[1].strip().split()[0]
                    current_net['signal'] = signal
                
                elif 'WPA' in line or 'WEP' in line:
                    current_net['security'] = 'WPA' if 'WPA' in line else 'WEP'
            
            if current_net and 'ssid' in current_net:
                networks.append(current_net)
            
            return networks
        
        except Exception as e:
            print(f"{RED}Error scanning WiFi: {e}{RESET}")
            return []
    
    def _scan_windows(self) -> List[Dict[str, str]]:
        """Scan WiFi on Windows."""
        try:
            result = subprocess.run(
                ['netsh', 'wlan', 'show', 'networks', 'mode=bssid'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            networks = []
            current_net = {}
            
            for line in result.stdout.split('\n'):
                line = line.strip()
                
                if line.startswith('SSID'):
                    if current_net and 'ssid' in current_net:
                        networks.append(current_net)
                    ssid = line.split(':', 1)[1].strip()
                    current_net = {'ssid': ssid}
                
                elif 'BSSID' in line:
                    current_net['bssid'] = line.split(':', 1)[1].strip()
                
                elif 'Signal' in line:
                    signal = line.split(':')[1].strip().rstrip('%')
                    current_net['signal'] = signal
                
                elif 'Authentication' in line:
                    auth = line.split(':')[1].strip()
                    current_net['security'] = auth
            
            if current_net and 'ssid' in current_net:
                networks.append(current_net)
            
            return networks
        
        except Exception as e:
            print(f"{RED}Error scanning WiFi: {e}{RESET}")
            return []
    
    def connect(self, ssid: str, password: Optional[str] = None) -> bool:
        """Connect to WiFi network."""
        if self.is_macos:
            return self._connect_macos(ssid, password)
        elif self.is_linux:
            return self._connect_linux(ssid, password)
        elif self.is_windows:
            return self._connect_windows(ssid, password)
        return False
    
    def _connect_macos(self, ssid: str, password: Optional[str]) -> bool:
        """Connect to WiFi on macOS."""
        try:
            if password:
                # Connect with password
                result = subprocess.run(
                    ['networksetup', '-setairportnetwork', self.interface, ssid, password],
                    capture_output=True,
                    text=True,
                    timeout=15
                )
            else:
                # Connect to open network
                result = subprocess.run(
                    ['networksetup', '-setairportnetwork', self.interface, ssid],
                    capture_output=True,
                    text=True,
                    timeout=15
                )
            
            return result.returncode == 0
        
        except Exception as e:
            print(f"{RED}Error connecting: {e}{RESET}")
            return False
    
    def _connect_linux(self, ssid: str, password: Optional[str]) -> bool:
        """Connect to WiFi on Linux."""
        try:
            # Try nmcli first
            if password:
                result = subprocess.run(
                    ['nmcli', 'dev', 'wifi', 'connect', ssid, 'password', password],
                    capture_output=True,
                    text=True,
                    timeout=15
                )
            else:
                result = subprocess.run(
                    ['nmcli', 'dev', 'wifi', 'connect', ssid],
                    capture_output=True,
                    text=True,
                    timeout=15
                )
            
            return result.returncode == 0
        
        except FileNotFoundError:
            print(f"{YELLOW}NetworkManager not found. Install with: sudo apt install network-manager{RESET}")
            return False
        except Exception as e:
            print(f"{RED}Error connecting: {e}{RESET}")
            return False
    
    def _connect_windows(self, ssid: str, password: Optional[str]) -> bool:
        """Connect to WiFi on Windows."""
        try:
            if password:
                # Create WiFi profile
                profile = f"""<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>{ssid}</name>
    <SSIDConfig>
        <SSID>
            <name>{ssid}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>{password}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>"""
                
                # Save profile to temp file
                profile_path = Path(os.getenv('TEMP', '.')) / f"{ssid}.xml"
                with open(profile_path, 'w') as f:
                    f.write(profile)
                
                # Add profile
                subprocess.run(
                    ['netsh', 'wlan', 'add', 'profile', f'filename={profile_path}'],
                    capture_output=True,
                    timeout=10
                )
                
                # Delete temp file
                profile_path.unlink()
            
            # Connect
            result = subprocess.run(
                ['netsh', 'wlan', 'connect', f'name={ssid}'],
                capture_output=True,
                text=True,
                timeout=15
            )
            
            return result.returncode == 0
        
        except Exception as e:
            print(f"{RED}Error connecting: {e}{RESET}")
            return False
    
    def disconnect(self) -> bool:
        """Disconnect from current WiFi."""
        try:
            if self.is_macos:
                result = subprocess.run(
                    ['networksetup', '-setairportpower', self.interface, 'off'],
                    capture_output=True,
                    timeout=5
                )
                subprocess.run(
                    ['networksetup', '-setairportpower', self.interface, 'on'],
                    capture_output=True,
                    timeout=5
                )
            elif self.is_linux:
                result = subprocess.run(
                    ['nmcli', 'dev', 'disconnect', self.interface],
                    capture_output=True,
                    timeout=5
                )
            elif self.is_windows:
                result = subprocess.run(
                    ['netsh', 'wlan', 'disconnect'],
                    capture_output=True,
                    timeout=5
                )
            else:
                return False
            
            return result.returncode == 0
        
        except Exception as e:
            print(f"{RED}Error disconnecting: {e}{RESET}")
            return False
    
    def get_current_network(self) -> Optional[Dict[str, str]]:
        """Get currently connected network."""
        try:
            if self.is_macos:
                result = subprocess.run(
                    ['networksetup', '-getairportnetwork', self.interface],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if 'Current Wi-Fi Network:' in result.stdout:
                    ssid = result.stdout.split(':')[1].strip()
                    return {'ssid': ssid}
            
            elif self.is_linux:
                result = subprocess.run(
                    ['nmcli', '-t', '-f', 'active,ssid', 'dev', 'wifi'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                for line in result.stdout.split('\n'):
                    if line.startswith('yes:'):
                        ssid = line.split(':', 1)[1]
                        return {'ssid': ssid}
            
            elif self.is_windows:
                result = subprocess.run(
                    ['netsh', 'wlan', 'show', 'interfaces'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                for line in result.stdout.split('\n'):
                    if 'SSID' in line and 'BSSID' not in line:
                        ssid = line.split(':', 1)[1].strip()
                        if ssid:
                            return {'ssid': ssid}
        
        except:
            pass
        
        return None
    
    def display_networks(self, networks: List[Dict[str, str]]):
        """Display scanned networks in a nice format."""
        if not networks:
            print(f"{YELLOW}No networks found{RESET}")
            return
        
        print(f"\n{PURPLE}╔════════════════════════════════════════════════════════════╗{RESET}")
        print(f"{PURPLE}║         🩸 Available WiFi Networks                        ║{RESET}")
        print(f"{PURPLE}╚════════════════════════════════════════════════════════════╝{RESET}\n")
        
        # Sort by signal strength
        try:
            networks.sort(key=lambda x: int(x.get('signal', '0').rstrip('%').rstrip(' dBm')), reverse=True)
        except:
            pass
        
        for i, net in enumerate(networks, 1):
            ssid = net.get('ssid', 'Unknown')
            signal = net.get('signal', '?')
            security = net.get('security', 'Unknown')
            
            # Signal strength indicator
            try:
                sig_val = int(signal.rstrip('%').rstrip(' dBm'))
                if sig_val > 70 or sig_val > -50:
                    sig_icon = f"{GREEN}▂▄▆█{RESET}"
                elif sig_val > 50 or sig_val > -60:
                    sig_icon = f"{YELLOW}▂▄▆_{RESET}"
                elif sig_val > 30 or sig_val > -70:
                    sig_icon = f"{YELLOW}▂▄__{RESET}"
                else:
                    sig_icon = f"{RED}▂___{RESET}"
            except:
                sig_icon = "____"
            
            # Security indicator
            if security == 'Open' or security == '--':
                sec_icon = f"{RED}🔓{RESET}"
            else:
                sec_icon = f"{GREEN}🔒{RESET}"
            
            print(f"  {CYAN}{i:2d}.{RESET} {sig_icon} {sec_icon} {BLUE}{ssid}{RESET}")
            print(f"      Signal: {signal}  Security: {security}")
            print()


# Command functions
def wifi_scan():
    """Scan for WiFi networks."""
    manager = WiFiManager()
    
    print(f"\n{YELLOW}📡 Scanning for WiFi networks...{RESET}\n")
    
    networks = manager.scan_networks()
    manager.display_networks(networks)
    
    return networks


def wifi_connect(ssid: str, password: Optional[str] = None):
    """Connect to WiFi network."""
    manager = WiFiManager()
    
    print(f"\n{PURPLE}🩸 Connecting to {CYAN}{ssid}{RESET}...\n")
    
    success = manager.connect(ssid, password)
    
    if success:
        print(f"{GREEN}✅ Successfully connected to {ssid}!{RESET}\n")
    else:
        print(f"{RED}❌ Failed to connect to {ssid}{RESET}\n")
    
    return success


def wifi_disconnect():
    """Disconnect from WiFi."""
    manager = WiFiManager()
    
    print(f"\n{YELLOW}📡 Disconnecting from WiFi...{RESET}\n")
    
    success = manager.disconnect()
    
    if success:
        print(f"{GREEN}✅ Disconnected{RESET}\n")
    else:
        print(f"{RED}❌ Failed to disconnect{RESET}\n")
    
    return success


def wifi_status():
    """Show current WiFi status."""
    manager = WiFiManager()
    
    current = manager.get_current_network()
    
    if current:
        ssid = current.get('ssid', 'Unknown')
        print(f"\n{GREEN}✅ Connected to: {CYAN}{ssid}{RESET}\n")
    else:
        print(f"\n{YELLOW}❌ Not connected to any network{RESET}\n")
    
    return current


def check_wifi_connection() -> bool:
    """Check if WiFi is connected (lightweight check)."""
    manager = WiFiManager()
    current = manager.get_current_network()
    return current is not None


def get_wifi_info() -> Optional[Dict[str, str]]:
    """Get current WiFi connection info (SSID, etc.)."""
    manager = WiFiManager()
    return manager.get_current_network()


def test_wifi_speed(timeout: int = 10) -> Optional[Dict[str, float]]:
    """Test WiFi upload and download speeds.
    
    Args:
        timeout: Timeout in seconds for the speed test
    
    Returns:
        Dict with 'download' and 'upload' speeds in Mbps, or None if test fails
    """
    try:
        import urllib.request
        import time
        
        # Check if connected first
        if not check_wifi_connection():
            return None
        
        download_speed = 0.0
        upload_speed = 0.0
        
        # Test download speed - try multiple sources
        download_urls = [
            'http://ipv4.download.thinkbroadband.com/5MB.zip',  # 5MB test file
            'http://speedtest.ftp.otenet.gr/files/test5Mb.db',   # 5MB backup
            'https://proof.ovh.net/files/1Mb.dat',               # 1MB fallback
        ]
        
        for download_url in download_urls:
            try:
                start_time = time.time()
                req = urllib.request.Request(download_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=timeout) as response:
                    data = response.read()
                download_time = time.time() - start_time
                
                # Calculate download speed in Mbps
                if download_time > 0:
                    file_size_mb = len(data) / (1024 * 1024)
                    download_speed = (file_size_mb * 8) / download_time  # Convert to Mbps
                    if download_speed > 0:
                        break  # Success, stop trying other URLs
            except Exception as e:
                continue  # Try next URL
        
        # Test upload speed - simple approach using time for a POST request
        upload_url = 'https://httpbin.org/post'
        upload_data = b'0' * (512 * 1024)  # 512KB of data (reduced for faster test)
        
        try:
            start_time = time.time()
            req = urllib.request.Request(upload_url, data=upload_data, method='POST',
                                        headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                response.read()
            upload_time = time.time() - start_time
            
            # Calculate upload speed in Mbps
            if upload_time > 0:
                upload_size_mb = len(upload_data) / (1024 * 1024)
                upload_speed = (upload_size_mb * 8) / upload_time  # Convert to Mbps
        except Exception as e:
            pass  # Upload test failed
        
        # Only return if at least one test succeeded
        if download_speed > 0 or upload_speed > 0:
            return {
                'download': round(download_speed, 2),
                'upload': round(upload_speed, 2)
            }
        else:
            return None
    
    except Exception:
        return None


if __name__ == "__main__":
    # Test
    wifi_scan()
