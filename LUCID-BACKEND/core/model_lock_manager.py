#!/usr/bin/env python3
"""
🔒 Model Lock Manager - Prevent concurrent model usage across instances
Ensures only one LuciferAI instance uses a model at a time
"""
import os
import time
import fcntl
from pathlib import Path
from typing import Optional, List
from contextlib import contextmanager


class ModelLockManager:
    """Manages locks for AI models to prevent concurrent usage."""
    
    def __init__(self, lock_dir: Optional[Path] = None):
        """Initialize the lock manager.
        
        Args:
            lock_dir: Optional directory for lock files (defaults to ~/.luciferai/locks)
        """
        if lock_dir is None:
            lock_dir = Path.home() / '.luciferai' / 'locks'
        
        self.lock_dir = lock_dir
        self.lock_dir.mkdir(parents=True, exist_ok=True)
        
        # Track our own locks for cleanup
        self._held_locks = {}
    
    def _get_lock_file(self, model_name: str) -> Path:
        """Get the lock file path for a model."""
        return self.lock_dir / f"{model_name}.lock"
    
    def is_locked(self, model_name: str) -> bool:
        """Check if a model is currently locked (in use).
        
        Args:
            model_name: Model name (e.g., 'mistral', 'llama3.2')
        
        Returns:
            True if model is locked, False otherwise
        """
        lock_file = self._get_lock_file(model_name)
        
        if not lock_file.exists():
            return False
        
        try:
            # Try to acquire lock (non-blocking)
            with open(lock_file, 'r') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                return False  # Successfully acquired, so it's not locked
        except (IOError, OSError):
            # Couldn't acquire - it's locked
            return True
    
    def acquire_lock(self, model_name: str, timeout: float = 0.1) -> bool:
        """Acquire a lock for a model.
        
        Args:
            model_name: Model name
            timeout: How long to wait for lock (0 = non-blocking)
        
        Returns:
            True if lock acquired, False otherwise
        """
        lock_file = self._get_lock_file(model_name)
        
        try:
            # Open or create lock file
            f = open(lock_file, 'w')
            
            # Write process info
            pid = os.getpid()
            timestamp = time.time()
            f.write(f"{pid}\n{timestamp}\n{model_name}\n")
            f.flush()
            
            # Try to acquire exclusive lock
            if timeout == 0:
                # Non-blocking
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            else:
                # Blocking with timeout
                start_time = time.time()
                while time.time() - start_time < timeout:
                    try:
                        fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                        break
                    except (IOError, OSError):
                        time.sleep(0.01)
                else:
                    f.close()
                    return False
            
            # Store file handle for cleanup
            self._held_locks[model_name] = f
            return True
            
        except (IOError, OSError):
            return False
    
    def release_lock(self, model_name: str):
        """Release a lock for a model.
        
        Args:
            model_name: Model name
        """
        if model_name in self._held_locks:
            f = self._held_locks[model_name]
            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                f.close()
            except:
                pass
            del self._held_locks[model_name]
            
            # Clean up lock file
            lock_file = self._get_lock_file(model_name)
            try:
                lock_file.unlink()
            except:
                pass
    
    def release_all_locks(self):
        """Release all locks held by this manager."""
        for model_name in list(self._held_locks.keys()):
            self.release_lock(model_name)
    
    def get_locked_models(self, exclude_own: bool = False) -> List[str]:
        """Get list of currently locked models.
        
        Args:
            exclude_own: If True, exclude models locked by this instance
        
        Returns:
            List of model names that are locked
        """
        locked = []
        for lock_file in self.lock_dir.glob('*.lock'):
            model_name = lock_file.stem
            
            # Skip our own locks if requested
            if exclude_own and model_name in self._held_locks:
                continue
            
            if self.is_locked(model_name):
                locked.append(model_name)
        return locked
    
    def cleanup_stale_locks(self, max_age_seconds: float = 3600):
        """Clean up stale lock files from dead processes.
        
        Args:
            max_age_seconds: Maximum age before considering a lock stale
        """
        current_time = time.time()
        
        for lock_file in self.lock_dir.glob('*.lock'):
            try:
                # Check if we can read the lock file
                if not lock_file.exists():
                    continue
                
                # Try to read process info
                with open(lock_file, 'r') as f:
                    lines = f.readlines()
                    if len(lines) < 2:
                        continue
                    
                    try:
                        pid = int(lines[0].strip())
                        timestamp = float(lines[1].strip())
                    except (ValueError, IndexError):
                        continue
                    
                    # Check if process still exists
                    try:
                        os.kill(pid, 0)  # Signal 0 just checks if process exists
                        process_exists = True
                    except OSError:
                        process_exists = False
                    
                    # Remove stale locks
                    if not process_exists or (current_time - timestamp) > max_age_seconds:
                        # Try to acquire lock to confirm it's stale
                        try:
                            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                            lock_file.unlink()
                        except:
                            pass
            except:
                pass
    
    @contextmanager
    def lock_model(self, model_name: str):
        """Context manager for model locking.
        
        Usage:
            with lock_manager.lock_model('mistral'):
                # Use mistral model
                pass
        
        Args:
            model_name: Model to lock
        
        Yields:
            True if lock acquired, False otherwise
        """
        acquired = self.acquire_lock(model_name)
        try:
            yield acquired
        finally:
            if acquired:
                self.release_lock(model_name)
    
    def __del__(self):
        """Clean up locks on deletion."""
        self.release_all_locks()


def get_model_lock_manager() -> ModelLockManager:
    """Get a singleton instance of the model lock manager."""
    if not hasattr(get_model_lock_manager, '_instance'):
        get_model_lock_manager._instance = ModelLockManager()
        # Clean up stale locks on initialization
        get_model_lock_manager._instance.cleanup_stale_locks()
    return get_model_lock_manager._instance
