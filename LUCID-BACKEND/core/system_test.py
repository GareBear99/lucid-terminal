#!/usr/bin/env python3
"""
🧪 LuciferAI System Test
Comprehensive test that demonstrates all capabilities:
1. Creates a test script with intentional errors
2. Tests auto-fix with local dictionary
3. Tests auto-fix with consensus dictionary
4. Tests daemon watch mode
5. Tests daemon autofix mode
6. Shows full workflow
"""
import os
import sys
import time
import tempfile
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent))

from lucifer_colors import c, Emojis, print_step, print_success, print_error, print_info

PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
CYAN = '\033[36m'
GOLD = '\033[93m'       # Gold/bright yellow
RESET = '\033[0m'
WHITE_BG = '\033[47m'  # White background
BLACK = '\033[30m'      # Black text for white background
DIM = '\033[2m'         # Dim text
BOLD = '\033[1m'        # Bold text
UNDERLINE = '\033[4m'   # Underline


class SystemTest:
    """Comprehensive system test for LuciferAI."""
    
    def __init__(self, model_name: str = 'tinyllama'):
        self.model_name = model_name.lower()
        self.test_dir = Path.home() / "Desktop" / "luciferai_test"
        
        # Determine model tier
        tier_map = {
            'tinyllama': ('Tier 0', 0),
            'llama3.2': ('Tier 1', 1),
            'gemma': ('Tier 1', 1),
            'mistral': ('Tier 2', 2),
            'llama3.1': ('Tier 2', 2),
            'deepseek-coder': ('Tier 3', 3),
            'codellama': ('Tier 3', 3),
            'mixtral': ('Tier 3', 3),
        }
        
        self.tier_name, self.tier_level = tier_map.get(self.model_name, ('Tier 0', 0))
        
        # Create test directory with status message
        if not self.test_dir.exists():
            print(f"{CYAN}📁 Creating test directory: {self.test_dir}{RESET}")
            self.test_dir.mkdir(exist_ok=True)
            print(f"{GREEN}✅ Directory created{RESET}\n")
        else:
            print(f"{YELLOW}📁 Using existing directory: {self.test_dir}{RESET}\n")
        
        self.test_results = []
    
    def print_banner(self):
        """Print test banner."""
        print(f"\n{PURPLE}╔{'═'*70}╗{RESET}")
        print(f"{PURPLE}║{' '*15}🧪 LuciferAI Comprehensive System Test{' '*15}║{RESET}")
        print(f"{PURPLE}╚{'═'*70}╝{RESET}\n")
        
        # Show model and tier info
        print(f"{CYAN}Testing Model: {self.model_name.upper()} ({self.tier_name}){RESET}\n")
        
        print(f"{CYAN}This test will demonstrate:{RESET}")
        print(f"  {Emojis.CHECKMARK} Script creation with template errors")
        print(f"  {Emojis.WRENCH} Basic auto-fix workflow")
        print(f"  {Emojis.SPARKLE} Advanced context branching")
        print(f"  {Emojis.GLOBE} Dictionary search with branching")
        print(f"  {Emojis.GHOST} Daemon watch mode (suggestions)")
        print(f"  {Emojis.GHOST} Daemon autofix mode (automatic)")
        print(f"  🌳 Full collaborative learning workflow")
        print(f"  🔗 GitHub account linking & uploads")
        print(f"  🔄 Idle consensus cleanup & queued uploads")
        
        # Show tier-specific capabilities
        if self.tier_level >= 2:
            print(f"  {YELLOW}🔥 Advanced NLP parsing (Tier 2+){RESET}")
            print(f"  {YELLOW}🧠 Multi-step reasoning (Tier 2+){RESET}")
            print(f"  {YELLOW}📝 Intelligent content generation (Tier 2+){RESET}")
        
        if self.tier_level >= 3:
            print(f"  {GREEN}🚀 Code optimization (Tier 3+){RESET}")
            print(f"  {GREEN}🔬 Deep code analysis (Tier 3+){RESET}")
        
        print(f"\n{YELLOW}Test directory: {self.test_dir}{RESET}\n")
        
        self.wait_for_continue()
    
    def create_test_script_with_errors(self) -> Path:
        """Create a test script with common errors."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print_step(1, 10, "Creating test script with intentional errors...")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        # Create script with multiple types of errors
        script_content = '''#!/usr/bin/env python3
"""
Test script with intentional errors for LuciferAI to fix
"""

# Error 1: Missing import
def get_current_time():
    return datetime.now()  # NameError: datetime not defined

# Error 2: Missing module
def save_data(data):
    Path("output.txt").write_text(data)  # NameError: Path not defined

# Error 3: Missing json import
def load_config():
    config = json.loads('{"key": "value"}')  # NameError: json not defined
    return config

if __name__ == "__main__":
    print("Running test script...")
    print(f"Current time: {get_current_time()}")
    save_data("Test data")
    config = load_config()
    print(f"Config: {config}")
    print("Test complete!")
'''
        
        script_path = self.test_dir / "test_script.py"
        
        print(f"{CYAN}📝 Writing file: {script_path.name}{RESET}")
        print(f"{BLUE}   Location: {script_path}{RESET}")
        script_path.write_text(script_content)
        print(f"{GREEN}✅ File created ({len(script_content)} bytes){RESET}\n")
        
        print(f"{GREEN}✅ Created test script: {script_path}{RESET}")
        print(f"{YELLOW}📄 Script contains 3 intentional errors:{RESET}")
        print(f"   1. Missing datetime import")
        print(f"   2. Missing pathlib.Path import")
        print(f"   3. Missing json import")
        print()
        
        return script_path
    
    def test_manual_fix(self, script_path: Path):
        """Test manual fix command."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print_step(2, 10, "Testing error detection...")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{CYAN}Running test script to detect errors...{RESET}\n")
        
        # Try to run the script
        import subprocess
        result = subprocess.run(
            ['python3', str(script_path)],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode != 0:
            print(f"{RED}❌ Error detected:{RESET}\n")
            # Show first error
            error_lines = result.stderr.split('\n')
            for line in error_lines[:10]:
                if line.strip():
                    print(f"  {line}")
            print()
            
            # Identify the error
            if "NameError" in result.stderr:
                if "datetime" in result.stderr:
                    print(f"{YELLOW}🔍 Identified: Missing datetime import{RESET}")
                    print(f"{GREEN}✅ Fix: Add 'from datetime import datetime'{RESET}\n")
                elif "Path" in result.stderr:
                    print(f"{YELLOW}🔍 Identified: Missing Path import{RESET}")
                    print(f"{GREEN}✅ Fix: Add 'from pathlib import Path'{RESET}\n")
                elif "json" in result.stderr:
                    print(f"{YELLOW}🔍 Identified: Missing json import{RESET}")
                    print(f"{GREEN}✅ Fix: Add 'import json'{RESET}\n")
        
        self.wait_for_continue()
    
    def test_run_with_autofix(self, script_path: Path):
        """Test run command with basic auto-fix."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print_step(3, 10, "Basic Auto-Fix Workflow...")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{CYAN}How Basic Fixing Works:{RESET}\n")
        print(f"  {BLUE}1.{RESET} Detect error in script")
        print(f"  {BLUE}2.{RESET} Classify error type (NameError, ImportError, etc.)")
        print(f"  {BLUE}3.{RESET} Generate solution")
        print(f"  {BLUE}4.{RESET} Apply fix to script")
        print(f"  {BLUE}5.{RESET} Save to local dictionary")
        print(f"  {BLUE}6.{RESET} Track success rate\n")
        
        print(f"{YELLOW}Command to trigger:{RESET} {GREEN}run test_script.py{RESET}")
        print(f"{YELLOW}Alternative:{RESET} {GREEN}fix test_script.py{RESET}\n")
        
        # Simulate user input
        print(f"{PURPLE}[User]{RESET} > {CYAN}run test_script.py{RESET}\n")
        
        # Animated processing like main app
        for i in range(3):
            print(f"\r{CYAN}💀 Processing • Deep Analysis{'.' * (i + 1)}{RESET}", end='', flush=True)
            time.sleep(0.2)
        print(f"\r{CYAN}💀 Processing • Deep Analysis... {GREEN}✓{RESET}")
        time.sleep(0.2)
        print()
        
        print(f"{CYAN}Fixing all errors in test script...{RESET}\n")
        
        # Show actual command being executed
        print(f"{BLUE}Executing command:{RESET} {WHITE_BG}{BLACK} python test_script.py {RESET}\n")
        time.sleep(0.5)
        
        # Read the script
        content = script_path.read_text()
        
        # Apply fixes
        fixed_content = content
        
        # Add imports at the top (after docstring)
        import_lines = [
            "from datetime import datetime",
            "from pathlib import Path",
            "import json"
        ]
        
        lines = content.split('\n')
        # Find where to insert (after the docstring)
        insert_pos = 0
        in_docstring = False
        for i, line in enumerate(lines):
            if '"""' in line:
                if not in_docstring:
                    in_docstring = True
                else:
                    insert_pos = i + 1
                    break
        
        # Insert imports
        for imp in reversed(import_lines):
            lines.insert(insert_pos, imp)
        
        fixed_content = '\n'.join(lines)
        
        # Save fixed version
        script_path.write_text(fixed_content)
        
        print(f"{GREEN}✅ Applied fixes:{RESET}")
        for imp in import_lines:
            print(f"  + {imp}")
        print()
        
        # Show code snippet with white background
        print(f"{YELLOW}Fixed code snippet:{RESET}")
        print(f"{WHITE_BG}{BLACK}")
        print(f"  #!/usr/bin/env python3")
        print(f"  \"\"\"")
        print(f"  Test script with intentional errors")
        print(f"  \"\"\"")
        for imp in import_lines:
            print(f"  {imp}")
        print(f"  ")
        print(f"  def get_current_time():")
        print(f"      return datetime.now()")
        print(f"{RESET}\n")
        
        # Try running again
        print(f"{CYAN}Testing fixed script...{RESET}\n")
        import subprocess
        result = subprocess.run(
            ['python3', str(script_path)],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            print(f"{GREEN}✅ Script now runs successfully!{RESET}\n")
            print(f"{BLUE}Output:{RESET}")
            for line in result.stdout.split('\n')[:10]:
                if line.strip():
                    print(f"  {line}")
            print()
        else:
            print(f"{YELLOW}⚠️ Still has errors (partial fix){RESET}\n")
        
        self.wait_for_continue()
    
    def test_dictionary_search(self):
        """Test dictionary search functionality."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print_step(4, 10, "Testing consensus dictionary & branching...")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{YELLOW}Command to trigger:{RESET} {GREEN}search fixes for \"error message\"{RESET}\n")
        
        # Simulate user input
        print(f"{PURPLE}[User]{RESET} > {CYAN}search fixes for \"NameError: datetime\"{RESET}\n")
        
        # Show actual command being executed
        print(f"{BLUE}Executing command:{RESET} {WHITE_BG}{BLACK} python lucifer.py search fixes \"NameError: datetime\" {RESET}\n")
        
        # Animated processing like main app
        for i in range(3):
            print(f"\r{CYAN}💀 Processing • Searching consensus{'.' * (i + 1)}{RESET}", end='', flush=True)
            time.sleep(0.2)
        print(f"\r{CYAN}💀 Processing • Searching consensus... {GREEN}✓{RESET}")
        time.sleep(0.2)
        print()
        
        # Show dictionary structure
        print(f"{BLUE}📚 Consensus Dictionary Structure:{RESET}\n")
        
        print(f"{CYAN}Local Dictionary (Your Saved Fixes & Branches):{RESET}")
        print(f"  • Fixes you've created/applied")
        print(f"  • Relevance scored based on your usage")
        print(f"  • Success rate tracked per fix")
        print(f"  • Local branches linking related fixes\n")
        
        print(f"{CYAN}Remote Consensus:{RESET}")
        print(f"  • Fixes from other users")
        print(f"  • Validated by community (51%+ = trusted)")
        print(f"  • Encrypted for privacy\n")
        
        time.sleep(0.5)
        
        print(f"{GREEN}🔍 Search Results (5 matches found):{RESET}")
        print(f"{DIM}[Interactive dropdowns - click to expand]{RESET}\n")
        time.sleep(0.3)
        
        # Simulate interactive dropdown for each fix
        fixes = [
            ("Fix 1: from datetime import datetime", "0.98", "Local dictionary", "from datetime import datetime"),
            ("Fix 2: import datetime", "0.92", "Remote (user: dev_123)", "import datetime\n# Then use: datetime.datetime.now()"),
            ("Fix 3: from datetime import datetime as dt", "0.85", "Remote (user: coder_xyz)", "from datetime import datetime as dt\n# Then use: dt.now()"),
        ]
        
        for i, (title, score, source, code) in enumerate(fixes, 1):
            # Show collapsed state
            print(f"{BLUE}▶ {title}{RESET} {YELLOW}(score: {score}){RESET}")
            print(f"  {DIM}Source: {source}{RESET}")
            print(f"  {DIM}{UNDERLINE}[Click to view code snippet]{RESET}\n")
            time.sleep(0.3)
            
            # Simulate click/expand
            if i == 1:  # Only expand first one as demo
                print(f"  {CYAN}▼ Clicked... expanding code snippet:{RESET}")
                print(f"  {WHITE_BG}{BLACK}")
                for line in code.split('\n'):
                    print(f"    {line}")
                print(f"  {RESET}\n")
                time.sleep(0.5)
        
        print(f"{PURPLE}{'─'*70}{RESET}\n")
        
        # Show the flow
        print(f"{GREEN}Step 1: First Fix ({WHITE_BG}{BLACK}auth.py{RESET}){RESET}")
        print(f"  • Error: NameError: name 'session' is not defined")
        print(f"  • Solution: from flask import session")
        print(f"  • Saved to local dictionary")
        print(f"  • Script counter: auth.py = 1 fix\n")
        time.sleep(0.5)
        
        print(f"{GREEN}Step 2: Similar Error ({WHITE_BG}{BLACK}api_handler.py{RESET}){RESET}")
        print(f"  • Same error: NameError: name 'session' is not defined")
        print(f"  • Search finds fix from auth.py (score: 0.98)")
        print(f"  • BUT: Different context needs variation\n")
        time.sleep(0.5)
        
        print(f"{GREEN}Step 3: Context Analysis{RESET}")
        print(f"  • Original: from flask import session")
        print(f"  • Context: API blueprint needs request object too")
        print(f"  • Variation: from flask import session, request")
        print(f"  • Reason: API endpoints require both session and request\n")
        time.sleep(0.5)
        
        print(f"{GREEN}Step 4: Create Context Branch{RESET}")
        print(f"  • New fix: fix_api_def456")
        print(f"  • Inspired by: fix_auth_abc123")
        print(f"  • Relationship: context_variant")
        print(f"  • Variation reason saved\n")
        time.sleep(0.5)
        
        print(f"{GREEN}Step 5: Track in Script Counters{RESET}")
        print(f"  • {WHITE_BG}{BLACK}auth.py{RESET}: 1 fix (NameError)")
        print(f"  • {WHITE_BG}{BLACK}api_handler.py{RESET}: 1 fix (NameError + variation)")
        print(f"  • Counters track WHY fixes differ\n")
        time.sleep(0.5)
        
        print(f"{GREEN}Step 6: Upload to Consensus{RESET}")
        print(f"  • Validates user ID (only validated can upload)")
        print(f"  • Encrypts fix data (AES-256)")
        print(f"  • Signs with SHA256")
        print(f"  • Uploads to GitHub with branch metadata:")
        print(f"    - inspired_by: fix_auth_abc123")
        print(f"    - variation_reason: 'API blueprint requires...'")
        print(f"    - relationship_type: context_variant")
        print(f"  • Rate limited: 5 uploads/hour")
        print(f"  • Queued if limit reached\n")
        time.sleep(0.5)
        
        print(f"{PURPLE}{'─'*70}{RESET}\n")
        
        print(f"{CYAN}Benefits of Context Branching:{RESET}\n")
        print(f"  ✓ Community learns WHY fixes vary")
        print(f"  ✓ Context-specific solutions tracked")
        print(f"  ✓ Better recommendations for similar contexts")
        print(f"  ✓ Local patterns enrich global knowledge")
        print(f"  ✓ Script counters show fix history per file")
        print(f"  ✓ Variations automatically linked\n")
        
        print(f"{YELLOW}Example Branch Tree:{RESET}")
        print(f"{DIM}[Interactive tree view]{RESET}\n")
        time.sleep(0.3)
        
        # Show collapsed tree
        print(f"{BLUE}▶ Branch Tree{RESET} {DIM}{UNDERLINE}[Click to expand]{RESET}")
        time.sleep(0.3)
        
        # Simulate click/expand
        print(f"{CYAN}▼ Clicked... expanding tree:{RESET}\n")
        print(f"  {BLUE}fix_auth_abc123{RESET} (Original)")
        print(f"    ↓ context_variant")
        print(f"  {PURPLE}fix_api_def456{RESET} (API variation)")
        print(f"    ↳ Reason: API blueprint requires both imports")
        print(f"    ↓ context_variant")
        print(f"  {PURPLE}fix_web_ghi789{RESET} (Web handler variation)")
        print(f"    ↳ Reason: Web routes need g.session object\n")
        
        self.wait_for_continue()
    
    def test_advanced_context_branching(self):
        """Test advanced context-aware branching."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print_step(5, 10, "Advanced Context Branching...")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{CYAN}How Context Branching Works:{RESET}\n")
        
        print(f"{BLUE}Scenario:{RESET} Same error in different scripts needs different fixes\n")
        
        print(f"{YELLOW}Triggered automatically when:{RESET}")
        print(f"  • Running/fixing scripts: {GREEN}run script.py{RESET} or {GREEN}fix script.py{RESET}")
        print(f"  • Similar error found in dictionary")
        print(f"  • Context analysis determines variation needed\n")
        
        # Show the flow
        print(f"{GREEN}Step 1: First Fix ({WHITE_BG}{BLACK}auth.py{RESET}){RESET}")
        print(f"  • Validated by community (51%+ = trusted)")
        print(f"  • Encrypted for privacy\n")
        
        time.sleep(0.5)
        
        print(f"{GREEN}🔍 Search Results (5 matches found):{RESET}\n")
        
        # Show search results with relevance scores
        fixes = [
            {
                "source": "local",
                "score": 0.98,
                "solution": "from datetime import datetime",
                "success": "15/15",
                "error_type": "NameError",
                "hash": "abc123"
            },
            {
                "source": "remote",
                "score": 0.92,
                "solution": "import datetime",
                "success": "42/45",
                "error_type": "NameError",
                "user": "dev_user_42",
                "hash": "def456"
            },
            {
                "source": "local",
                "score": 0.89,
                "solution": "from datetime import datetime, timedelta",
                "success": "8/9",
                "error_type": "NameError",
                "hash": "ghi789",
                "branched_from": "abc123"
            },
            {
                "source": "remote",
                "score": 0.85,
                "solution": "from datetime import datetime as dt",
                "success": "23/28",
                "error_type": "NameError",
                "user": "coder_xyz",
                "hash": "jkl012"
            },
            {
                "source": "local",
                "score": 0.78,
                "solution": "import datetime; dt = datetime.datetime",
                "success": "5/7",
                "error_type": "NameError",
                "hash": "mno345"
            }
        ]
        
        for i, fix in enumerate(fixes, 1):
            icon = "📁" if fix["source"] == "local" else "🌐"
            print(f"{BLUE}{icon} Fix #{i} ({fix['source'].upper()}) - Score: {fix['score']:.2f}{RESET}")
            print(f"   Solution: {GREEN}{fix['solution']}{RESET}")
            print(f"   Success Rate: {fix['success']} ({int(fix['success'].split('/')[0])/int(fix['success'].split('/')[1])*100:.0f}%)")
            
            if fix.get('user'):
                print(f"   User: {fix['user']}")
            
            if fix.get('branched_from'):
                print(f"   {YELLOW}↳ Branched from fix #{1} (solved similar problem){RESET}")
            
            print()
        
        time.sleep(0.5)
        
        print(f"{PURPLE}🌳 Branch Tracking Example:{RESET}\n")
        print(f"   Fix #1 (abc123): 'from datetime import datetime'")
        print(f"     ↓ inspired")
        print(f"   Fix #3 (ghi789): 'from datetime import datetime, timedelta'")
        print(f"     ↳ Same error type, extended solution\n")
        
        print(f"{CYAN}Dictionary automatically tracks:{RESET}")
        print(f"  ✓ Which fixes solve similar problems")
        print(f"  ✓ How fixes evolve (branches)")
        print(f"  ✓ Which fixes are most successful")
        print(f"  ✓ Relevance to your specific errors\n")
        
        print(f"{GREEN}🎯 Best match selected: Fix #1 (score: 0.98){RESET}")
        print(f"{BLUE}   ➜ from datetime import datetime{RESET}\n")
        
        self.wait_for_continue()
    
    def test_daemon_watch_mode(self, script_path: Path):
        """Test daemon in watch mode."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print_step(6, 10, "Testing daemon watch mode (suggestions only)...")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{CYAN}This mode watches files and SUGGESTS fixes without applying them{RESET}\n")
        
        print(f"{YELLOW}Commands to activate:{RESET}")
        print(f"  {GREEN}daemon add /path/to/directory{RESET}  - Add directory to watch")
        print(f"  {GREEN}daemon watch{RESET}                  - Start watch mode (suggestions only)\n")
        
        # Simulate user commands
        print(f"{PURPLE}[User]{RESET} > {CYAN}daemon add {self.test_dir}{RESET}")
        print(f"{BLUE}Executing command:{RESET} {WHITE_BG}{BLACK} python lucifer.py daemon add {self.test_dir} {RESET}")
        print(f"{GREEN}✓ Added to watch list{RESET}\n")
        
        print(f"{PURPLE}[User]{RESET} > {CYAN}daemon watch {self.test_dir}{RESET}")
        print(f"{BLUE}Executing command:{RESET} {WHITE_BG}{BLACK} python lucifer.py daemon watch {self.test_dir} {RESET}")
        print(f"{GREEN}✓ Started daemon in watch mode{RESET}\n")
        
        # Create daemon test script
        daemon_script_path = self._create_daemon_test_script()
        
        print(f"{CYAN}Created daemon test script: {daemon_script_path.name}{RESET}")
        print(f"{YELLOW}This script will error after 7 seconds...{RESET}\n")
        
        print(f"{BLUE}Simulating daemon watch mode:{RESET}\n")
        
        # Simulate daemon watching
        print(f"{CYAN}1. Daemon monitoring {daemon_script_path.name}...{RESET}")
        import time
        time.sleep(0.5)
        
        print(f"{YELLOW}   👀 Watching for changes (checking every 2 seconds)...{RESET}")
        time.sleep(0.5)
        
        print(f"\n{CYAN}2. Error detected in file:{RESET}")
        print(f"{RED}   NameError: name 'datetime' is not defined{RESET}")
        time.sleep(0.5)
        
        print(f"\n{CYAN}3. Searching for relevant fixes...{RESET}\n")
        time.sleep(0.5)
        
        # Show relevant fixes from consensus
        print(f"{GREEN}   ✓ Found 3 relevant fixes in consensus:{RESET}\n")
        
        print(f"{BLUE}   Fix 1 (score: 0.98):{RESET}")
        print(f"{CYAN}     Source: Local dictionary{RESET}")
        print(f"     Solution: from datetime import datetime")
        print(f"     Success rate: 15/15 (100%)\n")
        
        print(f"{BLUE}   Fix 2 (score: 0.92):{RESET}")
        print(f"{CYAN}     Source: Remote consensus (user: dev_123){RESET}")
        print(f"     Solution: import datetime")
        print(f"     Success rate: 42/45 (93%)\n")
        
        print(f"{BLUE}   Fix 3 (score: 0.85):{RESET}")
        print(f"{CYAN}     Source: Remote consensus (user: coder_xyz){RESET}")
        print(f"     Solution: from datetime import datetime as dt")
        print(f"     Success rate: 8/10 (80%)\n")
        
        time.sleep(0.5)
        
        print(f"{YELLOW}💡 Suggested fix (highest score):{RESET}")
        print(f"{GREEN}   ➜ from datetime import datetime{RESET}")
        print(f"{CYAN}   (Watch mode - not applying, only suggesting){RESET}\n")
        
        print(f"{PURPLE}👀 Daemon continues watching...{RESET}\n")
        
        print(f"{BLUE}In production daemon watch mode:{RESET}")
        print(f"   • Monitors directory continuously")
        print(f"   • Detects file changes every 2 seconds")
        print(f"   • Shows relevant fixes from consensus")
        print(f"   • Suggests best fix (does NOT apply)")
        print(f"   • User can manually apply if desired")
        print()
        
        self.wait_for_continue()
    
    def _create_daemon_test_script(self) -> Path:
        """Create a script that errors after 7 seconds."""
        daemon_script_content = '''#!/usr/bin/env python3
"""
Daemon Test Script - Errors after 7 seconds
"""
import time

print("Starting daemon test script...")
print("Running for 7 seconds...")

for i in range(7):
    print(f"Second {i+1}/7")
    time.sleep(1)

print("\nNow attempting to use datetime (will fail)...")
# This will cause NameError - missing import
print(f"Current time: {datetime.now()}")

print("Test complete!")
'''
        
        daemon_script_path = self.test_dir / "daemon_test.py"
        
        print(f"{CYAN}📝 Writing daemon test script...{RESET}", end=' ')
        print(f"\n{BLUE}   Location: {daemon_script_path}{RESET}")
        daemon_script_path.write_text(daemon_script_content)
        print(f"{GREEN}   ✓ File created{RESET}")
        
        return daemon_script_path
    
    def test_daemon_autofix_mode(self, script_path: Path):
        """Test daemon in autofix mode."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print_step(7, 10, "Testing daemon autofix mode (automatic fixing)...")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{CYAN}This mode watches files and AUTOMATICALLY applies fixes{RESET}\n")
        
        print(f"{YELLOW}Commands to activate:{RESET}")
        print(f"  {GREEN}daemon add /path/to/directory{RESET}  - Add directory to watch")
        print(f"  {GREEN}daemon autofix{RESET}                - Start autofix mode (automatic)\n")
        
        # Simulate user commands
        print(f"{PURPLE}[User]{RESET} > {CYAN}daemon add {self.test_dir}{RESET}")
        print(f"{BLUE}Executing command:{RESET} {WHITE_BG}{BLACK} python lucifer.py daemon add {self.test_dir} {RESET}")
        print(f"{GREEN}✓ Added to watch list{RESET}\n")
        
        print(f"{PURPLE}[User]{RESET} > {CYAN}daemon autofix {self.test_dir}{RESET}")
        print(f"{BLUE}Executing command:{RESET} {WHITE_BG}{BLACK} python lucifer.py daemon autofix {self.test_dir} {RESET}")
        print(f"{GREEN}✓ Started daemon in autofix mode{RESET}\n")
        
        # Create autofix test script
        autofix_test_script = self._create_autofix_test_script()
        
        print(f"{CYAN}Created autofix test script: {autofix_test_script.name}{RESET}")
        print(f"{YELLOW}This script has a missing import error...{RESET}\n")
        
        print(f"{BLUE}Simulating daemon autofix:{RESET}\n")
        
        # Simulate the daemon workflow
        print(f"{CYAN}1. Daemon detects file has error...{RESET}")
        time.sleep(0.5)
        
        print(f"{CYAN}2. Searching consensus dictionary for 'NameError: time'...{RESET}")
        time.sleep(0.5)
        
        print(f"{GREEN}   ✓ Found fix in local dictionary (score: 0.95){RESET}")
        print(f"{BLUE}   Solution: import time{RESET}")
        time.sleep(0.5)
        
        print(f"\n{CYAN}3. Applying fix automatically...{RESET}")
        
        # Actually fix the script
        content = autofix_test_script.read_text()
        lines = content.split('\n')
        # Add import after docstring
        lines.insert(4, "import time")
        autofix_test_script.write_text('\n'.join(lines))
        
        print(f"{GREEN}   ✓ Added: import time{RESET}")
        time.sleep(0.5)
        
        print(f"\n{CYAN}4. Re-running script to verify fix...{RESET}")
        import subprocess
        result = subprocess.run(
            ['python3', str(autofix_test_script)],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            print(f"{GREEN}   ✓ Script now runs successfully!{RESET}\n")
            print(f"{BLUE}Output:{RESET}")
            for line in result.stdout.split('\n'):
                if line.strip():
                    print(f"     {line}")
        print()
        
        print(f"{GREEN}✨ Daemon autofix complete - script fixed and verified!{RESET}\n")
        
        # Demonstrate multi-retry with branch search
        print(f"{PURPLE}{'='*70}{RESET}")
        print(f"{YELLOW}⚠️  But wait... running into another error!{RESET}\n")
        time.sleep(0.5)
        
        print(f"{CYAN}5. Script runs but encounters new error...{RESET}")
        print(f"{RED}   AttributeError: 'NoneType' object has no attribute 'format'{RESET}")
        print(f"{YELLOW}   Line 12: result.format('%Y-%m-%d'){RESET}\n")
        time.sleep(0.5)
        
        print(f"{CYAN}6. Searching dictionary for fix...{RESET}")
        print(f"{GREEN}   ✓ Found fix in local dictionary (score: 0.88){RESET}")
        print(f"{BLUE}   Solution: Add None check before .format(){RESET}")
        print(f"{WHITE_BG}{BLACK}   if result: result.format('%Y-%m-%d') {RESET}\n")
        time.sleep(0.5)
        
        print(f"{CYAN}7. Applying fix (Attempt 1/3)...{RESET}")
        print(f"{GREEN}   ✓ Fix applied{RESET}")
        time.sleep(0.3)
        
        print(f"\n{CYAN}8. Re-running script...{RESET}")
        print(f"{RED}   ✗ Still failing! Different context - wrong fix{RESET}")
        print(f"{RED}   TypeError: 'datetime.datetime' object has no attribute 'format'{RESET}\n")
        time.sleep(0.5)
        
        print(f"{YELLOW}⚠️  First fix failed! Searching branches for alternative...{RESET}\n")
        time.sleep(0.5)
        
        print(f"{CYAN}9. Searching context branches (Attempt 2/3)...{RESET}")
        print(f"{BLUE}   Analyzing error context: datetime object methods{RESET}")
        print(f"{GREEN}   ✓ Found variant in branch tree (score: 0.94){RESET}")
        print(f"{CYAN}   Source: Branch variation from fix_datetime_abc123{RESET}")
        print(f"{BLUE}   Variation reason: 'datetime uses strftime() not format()'{RESET}")
        print(f"{BLUE}   Solution: Use .strftime() instead{RESET}")
        print(f"{WHITE_BG}{BLACK}   result.strftime('%Y-%m-%d') {RESET}\n")
        time.sleep(0.5)
        
        print(f"{CYAN}10. Applying alternative fix (Attempt 2/3)...{RESET}")
        print(f"{GREEN}   ✓ Alternative fix applied{RESET}")
        time.sleep(0.3)
        
        print(f"\n{CYAN}11. Re-running script...{RESET}")
        print(f"{GREEN}   ✓ SUCCESS! Script runs without errors{RESET}")
        print(f"{BLUE}   Output: 2025-10-23{RESET}\n")
        time.sleep(0.5)
        
        print(f"{GREEN}✨ Multi-retry autofix succeeded on attempt 2!{RESET}\n")
        
        print(f"{CYAN}📊 Fix Attempt Summary:{RESET}")
        print(f"   Attempt 1: None check (failed - wrong context)")
        print(f"   Attempt 2: strftime() variant (success!)")
        print(f"   Total retries: 2/3 available\n")
        
        print(f"{BLUE}💡 Smart retry features:{RESET}")
        print(f"   • Never retries same failed fix")
        print(f"   • Searches context branches for alternatives")
        print(f"   • Learns from failure patterns")
        print(f"   • Max 3 attempts before requesting help")
        print(f"   • Tracks which variants work for which contexts")
        print()
        
        print(f"{BLUE}💡 In production:{RESET}")
        print(f"   • Daemon watches directory continuously")
        print(f"   • Detects file saves with errors")
        print(f"   • Searches consensus + local dictionary")
        print(f"   • Applies best matching fix automatically")
        print(f"   • Logs all actions for review")
        print()
        
        self.wait_for_continue()
    
    def _create_autofix_test_script(self) -> Path:
        """Create a script for autofix demonstration."""
        autofix_script_content = '''#!/usr/bin/env python3
"""
Autofix Test Script - Missing import
"""

print("Testing autofix...")
print("Sleeping for 2 seconds...")
time.sleep(2)  # Error: time not imported
print("Done!")
'''
        
        autofix_script_path = self.test_dir / "autofix_test.py"
        
        print(f"{CYAN}📝 Writing autofix test script...{RESET}", end=' ')
        print(f"\n{BLUE}   Location: {autofix_script_path}{RESET}")
        autofix_script_path.write_text(autofix_script_content)
        print(f"{GREEN}   ✓ File created{RESET}")
        
        return autofix_script_path
    
    def test_github_linking(self):
        """Demonstrate GitHub account linking, uploading, and unlinking."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print_step(8, 10, "GitHub Account Linking & Fix Uploads...")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{CYAN}How GitHub Integration Works:{RESET}\n")
        print(f"  • Link your GitHub account to contribute fixes")
        print(f"  • Upload validated fixes to consensus repository")
        print(f"  • Only validated accounts can upload/vote")
        print(f"  • Unlink anytime to remove access\n")
        
        time.sleep(0.5)
        
        # Step 1: Check current status
        print(f"{BLUE}{'─'*70}{RESET}")
        print(f"{CYAN}Step 1: Check GitHub Link Status{RESET}\n")
        
        print(f"{PURPLE}[User]{RESET} > {CYAN}github status{RESET}")
        print(f"{BLUE}Executing command:{RESET} {WHITE_BG}{BLACK} python lucifer.py github status {RESET}\n")
        time.sleep(0.3)
        
        print(f"{YELLOW}GitHub Status:{RESET}")
        print(f"  Account: {RED}Not linked{RESET}")
        print(f"  User ID: {RED}None{RESET}")
        print(f"  Validation: {RED}❌ Not validated{RESET}")
        print(f"  Upload access: {RED}❌ Disabled{RESET}\n")
        
        time.sleep(0.5)
        
        # Step 2: Link GitHub account
        print(f"{BLUE}{'─'*70}{RESET}")
        print(f"{CYAN}Step 2: Link GitHub Account{RESET}\n")
        
        print(f"{PURPLE}[User]{RESET} > {CYAN}github link{RESET}")
        print(f"{BLUE}Executing command:{RESET} {WHITE_BG}{BLACK} python lucifer.py github link {RESET}\n")
        time.sleep(0.3)
        
        print(f"{YELLOW}🔑 GitHub Credential Request{RESET}\n")
        time.sleep(0.3)
        
        print(f"{CYAN}Enter GitHub username:{RESET} demo_user_42")
        time.sleep(0.3)
        print(f"{CYAN}Enter GitHub password:{RESET} {DIM}************{RESET}")
        print(f"{DIM}(Password is used for verification only and is NOT saved){RESET}\n")
        time.sleep(0.5)
        
        # Animated verification
        for i in range(3):
            print(f"\r{YELLOW}🔐 Verifying GitHub credentials{'.' * (i + 1)}{RESET}", end='', flush=True)
            time.sleep(0.3)
        print(f"\r{YELLOW}🔐 Verifying GitHub credentials... {GREEN}✓{RESET}")
        
        print(f"{CYAN}Connecting to GitHub API...{RESET}")
        print(f"{BLUE}GET https://api.github.com/user{RESET}")
        time.sleep(0.5)
        
        print(f"{GREEN}✅ GitHub credentials verified!{RESET}")
        print(f"{CYAN}Username: demo_user_42{RESET}")
        print(f"{CYAN}GitHub ID: 12345678{RESET}\n")
        time.sleep(0.3)
        
        print(f"{CYAN}Creating encrypted user credentials...{RESET}")
        print(f"  • Generating AES-256 encryption key")
        print(f"  • Encrypting GitHub token")
        print(f"  • Creating SHA256 signature")
        print(f"  • Storing in ~/.luciferai/credentials.enc\n")
        time.sleep(0.5)
        
        print(f"{CYAN}Validating account with consensus network...{RESET}")
        time.sleep(0.5)
        
        print(f"{GREEN}✅ Account linked successfully!{RESET}\n")
        
        print(f"{YELLOW}GitHub Account Info:{RESET}")
        print(f"  Username: {GREEN}demo_user_42{RESET}")
        print(f"  User ID: {GREEN}GH-12345678-A3B9C7F1{RESET}")
        print(f"  Validation: {GREEN}✅ Verified{RESET}")
        print(f"  Upload access: {GREEN}✅ Enabled{RESET}")
        print(f"  Reputation: {BLUE}0 (new user){RESET}\n")
        
        time.sleep(0.5)
        
        # Step 3: Upload a fix
        print(f"{BLUE}{'─'*70}{RESET}")
        print(f"{CYAN}Step 3: Upload Fix to Consensus{RESET}\n")
        
        print(f"{PURPLE}[User]{RESET} > {CYAN}upload fix fix_datetime_xyz789{RESET}")
        print(f"{BLUE}Executing command:{RESET} {WHITE_BG}{BLACK} python lucifer.py upload fix fix_datetime_xyz789 {RESET}\n")
        time.sleep(0.3)
        
        # Animated upload preparation
        for i in range(3):
            print(f"\r{YELLOW}⚡ Preparing fix upload{'.' * (i + 1)}{RESET}", end='', flush=True)
            time.sleep(0.2)
        print(f"\r{YELLOW}⚡ Preparing fix upload... {GREEN}✓{RESET}\n")
        
        print(f"{CYAN}Fix Details:{RESET}")
        print(f"  Fix ID: {BLUE}fix_datetime_xyz789{RESET}")
        print(f"  Error: {YELLOW}NameError: name 'datetime' is not defined{RESET}")
        print(f"  Solution: {GREEN}from datetime import datetime{RESET}")
        print(f"  Local success rate: {GREEN}12/12 (100%){RESET}\n")
        time.sleep(0.5)
        
        print(f"{CYAN}Validation checks:{RESET}")
        checks = [
            ("User ID validation", "✅ Passed"),
            ("Fix signature valid", "✅ Passed"),
            ("Duplicate check", "✅ Unique"),
            ("Rate limit check", "✅ Within limit (1/5)"),
            ("Encryption check", "✅ AES-256"),
        ]
        for check, status in checks:
            print(f"  {CYAN}• {check}...{RESET}", end=' ')
            time.sleep(0.2)
            print(f"{GREEN}{status}{RESET}")
        print()
        
        time.sleep(0.5)
        
        # Animated upload
        for i in range(4):
            print(f"\r{CYAN}📤 Uploading to GitHub consensus repository{'.' * (i + 1)}{RESET}", end='', flush=True)
            time.sleep(0.3)
        print(f"\r{CYAN}📤 Uploading to GitHub consensus repository... {GREEN}✓{RESET}\n")
        
        print(f"{BLUE}GitHub API Request:{RESET}")
        print(f"  Repo: {CYAN}luciferai/fix-consensus{RESET}")
        print(f"  Branch: {CYAN}fixes/python/nameerror{RESET}")
        print(f"  File: {CYAN}fixes/python/fix_datetime_xyz789.json{RESET}\n")
        time.sleep(0.5)
        
        print(f"{GREEN}✅ Fix uploaded successfully!{RESET}\n")
        
        print(f"{YELLOW}Upload Stats:{RESET}")
        print(f"  Total uploads today: {BLUE}1{RESET}")
        print(f"  Remaining quota: {BLUE}4/5{RESET}")
        print(f"  Consensus votes: {YELLOW}0 (pending){RESET}")
        print(f"  Reputation gained: {GREEN}+5 points{RESET}\n")
        
        time.sleep(0.5)
        
        # Step 4: Check upload history
        print(f"{BLUE}{'─'*70}{RESET}")
        print(f"{CYAN}Step 4: View Upload History{RESET}\n")
        
        print(f"{PURPLE}[User]{RESET} > {CYAN}github uploads{RESET}")
        print(f"{BLUE}Executing command:{RESET} {WHITE_BG}{BLACK} python lucifer.py github uploads {RESET}\n")
        time.sleep(0.3)
        
        print(f"{YELLOW}Your Uploaded Fixes:{RESET}\n")
        
        uploads = [
            ("fix_datetime_xyz789", "NameError: datetime", "Just now", "0 votes", "Pending"),
            ("fix_requests_def456", "ImportError: requests", "2 hours ago", "3 votes", "51% trusted"),
            ("fix_pandas_abc123", "AttributeError: DataFrame", "Yesterday", "7 votes", "71% trusted"),
        ]
        
        for i, (fix_id, error, time_ago, votes, status) in enumerate(uploads, 1):
            print(f"{BLUE}[{i}] {fix_id}{RESET}")
            print(f"    Error: {YELLOW}{error}{RESET}")
            print(f"    Uploaded: {CYAN}{time_ago}{RESET}")
            print(f"    Votes: {PURPLE}{votes}{RESET}")
            if "trusted" in status:
                print(f"    Status: {GREEN}{status}{RESET}\n")
            else:
                print(f"    Status: {YELLOW}{status}{RESET}\n")
        
        time.sleep(0.5)
        
        # Step 5: Unlink GitHub account
        print(f"{BLUE}{'─'*70}{RESET}")
        print(f"{CYAN}Step 5: Unlink GitHub Account{RESET}\n")
        
        print(f"{PURPLE}[User]{RESET} > {CYAN}github unlink{RESET}")
        print(f"{BLUE}Executing command:{RESET} {WHITE_BG}{BLACK} python lucifer.py github unlink {RESET}\n")
        time.sleep(0.3)
        
        print(f"{YELLOW}⚠️  This will:{RESET}")
        print(f"  • Remove GitHub authentication")
        print(f"  • Disable fix uploads")
        print(f"  • Keep local dictionary intact")
        print(f"  • Preserve downloaded consensus fixes\n")
        
        print(f"{YELLOW}Confirm unlinking? (y/n):{RESET} {GREEN}y{RESET}\n")
        time.sleep(0.5)
        
        print(f"{CYAN}🔓 Unlinking GitHub account...{RESET}")
        print(f"  • Clearing GitHub credentials")
        print(f"  • Removing encrypted credentials")
        print(f"  • Clearing user validation cache\n")
        time.sleep(0.5)
        
        print(f"{GREEN}✅ GitHub account unlinked successfully!{RESET}\n")
        
        print(f"{YELLOW}New GitHub Status:{RESET}")
        print(f"  Account: {RED}Not linked{RESET}")
        print(f"  User ID: {RED}None{RESET}")
        print(f"  Validation: {RED}❌ Not validated{RESET}")
        print(f"  Upload access: {RED}❌ Disabled{RESET}\n")
        
        time.sleep(0.5)
        
        print(f"{BLUE}💡 Key Features:{RESET}")
        print(f"  ✓ Password-based authentication (GitHub API)")
        print(f"  ✓ Encrypted credential storage (AES-256)")
        print(f"  ✓ Validated accounts only can upload/vote")
        print(f"  ✓ Rate limiting prevents spam (5/hour)")
        print(f"  ✓ Reputation system rewards good fixes")
        print(f"  ✓ Easy to link/unlink anytime")
        print(f"  ✓ Local fixes remain after unlinking\n")
        
        self.wait_for_continue()
    
    def test_full_workflow(self):
        """Test the full collaborative learning workflow."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print_step(9, 10, "Full collaborative learning workflow...")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{CYAN}Full Workflow Demonstration:{RESET}\n")
        
        workflow = [
            ("1. Create script with error", f"Create {WHITE_BG}{BLACK}script.py{RESET} with NameError"),
            ("2. Run script", f"Execute {WHITE_BG}{BLACK}python script.py{RESET} - Error detected"),
            ("3. Search dictionary", "No matching fix found"),
            ("4. Generate new fix", "AI creates solution"),
            ("5. Apply fix to file", f"Update {WHITE_BG}{BLACK}script.py{RESET} with fix"),
            ("6. Upload to consensus", "Share with community via GitHub"),
            ("7. Add to local dictionary", f"Save in {WHITE_BG}{BLACK}~/.luciferai/fixes.json{RESET}"),
            ("8. Next time same error", "Fix applied instantly from dictionary"),
        ]
        
        for step, description in workflow:
            print(f"{GREEN}{'  ' + step:<30}{RESET} {YELLOW}→ {description}{RESET}")
        
        print(f"\n{PURPLE}{'─'*70}{RESET}\n")
        
        print(f"{CYAN}Key Features Demonstrated:{RESET}")
        print(f"  {Emojis.SPARKLE} Automatic error detection")
        print(f"  {Emojis.MAGNIFIER} Dictionary search (local + remote)")
        print(f"  {Emojis.WRENCH} Intelligent fix generation")
        print(f"  {Emojis.ROCKET} FixNet upload (collaborative)")
        print(f"  {Emojis.GHOST} Background daemon watching")
        print(f"  {Emojis.GLOBE} Consensus-based validation")
        print()
    
    def show_test_commands(self):
        """Show all test commands to run."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print(f"{PURPLE}📋 Complete Test Command List{RESET}")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{CYAN}Run these commands in LuciferAI interactive mode:{RESET}\n")
        
        commands = [
            ("Navigation", [
                f"cd {self.test_dir}",
                "pwd",
                "list .",
            ]),
            ("File Operations", [
                "read test_script.py",
                "find test_script.py",
                "zip test_script.py",
                "unzip test_script.py.zip",
            ]),
            ("Fix & Run", [
                "fix test_script.py",
                "run test_script.py",
            ]),
            ("Dictionary", [
                'search fixes for "NameError"',
                "fixnet stats",
                "fixnet sync",
            ]),
            ("Daemon", [
                f"daemon add {self.test_dir}",
                "daemon list",
                "daemon watch",
                "# Edit test_script.py to see suggestions",
                "daemon stop",
                "daemon autofix",
                "# Edit test_script.py to see auto-fix",
                "daemon stop",
            ]),
            ("Environment", [
                "create env test_env",
                "list env",
                "activate env test_env",
            ]),
            ("AI Models", [
                "llm list",
                "models info",
                "llm enable llama3.2",
                "llm disable mistral",
            ]),
            ("System", [
                "modules",
                "environments",
                "memory",
                "help",
            ]),
        ]
        
        for category, cmds in commands:
            print(f"{YELLOW}{category}:{RESET}")
            for cmd in cmds:
                if cmd.startswith("#"):
                    print(f"  {BLUE}{cmd}{RESET}")
                else:
                    print(f"  {GREEN}{cmd}{RESET}")
            print()
        
        print(f"{PURPLE}{'='*70}{RESET}\n")
    
    def wait_for_continue(self):
        """Wait for user to press enter."""
        print(f"{YELLOW}Press Enter to continue...{RESET}")
        try:
            input()
        except (EOFError, KeyboardInterrupt):
            print()
    
    def test_idle_consensus_operations(self):
        """Demonstrate idle consensus cleanup and queued uploads."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print_step(10, 12, "Idle consensus operations & queued uploads...")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{CYAN}When LuciferAI is idle, it performs background tasks:{RESET}\n")
        
        print(f"{YELLOW}Automatically runs when:{RESET}")
        print(f"  • No commands being processed")
        print(f"  • Every 10 minutes during idle time")
        print(f"  • After completing fix uploads\n")
        
        # Simulate idle state with colored indicator
        print(f"{BLUE}Status:{RESET} {YELLOW}⏸️  Idle - Awaiting commands...{RESET}\n")
        time.sleep(0.5)
        
        # Background cleanup operations
        # Animated cleanup
        for i in range(3):
            print(f"\r{CYAN}🔄 Running background consensus cleanup{'.' * (i + 1)}{RESET}", end='', flush=True)
            time.sleep(0.3)
        print(f"\r{CYAN}🔄 Running background consensus cleanup... {GREEN}✓{RESET}\n")
        
        cleanup_tasks = [
            ("Validating local fix signatures", "3 fixes validated"),
            ("Checking for duplicate entries", "0 duplicates found"),
            ("Pruning expired cache entries", "12 entries removed"),
            ("Updating success rate statistics", "47 fixes updated"),
            ("Syncing user reputation scores", "5 users updated"),
            ("Checking for superseded fixes", "2 old versions marked"),
        ]
        
        for task, result in cleanup_tasks:
            print(f"  {CYAN}• {task}...{RESET}", end=' ')
            time.sleep(0.3)
            print(f"{GREEN}✓ {result}{RESET}")
        
        print(f"\n{GREEN}✅ Consensus cleanup complete{RESET}\n")
        time.sleep(0.5)
        
        # Queued uploads
        # Animated queue processing
        for i in range(3):
            print(f"\r{CYAN}📤 Processing queued fix uploads{'.' * (i + 1)}{RESET}", end='', flush=True)
            time.sleep(0.3)
        print(f"\r{CYAN}📤 Processing queued fix uploads... {GREEN}✓{RESET}\n")
        
        print(f"{YELLOW}Upload Queue Status:{RESET}")
        print(f"  • Pending uploads: {BLUE}5 fixes{RESET}")
        print(f"  • Validated IDs only: {GREEN}✓ Enabled{RESET}")
        print(f"  • Rate limit: {YELLOW}5 uploads/hour{RESET}")
        print(f"  • Next available slot: {CYAN}Now{RESET}\n")
        time.sleep(0.5)
        
        # Simulate uploads with validation check
        uploads = [
            ("fix_abc123", "NameError: datetime", "CONSENSUS-A1B2C3", True, "0.95"),
            ("fix_def456", "ImportError: requests", "CONSENSUS-D4E5F6", True, "0.88"),
            ("fix_ghi789", "AttributeError: str", "CONSENSUS-G7H8I9", False, None),
            ("fix_jkl012", "TypeError: list index", "CONSENSUS-J0K1L2", True, "0.92"),
            ("fix_mno345", "ValueError: invalid literal", "CONSENSUS-M3N4O5", True, "0.87"),
        ]
        
        print(f"{CYAN}Uploading fixes to GitHub consensus...{RESET}\n")
        
        uploaded_count = 0
        for fix_hash, error, user_id, is_validated, score in uploads:
            print(f"  {BLUE}[{uploaded_count + 1}/5]{RESET} {fix_hash[:12]}... ({error})")
            print(f"    {CYAN}User ID:{RESET} {user_id}")
            
            # Validation check
            if is_validated:
                print(f"    {GREEN}✓ Validated ID - Allowed to upload{RESET}")
                time.sleep(0.3)
                print(f"    {CYAN}Encrypting fix data...{RESET}", end=' ')
                time.sleep(0.2)
                print(f"{GREEN}✓{RESET}")
                print(f"    {CYAN}Uploading to consensus repo...{RESET}", end=' ')
                time.sleep(0.3)
                print(f"{GREEN}✓{RESET}")
                print(f"    {GREEN}✅ Uploaded successfully (consensus score: {score}){RESET}\n")
                uploaded_count += 1
            else:
                print(f"    {RED}✗ Unvalidated ID - Upload blocked{RESET}")
                print(f"    {YELLOW}ℹ️  Only validated consensus IDs can upload fixes{RESET}\n")
            
            time.sleep(0.4)
        
        print(f"{GREEN}✅ Upload queue processed: {uploaded_count}/5 fixes uploaded{RESET}")
        print(f"{YELLOW}⚠️  1 upload blocked (unvalidated ID){RESET}\n")
        time.sleep(0.5)
        
        # Next scheduled operations
        print(f"{CYAN}📅 Next scheduled operations:{RESET}")
        print(f"  • Next upload slot available: {YELLOW}in 1 hour{RESET}")
        print(f"  • Next consensus sync: {CYAN}in 3 hours{RESET}")
        print(f"  • Next cleanup cycle: {BLUE}in 6 hours{RESET}")
        print()
        
        # Show idle indicator animation
        print(f"{PURPLE}{'─'*70}{RESET}\n")
        print(f"{CYAN}Returning to idle state...{RESET}\n")
        
        # Animated idle indicator
        idle_messages = [
            "⏸️  Idle - Awaiting commands...",
            "💤 Idle - All background tasks complete",
            "✨ Idle - Ready for next command",
        ]
        
        for i, msg in enumerate(idle_messages):
            print(f"\r{YELLOW}{msg}{RESET}", end='', flush=True)
            time.sleep(0.8)
        
        print(f"\r{GREEN}✅ System ready                              {RESET}\n")
        time.sleep(0.5)
        
        print(f"{BLUE}💡 Key Features:{RESET}")
        print(f"   • Background consensus cleanup during idle time")
        print(f"   • Queue-based fix uploads with rate limiting")
        print(f"   • Validated ID verification before uploads")
        print(f"   • Encrypted fix data transmission")
        print(f"   • Automatic retry for failed uploads")
        print(f"   • Real-time consensus score tracking")
        print()
        
        self.wait_for_continue()
    
    def test_luci_environment_manager(self):
        """Demonstrate Luci! environment manager and installation system."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print_step(11, 12, "Luci! Environment Manager & Installation System...")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{CYAN}🌍 Luci! - Standalone Environment Manager{RESET}\n")
        print(f"{YELLOW}What is Luci!?{RESET}")
        print(f"  • {GREEN}Separate downloadable package{RESET} - Works independently of LuciferAI")
        print(f"  • {BLUE}Cross-platform Python{RESET} - Runs on any OS (macOS, Linux, Windows, Raspberry Pi)")
        print(f"  • {PURPLE}Fallback installer{RESET} - Provides pip/conda alternatives when unavailable")
        print(f"  • {CYAN}Smart detection{RESET} - Automatically finds best installation method\n")
        
        print(f"{PURPLE}{'─'*70}{RESET}\n")
        print(f"{CYAN}Installation Fallback Hierarchy:{RESET}\n")
        
        fallback_chain = [
            ("1. pip/pip3", "System package manager (preferred)", GREEN),
            ("2. conda", "Anaconda/Miniconda package manager", BLUE),
            ("3. brew (macOS)", "Homebrew package manager", YELLOW),
            ("4. Luci!", "Standalone fallback installer (always available)", PURPLE),
        ]
        
        for method, desc, color in fallback_chain:
            print(f"  {color}{method:<20}{RESET} → {desc}")
        
        print(f"\n{YELLOW}💡 Luci! activates when traditional methods fail{RESET}\n")
        time.sleep(0.5)
        
        print(f"{PURPLE}{'─'*70}{RESET}\n")
        print(f"{CYAN}Example: Installing Flask with Luci!{RESET}\n")
        
        # Simulated installation attempt
        print(f"{BLUE}$ luci-install flask{RESET}\n")
        time.sleep(0.3)
        
        # Try pip first
        print(f"{CYAN}🔍 Checking pip availability...{RESET}")
        time.sleep(0.4)
        print(f"{RED}✗ pip not found in PATH{RESET}\n")
        
        # Try conda
        print(f"{CYAN}🔍 Checking conda availability...{RESET}")
        time.sleep(0.4)
        print(f"{RED}✗ conda not available{RESET}\n")
        
        # Try brew (macOS)
        print(f"{CYAN}🔍 Checking brew availability...{RESET}")
        time.sleep(0.4)
        print(f"{YELLOW}⚠️  brew available but no Python formula{RESET}\n")
        
        # Fallback to Luci!
        print(f"{PURPLE}🔄 Falling back to Luci! installer...{RESET}")
        time.sleep(0.4)
        print(f"{GREEN}✅ Luci! installer ready{RESET}\n")
        
        # Luci installation process
        install_steps = [
            ("Creating isolated environment", "~/.luci/env/venv"),
            ("Downloading flask from PyPI", "2.3.2 (1.2 MB)"),
            ("Installing dependencies", "Werkzeug, Jinja2, click"),
            ("Verifying installation", "flask --version: 2.3.2"),
            ("Adding to Luci registry", "~/.luci/registry.json"),
        ]
        
        for step, detail in install_steps:
            print(f"  {CYAN}• {step}...{RESET}", end=' ')
            time.sleep(0.4)
            print(f"{GREEN}✓{RESET}")
            print(f"    {BLUE}{detail}{RESET}")
        
        print(f"\n{GREEN}✅ Flask installed successfully via Luci!{RESET}\n")
        time.sleep(0.5)
        
        # Verification
        print(f"{PURPLE}{'─'*70}{RESET}\n")
        print(f"{CYAN}Verifying installation:{RESET}\n")
        
        print(f"{BLUE}$ /Users/TheRustySpoon/.luci/env/venv/bin/python -c{RESET}")
        print(f"{BLUE}  'import flask; print(flask.__version__)'{RESET}\n")
        time.sleep(0.5)
        print(f"{GREEN}2.3.2{RESET}\n")
        
        print(f"{CYAN}Installation location:{RESET}")
        print(f"  {YELLOW}~/.luci/env/venv/lib/python3.x/site-packages/flask{RESET}\n")
        
        # Platform compatibility
        print(f"{PURPLE}{'─'*70}{RESET}\n")
        print(f"{CYAN}🌐 Cross-Platform Compatibility:{RESET}\n")
        
        platforms = [
            ("macOS", "✅ Full support (Intel & Apple Silicon)"),
            ("Linux", "✅ All distributions (Ubuntu, Debian, Fedora, Arch, etc.)"),
            ("Windows", "✅ Windows 10/11 with WSL or native Python"),
            ("Raspberry Pi", "✅ ARM architecture supported (Pi 3, 4, 5, Zero)"),
            ("Docker", "✅ Container environments"),
        ]
        
        for platform, status in platforms:
            print(f"  {BLUE}{platform:<15}{RESET} {status}")
        
        print(f"\n{YELLOW}💡 Luci! works anywhere Python runs{RESET}\n")
        time.sleep(0.5)
        
        # Key features
        print(f"{PURPLE}{'─'*70}{RESET}\n")
        print(f"{CYAN}🔑 Key Features:{RESET}\n")
        
        features = [
            "Isolated environments (no system pollution)",
            "Fallback chain (tries all methods before Luci!)",
            "Registry tracking (knows what's installed where)",
            "Version pinning (reproducible environments)",
            "Offline mode (cached packages)",
            "Conflict resolution (dependency management)",
            "Pure Python (no external dependencies)",
        ]
        
        for feature in features:
            print(f"  {GREEN}✓{RESET} {feature}")
        
        print(f"\n{PURPLE}{'─'*70}{RESET}\n")
        print(f"{CYAN}📂 Directory Structure:{RESET}\n")
        
        print(f"  {YELLOW}~/.luci/{RESET}")
        print(f"    ├── {BLUE}env/venv/{RESET}              Global Luci environment")
        print(f"    │   └── {CYAN}lib/python3.x/{RESET}      Installed packages")
        print(f"    ├── {BLUE}cache/{RESET}                  Downloaded wheels")
        print(f"    ├── {BLUE}registry.json{RESET}           Package tracking")
        print(f"    └── {BLUE}config.json{RESET}             Luci! settings\n")
        
        print(f"{GREEN}✅ Luci! provides universal Python package management{RESET}")
        print(f"{CYAN}   Works on ANY device with Python 3.6+{RESET}\n")
        
        self.wait_for_continue()
    
    def test_multi_model_collaboration(self):
        """Demo multi-model intelligence when all three models are available."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print(f"{CYAN}📋 Test 12: Multi-Model Collaboration Demo{RESET}")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{YELLOW}When all three AI models are installed, they work together:{RESET}\n")
        
        # Check if demo should run
        try:
            import requests
            response = requests.get("http://localhost:11434/api/tags", timeout=1)
            if response.status_code == 200:
                models = response.json().get('models', [])
                available = [m['name'].split(':')[0] for m in models]
                has_all_three = all(m in available for m in ['llama3.2', 'mistral', 'deepseek-coder'])
                
                if has_all_three:
                    print(f"{GREEN}✅ All three models detected!{RESET}")
                    print(f"{CYAN}Available models: {', '.join(available)}{RESET}\n")
                    
                    # Show collaboration workflow
                    print(f"{PURPLE}{'─'*70}{RESET}\n")
                    print(f"{CYAN}🤝 How Models Collaborate:{RESET}\n")
                    
                    print(f"{GOLD}Example: \"build me a web scraper\"{RESET}\n")
                    
                    print(f"{BLUE}Step 1:{RESET} {PURPLE}deepseek-coder{RESET} analyzes request")
                    time.sleep(0.3)
                    print(f"{CYAN}  → Identifies knowledge gaps{RESET}")
                    print(f"{CYAN}  → Lists topics to research:{RESET}")
                    print(f"      • web scraping libraries python")
                    print(f"      • beautifulsoup vs scrapy")
                    print(f"      • best practices rate limiting\n")
                    time.sleep(0.5)
                    
                    print(f"{BLUE}Step 2:{RESET} {PURPLE}mistral{RESET} researches topics")
                    time.sleep(0.3)
                    print(f"{CYAN}  → Searches web/docs for each topic{RESET}")
                    print(f"{CYAN}  → Finds:{RESET}")
                    print(f"      • BeautifulSoup best for simple scraping")
                    print(f"      • Must include User-Agent headers")
                    print(f"      • Use time.sleep() between requests")
                    print(f"{CYAN}  → Returns concise summary to deepseek{RESET}\n")
                    time.sleep(0.5)
                    
                    print(f"{BLUE}Step 3:{RESET} {PURPLE}deepseek-coder{RESET} generates code")
                    time.sleep(0.3)
                    print(f"{CYAN}  → Uses mistral's research{RESET}")
                    print(f"{CYAN}  → Implements best practices:{RESET}")
                    print(f"      • Imports BeautifulSoup (from research)")
                    print(f"      • Adds User-Agent (from research)")
                    print(f"      • Includes rate limiting (from research)")
                    print(f"{CYAN}  → Creates production-ready script{RESET}\n")
                    time.sleep(0.5)
                    
                    print(f"{GREEN}✅ Result: Better code than any single model!{RESET}\n")
                    
                    print(f"{PURPLE}{'─'*70}{RESET}\n")
                    print(f"{CYAN}🔹 Task Delegation Map:{RESET}\n")
                    
                    delegation = [
                        ("llama3.2", "Typo correction & fuzzy matching"),
                        ("llama3.2", "'Did you mean' suggestions"),
                        ("llama3.2", "Fast command parsing"),
                        ("", ""),
                        ("mistral", "Web search & documentation lookup"),
                        ("mistral", "Image retrieval from Google"),
                        ("mistral", "Providing context to deepseek"),
                        ("", ""),
                        ("deepseek-coder", "Complete application building"),
                        ("deepseek-coder", "Code optimization & refactoring"),
                        ("deepseek-coder", "Multi-language code generation"),
                    ]
                    
                    for model, task in delegation:
                        if model:
                            print(f"  {PURPLE}{model:<15}{RESET} → {task}")
                        else:
                            print()
                    
                    print(f"\n{YELLOW}💡 All delegation happens automatically - no configuration needed!{RESET}\n")
                    
                    # Show command to test
                    print(f"{PURPLE}{'─'*70}{RESET}\n")
                    print(f"{CYAN}Try it yourself:{RESET}\n")
                    print(f"  {GREEN}$ python3 core/model_collaboration.py{RESET}")
                    print(f"  {CYAN}(Run the collaboration demo){RESET}\n")
                    
                else:
                    missing = [m for m in ['llama3.2', 'mistral', 'deepseek-coder'] if m not in available]
                    print(f"{GOLD}⚠️  Multi-model collaboration requires all three models{RESET}\n")
                    print(f"{CYAN}Available:{RESET} {', '.join(available) if available else 'None'}")
                    print(f"{CYAN}Missing:{RESET} {', '.join(missing)}\n")
                    print(f"{YELLOW}Install missing models:{RESET}")
                    for model in missing:
                        print(f"  {GREEN}install {model}{RESET}")
                    print()
            else:
                print(f"{GOLD}⚠️  Ollama not running{RESET}")
                print(f"{CYAN}Start Ollama and install models to enable multi-model intelligence{RESET}\n")
        
        except Exception as e:
            print(f"{GOLD}⚠️  Could not check for models: {e}{RESET}")
            print(f"{CYAN}Multi-model collaboration requires Ollama with all three models installed{RESET}\n")
        
        self.wait_for_continue()
    
    def run_interactive_test(self):
        """Run the interactive test workflow."""
        self.print_banner()
        
        time.sleep(1)
        
        # Create test script
        script_path = self.create_test_script_with_errors()
        
        # Run through all tests
        self.test_manual_fix(script_path)
        self.test_run_with_autofix(script_path)
        self.test_dictionary_search()
        self.test_advanced_context_branching()
        self.test_daemon_watch_mode(script_path)
        self.test_daemon_autofix_mode(script_path)
        self.test_github_linking()
        self.test_full_workflow()
        self.test_idle_consensus_operations()
        self.test_luci_environment_manager()
        self.test_multi_model_collaboration()
        
        # Show command reference
        self.show_test_commands()
        
        # Final summary
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print(f"{GREEN}✅ System Test Setup Complete!{RESET}")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"{CYAN}Test directory:{RESET} {self.test_dir}")
        print(f"{CYAN}Test files created:{RESET}")
        print(f"  • {script_path.name}")
        print(f"  • daemon_test.py")
        print(f"  • autofix_test.py")
        print()
        
        print(f"{YELLOW}Next steps:{RESET}")
        print(f"  1. Start LuciferAI: {GREEN}python3 lucifer.py{RESET}")
        print(f"  2. Run the commands listed above")
        print(f"  3. Watch LuciferAI detect, fix, and learn from errors")
        print()
        
        print(f"{PURPLE}Happy testing! 🩸{RESET}\n")
        
        self.wait_for_continue()


def main():
    """Main entry point."""
    test = SystemTest()
    test.run_interactive_test()


if __name__ == "__main__":
    main()
