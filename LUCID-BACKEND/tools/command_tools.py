#!/usr/bin/env python3
"""
⚡ Command Tools - Execute shell commands safely like Warp AI
"""
import subprocess
import os
import shlex
from typing import Dict, Any, Optional, List

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
RESET = "\033[0m"

# Dangerous commands that require confirmation
RISKY_COMMANDS = ['rm', 'sudo', 'dd', 'mkfs', 'format', '>', 'chmod', 'chown']


def is_risky_command(command: str) -> bool:
    """Check if a command is potentially dangerous."""
    cmd_lower = command.lower().strip()
    return any(risky in cmd_lower.split()[0] if cmd_lower.split() else False 
               for risky in RISKY_COMMANDS)


def run_command(command: str, 
                cwd: Optional[str] = None,
                timeout: int = 30,
                capture_output: bool = True) -> Dict[str, Any]:
    """
    Execute a shell command safely.
    
    Args:
        command: Shell command to execute
        cwd: Working directory for command
        timeout: Timeout in seconds
        capture_output: Whether to capture stdout/stderr
    
    Returns:
        Dict with command result, output, and metadata
    """
    try:
        if is_risky_command(command):
            return {
                "success": False,
                "error": f"Risky command detected: {command}. Requires manual confirmation.",
                "command": command,
                "is_risky": True
            }
        
        # Set working directory
        working_dir = os.path.expanduser(cwd) if cwd else os.getcwd()
        
        # Execute command
        result = subprocess.run(
            command,
            shell=True,
            cwd=working_dir,
            capture_output=capture_output,
            text=True,
            timeout=timeout
        )
        
        return {
            "success": result.returncode == 0,
            "command": command,
            "exit_code": result.returncode,
            "stdout": result.stdout if capture_output else None,
            "stderr": result.stderr if capture_output else None,
            "cwd": working_dir
        }
    
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": f"Command timed out after {timeout}s",
            "command": command,
            "timeout": True
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "command": command
        }


def run_python_code(code: str, timeout: int = 10) -> Dict[str, Any]:
    """
    Execute Python code safely in a subprocess.
    
    Args:
        code: Python code to execute
        timeout: Timeout in seconds
    
    Returns:
        Dict with execution result
    """
    try:
        result = subprocess.run(
            ['python3', '-c', code],
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr
        }
    
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": f"Code execution timed out after {timeout}s",
            "timeout": True
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def get_env_info() -> Dict[str, Any]:
    """Get current environment information like Warp does."""
    return {
        "cwd": os.getcwd(),
        "home": os.path.expanduser("~"),
        "user": os.getenv("USER", "unknown"),
        "shell": os.getenv("SHELL", "unknown"),
        "path": os.getenv("PATH", "").split(":"),
        "platform": os.uname().sysname if hasattr(os, 'uname') else "unknown"
    }


def check_command_exists(command: str) -> bool:
    """Check if a command exists in PATH."""
    result = subprocess.run(
        f"which {command}",
        shell=True,
        capture_output=True
    )
    return result.returncode == 0


# Test functions
if __name__ == "__main__":
    print(f"{PURPLE}🧪 Testing Command Tools{RESET}\n")
    
    # Test 1: Simple command
    print(f"{GOLD}Test 1: Run simple command{RESET}")
    result = run_command("echo 'Hello from LuciferAI'")
    if result["success"]:
        print(f"{GREEN}✅ Command executed{RESET}")
        print(f"Output: {result['stdout'].strip()}")
    else:
        print(f"{RED}❌ {result['error']}{RESET}")
    
    # Test 2: List files
    print(f"\n{GOLD}Test 2: List files{RESET}")
    result = run_command("ls -la", cwd="..")
    if result["success"]:
        print(f"{GREEN}✅ Command executed{RESET}")
        lines = result['stdout'].split('\n')[:5]
        print('\n'.join(lines))
    else:
        print(f"{RED}❌ {result['error']}{RESET}")
    
    # Test 3: Python code
    print(f"\n{GOLD}Test 3: Run Python code{RESET}")
    result = run_python_code("print('Python executed'); print(2+2)")
    if result["success"]:
        print(f"{GREEN}✅ Python code executed{RESET}")
        print(f"Output: {result['stdout'].strip()}")
    else:
        print(f"{RED}❌ {result['error']}{RESET}")
    
    # Test 4: Environment info
    print(f"\n{GOLD}Test 4: Environment info{RESET}")
    env = get_env_info()
    print(f"{GREEN}✅ Environment loaded{RESET}")
    print(f"  CWD: {env['cwd']}")
    print(f"  User: {env['user']}")
    print(f"  Shell: {env['shell']}")
    
    # Test 5: Risky command check
    print(f"\n{GOLD}Test 5: Risky command detection{RESET}")
    result = run_command("rm -rf /")
    if not result["success"] and result.get("is_risky"):
        print(f"{GREEN}✅ Risky command blocked{RESET}")
    else:
        print(f"{RED}❌ Should have blocked risky command{RESET}")
    
    # Test 6: Check command exists
    print(f"\n{GOLD}Test 6: Check commands{RESET}")
    for cmd in ['python3', 'git', 'nonexistent_cmd']:
        exists = check_command_exists(cmd)
        status = f"{GREEN}✅" if exists else f"{RED}❌"
        print(f"  {status} {cmd}: {'exists' if exists else 'not found'}{RESET}")
    
    print(f"\n{PURPLE}✨ Command tools tests complete{RESET}")
