#!/usr/bin/env python3
"""
⏰ Time Validator for Consensus
Validates system time accuracy before saving timestamps to consensus.
Only uses verified timestamps when internet/WiFi is available.
"""
import socket
import struct
import time
from datetime import datetime, timezone
from typing import Optional, Tuple
import subprocess


class TimeValidator:
    """
    Validates system time accuracy for consensus timestamps.
    Uses NTP servers to verify time is accurate.
    """
    
    # NTP servers to try (in order)
    NTP_SERVERS = [
        'time.apple.com',      # Apple's NTP server
        'time.google.com',     # Google's NTP server
        'pool.ntp.org',        # NTP pool
        'time.nist.gov'        # NIST time server
    ]
    
    # Maximum acceptable time drift (seconds)
    MAX_DRIFT = 5.0  # 5 seconds tolerance
    
    # Cache for last validation
    _last_validation = None
    _validation_cache_duration = 300  # 5 minutes
    
    @classmethod
    def is_online(cls) -> bool:
        """
        Check if system has internet connectivity.
        
        Returns:
            True if online, False otherwise
        """
        try:
            # Try to connect to Google's DNS
            socket.create_connection(("8.8.8.8", 53), timeout=3)
            return True
        except OSError:
            pass
        
        try:
            # Try to connect to Cloudflare's DNS
            socket.create_connection(("1.1.1.1", 53), timeout=3)
            return True
        except OSError:
            return False
    
    @classmethod
    def get_ntp_time(cls, ntp_server: str, timeout: int = 3) -> Optional[float]:
        """
        Get current time from NTP server.
        
        Args:
            ntp_server: NTP server hostname
            timeout: Connection timeout in seconds
        
        Returns:
            Unix timestamp from NTP server, or None if failed
        """
        try:
            # NTP packet format
            NTP_PACKET_FORMAT = "!12I"
            NTP_DELTA = 2208988800  # Seconds between 1900 and 1970
            
            # Create NTP request packet
            packet = b'\x1b' + 47 * b'\0'
            
            # Send request
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.settimeout(timeout)
                sock.sendto(packet, (ntp_server, 123))
                
                # Receive response
                data, _ = sock.recvfrom(1024)
            
            # Unpack response
            unpacked = struct.unpack(NTP_PACKET_FORMAT, data[:struct.calcsize(NTP_PACKET_FORMAT)])
            
            # Extract transmit timestamp (seconds since 1900)
            ntp_time = unpacked[10] + float(unpacked[11]) / 2**32
            
            # Convert to Unix timestamp
            unix_time = ntp_time - NTP_DELTA
            
            return unix_time
            
        except Exception:
            return None
    
    @classmethod
    def validate_system_time(cls) -> Tuple[bool, Optional[float], str]:
        """
        Validate that system time is accurate.
        
        Returns:
            Tuple of (is_valid, drift_seconds, reason)
            - is_valid: True if time is accurate
            - drift_seconds: How many seconds off (None if can't determine)
            - reason: Explanation of validation result
        """
        # Check cache first
        if cls._last_validation:
            cache_time, cache_result = cls._last_validation
            if time.time() - cache_time < cls._validation_cache_duration:
                return cache_result
        
        # Check if online
        if not cls.is_online():
            return False, None, "No internet connection - cannot validate time"
        
        # Try NTP servers
        for ntp_server in cls.NTP_SERVERS:
            ntp_time = cls.get_ntp_time(ntp_server)
            
            if ntp_time is not None:
                # Compare with system time
                system_time = time.time()
                drift = abs(system_time - ntp_time)
                
                is_valid = drift <= cls.MAX_DRIFT
                reason = f"Validated against {ntp_server}" if is_valid else f"System time off by {drift:.1f}s"
                
                result = (is_valid, drift, reason)
                
                # Cache the result
                cls._last_validation = (time.time(), result)
                
                return result
        
        # All NTP servers failed
        return False, None, "Could not reach any NTP servers"
    
    @classmethod
    def get_validated_timestamp(cls) -> Optional[dict]:
        """
        Get current timestamp only if system time is validated as accurate.
        
        Returns:
            Dict with timestamp info if valid, None otherwise
            {
                'timestamp': ISO format timestamp,
                'timezone': Timezone name,
                'utc_offset': Offset from UTC in seconds,
                'validated': True,
                'validation_method': 'NTP',
                'drift': Drift in seconds
            }
        """
        is_valid, drift, reason = cls.validate_system_time()
        
        if not is_valid:
            return None
        
        # Get current time with timezone
        now = datetime.now(timezone.utc)
        local_now = datetime.now()
        
        # Get timezone info
        try:
            # Try to get timezone name from system
            result = subprocess.run(['date', '+%Z'], capture_output=True, text=True, timeout=1)
            tz_name = result.stdout.strip() if result.returncode == 0 else 'UTC'
        except:
            tz_name = 'UTC'
        
        # Calculate UTC offset
        utc_offset = int((local_now - now.replace(tzinfo=None)).total_seconds())
        
        return {
            'timestamp': now.isoformat(),
            'timezone': tz_name,
            'utc_offset': utc_offset,
            'validated': True,
            'validation_method': 'NTP',
            'drift': drift if drift is not None else 0.0,
            'validation_reason': reason
        }
    
    @classmethod
    def get_unvalidated_timestamp(cls) -> dict:
        """
        Get current timestamp marked as unvalidated (offline mode).
        
        Returns:
            Dict with timestamp info marked as unvalidated
        """
        now = datetime.now(timezone.utc)
        local_now = datetime.now()
        
        # Get timezone info
        try:
            result = subprocess.run(['date', '+%Z'], capture_output=True, text=True, timeout=1)
            tz_name = result.stdout.strip() if result.returncode == 0 else 'UTC'
        except:
            tz_name = 'UTC'
        
        utc_offset = int((local_now - now.replace(tzinfo=None)).total_seconds())
        
        return {
            'timestamp': now.isoformat(),
            'timezone': tz_name,
            'utc_offset': utc_offset,
            'validated': False,
            'validation_method': 'none',
            'drift': None,
            'validation_reason': 'System offline - time not validated'
        }
    
    @classmethod
    def get_timestamp_for_consensus(cls) -> dict:
        """
        Get appropriate timestamp for consensus upload.
        Uses validated timestamp if available, otherwise returns unvalidated.
        
        Returns:
            Dict with timestamp info, always includes 'validated' flag
        """
        validated = cls.get_validated_timestamp()
        
        if validated:
            return validated
        else:
            return cls.get_unvalidated_timestamp()


# Convenience functions
def get_consensus_timestamp() -> dict:
    """Get timestamp for consensus (validated if online)."""
    return TimeValidator.get_timestamp_for_consensus()


def is_time_validated() -> bool:
    """Check if system time can be validated."""
    is_valid, _, _ = TimeValidator.validate_system_time()
    return is_valid


# CLI for testing
if __name__ == "__main__":
    print("🕐 Time Validator Test\n")
    
    # Check if online
    online = TimeValidator.is_online()
    print(f"Internet: {'✅ Online' if online else '❌ Offline'}")
    print()
    
    if online:
        # Validate time
        is_valid, drift, reason = TimeValidator.validate_system_time()
        print(f"Time Validation: {'✅ Valid' if is_valid else '❌ Invalid'}")
        print(f"Reason: {reason}")
        if drift is not None:
            print(f"Drift: {drift:.3f} seconds")
        print()
    
    # Get timestamp
    ts = TimeValidator.get_timestamp_for_consensus()
    print("Consensus Timestamp:")
    print(f"  Time: {ts['timestamp']}")
    print(f"  Timezone: {ts['timezone']}")
    print(f"  UTC Offset: {ts['utc_offset']}s")
    print(f"  Validated: {'✅ Yes' if ts['validated'] else '❌ No'}")
    print(f"  Method: {ts['validation_method']}")
    if ts['drift'] is not None:
        print(f"  Drift: {ts['drift']:.3f}s")
