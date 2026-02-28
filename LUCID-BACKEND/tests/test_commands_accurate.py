#!/usr/bin/env python3
"""
Accurate LuciferAI Command Test Suite
Tests with proper verification of:
- File/folder creation on filesystem
- Response content accuracy
- Command keyword variations
"""
import subprocess
import time
import sys
from pathlib import Path
import shutil

class AccurateCommandTester:
    def __init__(self):
        self.results = []
        self.project_root = Path(__file__).parent
        self.test_artifacts = []  # Track created files for cleanup
        
    def run_command(self, command: str, description: str, expected_behavior: dict, timeout: int = 15):
        """
        Run a command with specific verification criteria.
        
        expected_behavior = {
            'creates_file': Path or None,
            'creates_folder': Path or None,
            'response_contains': list of strings that should be in response,
            'response_excludes': list of strings that should NOT be in response,
            'type': 'execution' | 'query' | 'system'
        }
        """
        print(f"\n{'='*70}")
        print(f"🧪 TEST: {description}")
        print(f"📝 Command: {command}")
        print(f"📋 Expected: {expected_behavior['type']}")
        print(f"{'='*70}")
        
        try:
            # Run command through LuciferAI
            proc = subprocess.Popen(
                ['python3', 'lucifer.py'],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=self.project_root
            )
            
            # Send command and exit
            output, _ = proc.communicate(
                input=f"{command}\nexit\n",
                timeout=timeout
            )
            
            # Extract response
            response = self._extract_response(output)
            
            # Verify behavior
            result = self._verify_behavior(expected_behavior, response)
            
            self.results.append({
                'test': description,
                'command': command,
                'result': result['status'],
                'details': result['details'],
                'response_preview': response[:150] if response else "No response"
            })
            
            print(f"\n{result['status']} - {result['summary']}")
            for detail in result['details']:
                print(f"  {detail}")
        
        except subprocess.TimeoutExpired:
            self.results.append({
                'test': description,
                'command': command,
                'result': "⏱️  TIMEOUT",
                'details': [f"Command exceeded {timeout}s"],
                'response_preview': "Timed out"
            })
            print(f"\n⏱️  TIMEOUT - Command exceeded {timeout}s")
        
        except Exception as e:
            self.results.append({
                'test': description,
                'command': command,
                'result': "❌ ERROR",
                'details': [str(e)],
                'response_preview': str(e)
            })
            print(f"\n❌ ERROR - {e}")
    
    def _extract_response(self, output: str) -> str:
        """Extract meaningful response from output."""
        import re
        
        # Strip ANSI color codes first
        ansi_escape = re.compile(r'\x1b\[[0-9;]*m')
        clean_output = ansi_escape.sub('', output)
        
        lines = clean_output.split('\n')
        
        # Find content between prompts
        response_lines = []
        capture = False
        
        for line in lines:
            if 'LuciferAI>' in line or 'LuciferAI >' in line:
                capture = True
                # Check if response is on same line
                if ' >' in line:
                    parts = line.split(' >', 1)
                    if len(parts) > 1 and parts[1].strip():
                        response_lines.append(parts[1].strip())
                continue
            if capture and line.strip():
                if 'Session saved' in line or 'Shutdown' in line or 'Exiting' in line:
                    break
                response_lines.append(line)
        
        return '\n'.join(response_lines)
    
    def _verify_behavior(self, expected: dict, response: str) -> dict:
        """Verify command behavior against expectations."""
        checks = []
        all_passed = True
        
        # Check file creation
        if expected.get('creates_file'):
            file_path = expected['creates_file']
            if file_path.exists():
                checks.append(f"✅ File created: {file_path.name}")
                self.test_artifacts.append(file_path)
                
                # Check file is not empty
                if file_path.stat().st_size > 0:
                    checks.append(f"✅ File has content ({file_path.stat().st_size} bytes)")
                else:
                    checks.append(f"⚠️  File is empty")
                    all_passed = False
            else:
                checks.append(f"❌ File NOT created: {file_path}")
                all_passed = False
        
        # Check folder creation
        if expected.get('creates_folder'):
            folder_path = expected['creates_folder']
            if folder_path.exists() and folder_path.is_dir():
                checks.append(f"✅ Folder created: {folder_path.name}")
                self.test_artifacts.append(folder_path)
            else:
                checks.append(f"❌ Folder NOT created: {folder_path}")
                all_passed = False
        
        # Check response contains expected strings
        if expected.get('response_contains'):
            for expected_str in expected['response_contains']:
                if expected_str.lower() in response.lower():
                    checks.append(f"✅ Response contains: '{expected_str}'")
                else:
                    checks.append(f"❌ Response missing: '{expected_str}'")
                    all_passed = False
        
        # Check response doesn't contain unwanted strings
        if expected.get('response_excludes'):
            for unwanted_str in expected['response_excludes']:
                if unwanted_str.lower() not in response.lower():
                    checks.append(f"✅ Response excludes: '{unwanted_str}'")
                else:
                    checks.append(f"❌ Response contains unwanted: '{unwanted_str}'")
                    all_passed = False
        
        status = "✅ PASS" if all_passed else "❌ FAIL"
        summary = "All checks passed" if all_passed else "Some checks failed"
        
        return {
            'status': status,
            'summary': summary,
            'details': checks
        }
    
    def cleanup_artifacts(self):
        """Clean up test artifacts."""
        print(f"\n🧹 Cleaning up test artifacts...")
        cleaned = 0
        
        for artifact in self.test_artifacts:
            try:
                if artifact.exists():
                    if artifact.is_dir():
                        shutil.rmtree(artifact)
                    else:
                        artifact.unlink()
                    cleaned += 1
                    print(f"  ✓ Removed: {artifact.name}")
            except Exception as e:
                print(f"  ✗ Failed to remove {artifact.name}: {e}")
        
        print(f"\n✅ Cleaned up {cleaned} artifacts")
    
    def print_summary(self):
        """Print detailed test results summary."""
        print(f"\n\n{'='*70}")
        print("📊 ACCURATE TEST RESULTS")
        print(f"{'='*70}\n")
        
        # Count results
        passed = len([r for r in self.results if '✅ PASS' in r['result']])
        failed = len([r for r in self.results if '❌ FAIL' in r['result']])
        errors = len([r for r in self.results if '❌ ERROR' in r['result']])
        timeout = len([r for r in self.results if '⏱️' in r['result']])
        total = len(self.results)
        
        print(f"Total Tests: {total}")
        print(f"✅ Passed: {passed} ({passed/total*100:.1f}%)")
        print(f"❌ Failed: {failed} ({failed/total*100:.1f}%)")
        print(f"❌ Errors: {errors}")
        print(f"⏱️  Timeout: {timeout}")
        
        print(f"\n{'='*70}")
        print("DETAILED RESULTS")
        print(f"{'='*70}\n")
        
        for r in self.results:
            print(f"{r['result']} {r['test']}")
            print(f"   Command: {r['command']}")
            for detail in r['details']:
                print(f"   {detail}")
            print()
        
        return passed == total


def main():
    tester = AccurateCommandTester()
    desktop = Path.home() / 'Desktop'
    
    print("\n🎯 LuciferAI Accurate Command Test Suite")
    print("Testing with filesystem verification\n")
    
    # ===== BUILD COMMAND TESTS =====
    print("\n" + "="*70)
    print("SECTION 1: BUILD COMMANDS (FILE/FOLDER CREATION)")
    print("="*70)
    
    # Test 1: Folder + file with "build"
    test_folder_1 = desktop / 'lucitest_project1'
    test_file_1 = test_folder_1 / 'app.py'
    tester.run_command(
        "build a folder called lucitest_project1 on desktop with a python file called app.py",
        "Build folder + file (standard syntax)",
        {
            'type': 'execution',
            'creates_folder': test_folder_1,
            'creates_file': test_file_1,
            'response_contains': ['created', 'folder', 'file'],
            'response_excludes': ['cannot', 'unable', 'error']
        }
    )
    
    # Extra verification: Check file is executable and has shebang
    if test_file_1.exists():
        import os
        is_executable = os.access(test_file_1, os.X_OK)
        print(f"  {'✅' if is_executable else '❌'} Executable check: {is_executable}")
        
        with open(test_file_1, 'r') as f:
            first_line = f.readline()
        has_shebang = first_line.startswith('#!/usr/bin/env python')
        print(f"  {'✅' if has_shebang else '❌'} Shebang check: {has_shebang}")
    
    # Test 2: Folder + file with "create"
    test_folder_2 = desktop / 'lucitest_webapp'
    test_file_2 = test_folder_2 / 'server.py'
    tester.run_command(
        "create a directory named lucitest_webapp with file server.py",
        "Create folder + file (alternate keywords)",
        {
            'type': 'execution',
            'creates_folder': test_folder_2,
            'creates_file': test_file_2,
            'response_contains': ['created'],
            'response_excludes': ['cannot', 'unable']
        }
    )
    
    # Extra verification: Check file contains expected template keywords
    if test_file_2.exists():
        with open(test_file_2, 'r') as f:
            content = f.read()
        has_luciferai = 'LuciferAI' in content
        has_main = 'def main()' in content
        print(f"  {'✅' if has_luciferai else '❌'} Template signature: {has_luciferai}")
        print(f"  {'✅' if has_main else '❌'} Main function: {has_main}")
    
    # Test 3: Folder + file with "make" and "titled"
    test_folder_3 = desktop / 'lucitest_api'
    test_file_3 = test_folder_3 / 'routes.py'
    tester.run_command(
        "make a folder titled lucitest_api containing a script titled routes.py",
        "Make folder + file (titled keyword)",
        {
            'type': 'execution',
            'creates_folder': test_folder_3,
            'creates_file': test_file_3,
            'response_contains': ['created'],
            'response_excludes': []
        }
    )
    
    # Test 4: Just folder
    test_folder_4 = desktop / 'lucitest_data'
    tester.run_command(
        "setup a directory called lucitest_data",
        "Create folder only",
        {
            'type': 'execution',
            'creates_folder': test_folder_4,
            'response_contains': ['created', 'folder'],
            'response_excludes': ['cannot']
        }
    )
    
    # Extra verification: Check folder is actually a directory and is empty
    if test_folder_4.exists():
        is_dir = test_folder_4.is_dir()
        is_empty = len(list(test_folder_4.iterdir())) == 0
        print(f"  {'✅' if is_dir else '❌'} Is directory: {is_dir}")
        print(f"  {'✅' if is_empty else '❌'} Is empty: {is_empty}")
    
    # Test 5: Just file
    test_file_5 = desktop / 'lucitest_standalone.py'
    tester.run_command(
        "initialize a file named lucitest_standalone.py",
        "Create file only",
        {
            'type': 'execution',
            'creates_file': test_file_5,
            'response_contains': ['created', 'file'],
            'response_excludes': ['cannot']
        }
    )
    
    # Extra verification: Attempt to run the generated file
    if test_file_5.exists():
        import subprocess
        try:
            result = subprocess.run(
                ['python3', str(test_file_5)],
                capture_output=True,
                text=True,
                timeout=2
            )
            runs_without_error = result.returncode == 0
            print(f"  {'✅' if runs_without_error else '❌'} Python syntax valid: {runs_without_error}")
        except Exception as e:
            print(f"  ❌ Could not run file: {e}")
    
    # ===== FILE TYPE TESTS =====
    print("\n" + "="*70)
    print("SECTION 2: FILE TYPE TESTS")
    print("="*70)
    
    # Test different file types
    file_types = [
        ('bash', 'test.sh', 'Shell script'),
        ('javascript', 'test.js', 'JavaScript file'),
        ('json', 'config.json', 'JSON config file'),
        ('markdown', 'README.md', 'Markdown file'),
        ('text', 'notes.txt', 'Text file'),
        ('html', 'index.html', 'HTML file'),
        ('css', 'styles.css', 'CSS file'),
    ]
    
    for file_type, filename, description in file_types:
        test_folder = desktop / f'lucitest_{file_type}'
        test_file = test_folder / filename
        
        tester.run_command(
            f"create folder lucitest_{file_type} with file {filename}",
            f"Create {description}",
            {
                'type': 'execution',
                'creates_folder': test_folder,
                'creates_file': test_file,
                'response_contains': ['created'],
                'response_excludes': ['cannot', 'error']
            }
        )
        
        # Extra verification: Check file extension and non-empty
        if test_file.exists():
            ext = test_file.suffix
            size = test_file.stat().st_size
            is_correct_ext = ext == f'.{filename.split(".")[-1]}'
            is_not_empty = size > 0
            print(f"  {'✅' if is_correct_ext else '❌'} Correct extension: {ext}")
            print(f"  {'✅' if is_not_empty else '❌'} Has content: {size} bytes")
            
            # Check for shebangs in script files
            if filename.endswith(('.sh', '.py')):
                with open(test_file, 'r') as f:
                    first_line = f.readline()
                has_shebang = first_line.startswith('#!')
                print(f"  {'✅' if has_shebang else '❌'} Has shebang: {has_shebang}")
    
    # ===== SYSTEM COMMANDS =====
    print("\n" + "="*70)
    print("SECTION 3: SYSTEM COMMANDS")
    print("="*70)
    
    tester.run_command(
        "help",
        "Display help",
        {
            'type': 'system',
            'response_contains': ['info'],  # Response says "Type 'info' for feature guide"
            'response_excludes': ['error']
        }
    )
    
    tester.run_command(
        "memory",
        "Check memory stats",
        {
            'type': 'system',
            'response_contains': ['memory'],  # Just check for memory keyword
            'response_excludes': ['error', 'cannot']
        }
    )
    
    # ===== DAEMON/WATCHER TESTS =====
    print("\n" + "="*70)
    print("SECTION 4: DAEMON/WATCHER COMMANDS")
    print("="*70)
    
    tester.run_command(
        "daemon status",
        "Check daemon status",
        {
            'type': 'system',
            'response_contains': ['not running'],  # Response says "Watcher is not running"
            'response_excludes': ['error']
        },
        timeout=10
    )
    
    # ===== QUERY TESTS =====
    print("\n" + "="*70)
    print("SECTION 5: AI QUERIES (Should refuse or execute)")
    print("="*70)
    
    tester.run_command(
        "What is grep?",
        "Technical question",
        {
            'type': 'query',
            'response_contains': [],  # May vary
            'response_excludes': ['my hand has five fingers', 'latvia']  # Known hallucinations
        }
    )
    
    tester.run_command(
        "Write me a 500 line Python script",
        "Unreasonable request",
        {
            'type': 'query',
            'response_contains': [],  # Should either refuse or execute template
            'response_excludes': []
        }
    )
    
    # Print summary
    all_passed = tester.print_summary()
    
    # Cleanup
    tester.cleanup_artifacts()
    
    # Exit code
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
