#!/usr/bin/env python3
"""
Test all LuciferAI commands with all available models
Tests basic commands, AI queries, and multi-step requests
Automatically tests against all installed/enabled models
"""
import subprocess
import time
import sys
from pathlib import Path

# Add core to path for model_tiers import
sys.path.insert(0, str(Path(__file__).parent.parent / 'core'))
from model_tiers import get_model_tier

# Add tests to path for response validator
sys.path.insert(0, str(Path(__file__).parent))
from response_validator import ResponseValidator

class CommandTester:
    def __init__(self):
        self.results = []
        self.project_root = Path(__file__).parent.parent  # Go up from tests/ to project root
        self.current_tier = 0  # Will be set by main()
        self.model_name = 'TinyLlama'  # Will be set by main()
        
    def run_command(self, command: str, description: str, timeout: int = 10):
        """Run a command and capture results with real-time output.
        
        Tests command against ALL installed/enabled models simultaneously.
        """
        # Detect all available models
        from pathlib import Path
        import json
        
        project_root = Path(__file__).parent.parent
        models_dir = project_root / '.luciferai' / 'models'
        
        # Check for ALL bundled models in .luciferai/models/ - test them all regardless of enabled status
        available_models = []
        found_model_names = set()
        
        if models_dir.exists():
            for model_file in models_dir.glob('*.gguf'):
                filename_lower = model_file.name.lower()
                model_name = None
                
                # Detect model name from filename
                if 'tinyllama' in filename_lower or 'tiny' in filename_lower:
                    model_name = 'tinyllama'
                elif 'mistral' in filename_lower and 'mixtral' not in filename_lower:
                    model_name = 'mistral'
                elif 'llama-3.2' in filename_lower or 'llama3.2' in filename_lower:
                    model_name = 'llama3.2'
                elif 'llama-2' in filename_lower or 'llama2' in filename_lower:
                    model_name = 'llama2'
                elif 'llama-3.1' in filename_lower or 'llama3.1' in filename_lower:
                    model_name = 'llama3.1'
                elif 'llama-3' in filename_lower or 'llama3' in filename_lower:
                    model_name = 'llama3'
                elif 'mixtral' in filename_lower:
                    model_name = 'mixtral'
                elif 'phi-3' in filename_lower or 'phi3' in filename_lower:
                    model_name = 'phi-3'
                elif 'phi-2' in filename_lower or 'phi2' in filename_lower:
                    model_name = 'phi-2'
                elif 'gemma' in filename_lower:
                    model_name = 'gemma2' if 'gemma2' in filename_lower else 'gemma'
                elif 'deepseek' in filename_lower:
                    model_name = 'deepseek-coder'
                elif 'codellama' in filename_lower or 'code-llama' in filename_lower:
                    model_name = 'codellama'
                elif 'vicuna' in filename_lower:
                    model_name = 'vicuna'
                elif 'orca' in filename_lower:
                    model_name = 'orca-2'
                elif 'qwen' in filename_lower:
                    model_name = 'qwen2' if 'qwen2' in filename_lower else 'qwen'
                elif 'yi' in filename_lower:
                    model_name = 'yi'
                elif 'solar' in filename_lower:
                    model_name = 'solar'
                elif 'wizardcoder' in filename_lower:
                    model_name = 'wizardcoder'
                elif 'wizardlm' in filename_lower:
                    model_name = 'wizardlm'
                elif 'dolphin' in filename_lower:
                    model_name = 'dolphin'
                elif 'hermes' in filename_lower:
                    model_name = 'nous-hermes'
                elif 'starling' in filename_lower:
                    model_name = 'starling'
                elif 'openchat' in filename_lower:
                    model_name = 'openchat'
                
                if model_name and model_name not in found_model_names:
                    found_model_names.add(model_name)
                    available_models.append(model_name)
        
        # Load LLM state to show which are enabled/disabled (but test all)
        llm_state_file = Path.home() / '.luciferai' / 'llm_state.json'
        llm_state = {}
        if llm_state_file.exists():
            try:
                with open(llm_state_file, 'r') as f:
                    llm_state = json.load(f)
            except:
                pass
        
        # Test ALL installed models regardless of enabled status
        if not available_models:
            available_models = ['rule-based']  # Fallback to rule-based only if no models found
        
        # Store enabled status for display purposes
        model_status = {m: ('Enabled' if llm_state.get(m, True) else 'Disabled') for m in available_models}
        
        print(f"\n{'='*60}")
        print(f"🧪 TEST: {description}")
        print(f"📝 User Input: {command}")
        
        # Show models with their status
        model_list = []
        for m in available_models:
            status = model_status.get(m, 'Unknown')
            status_icon = '✅' if status == 'Enabled' else '⏸️'
            model_list.append(f"{m.upper()} ({status_icon} {status})")
        
        print(f"🤖 Testing with models: {', '.join(model_list)}")
        print(f"{'='*60}")
        sys.stdout.flush()
        
        # Run test against ALL installed models (regardless of enabled status)
        model_results = {}
        
        for model in available_models:
            print(f"\n  🔹 Testing with {model.upper()}...")
            print(f"     📤 Input: {command}")
            sys.stdout.flush()
            
            try:
                # Run command through LuciferAI with real-time output
                # Set test mode environment variable to suppress banner
                import os
                test_env = os.environ.copy()
                test_env['LUCIFER_TEST_MODE'] = '1'
                test_env['TEST_MODEL'] = model.title()
                
                proc = subprocess.Popen(
                    ['python3', 'lucifer.py'],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,  # Line buffered
                    cwd=self.project_root,
                    env=test_env
                )
                
                # Send command
                proc.stdin.write(f"{command}\n")
                proc.stdin.flush()
            
                # Collect output while showing real-time
                output_lines = []
                response_lines = []
                capturing_response = False
                
                # Read output with timeout
                import select
                import time
                start_time = time.time()
            
                # Skip banner lines
                skip_patterns = [
                "LuciferAI Terminal",
                "Phoenix Auto-Recovery",
                "Forged in Silence",
                "╔═",
                "╚═",
                "Mode:",
                "Output:",
                "Perfect for:",
                "macOS",
                "detected",
                "AI Models:",
                "Bundled Models:",
                "Ollama",
                "AI Mode:",
                "Type 'help'",
                "Commands:",
                "Arrow keys",
                "User ID:",
                "────",
                "Initializing",
                "Authentication",
                "LuciferWatcher",
                "Syncing",
                "Template",
                "Enhanced LuciferAI",
                "Working directory:",
                ]
                
                line = ''  # Initialize line variable
                while time.time() - start_time < timeout:
                    # Check if there's data to read (with timeout)
                    if proc.stdout in select.select([proc.stdout], [], [], 0.1)[0]:
                        line = proc.stdout.readline()
                        if not line:  # EOF
                            break
                        
                        output_lines.append(line)
                        
                        # Only print relevant lines (skip banner/setup) - but less verbose for multi-model
                        # if not any(pattern in line for pattern in skip_patterns):
                        #     print(line, end='')  # Show real-time
                        #     sys.stdout.flush()
                        
                        # Start capturing when we see routing or instant response
                        if '🧠 Routing to' in line or '✨' in line or '💬 TINYLLAMA' in line or '💬 MISTRAL' in line:
                            capturing_response = True
                        
                        if capturing_response and line.strip():
                            # Capture actual response content
                            if 'LuciferAI>' not in line and '🩸' not in line and 'Awaiting Commands' not in line:
                                response_lines.append(line.strip())
                        
                        # Stop when we see the next prompt
                        if capturing_response and len(response_lines) > 0 and 'LuciferAI >' in line:
                            break
                        if capturing_response and ('LuciferAI>' in line or 'Idle' in line or 'Awaiting Commands' in line):
                            break
                    
                    # Check if process has exited
                    if proc.poll() is not None:
                        break
                
                # Send exit and cleanup
                try:
                    proc.stdin.write("exit\n")
                    proc.stdin.flush()
                except:
                    pass
                
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                
                output = ''.join(output_lines)
                response = '\n'.join(response_lines)
                
                # Store result for this model
                model_results[model] = {
                    'output': output,
                    'response': response,
                    'returncode': proc.returncode
                }
                
                # Show compact response for this model
                response_preview = response[:100] if response else '(no response)'
                if len(response) > 100:
                    response_preview += '...'
                print(f"     💬 Response: {response_preview}")
                
            except subprocess.TimeoutExpired:
                model_results[model] = {
                    'output': '',
                    'response': 'TIMEOUT',
                    'returncode': 1
                }
                print(f"     ⏱️  {model.upper()}: TIMEOUT")
            except Exception as e:
                model_results[model] = {
                    'output': '',
                    'response': f'ERROR: {e}',
                    'returncode': 1
                }
                print(f"     ❌ {model.upper()}: ERROR - {e}")
        
        # Now evaluate results across all models
        print(f"\n{'='*60}")
        print(f"📊 MODEL COMPARISON RESULTS:")
        print(f"{'='*60}")
        
        for model, result_data in model_results.items():
            response = result_data['response']
            
            # Use advanced validation system
            model_tier = get_model_tier(model)
            returncode = result_data['returncode']
            
            # Validate response quality
            result, status, validation_details = ResponseValidator.validate_response(
                command, description, response, model_tier
            )
            
            # Override if process failed
            if returncode != 0 and returncode is not None:
                if result == "✅ SUCCESS":
                    result = "⚠️  WARNING"
                    status = f"{status} (exit code: {returncode})"
            
            # Build detailed status with validation info
            score = ResponseValidator.get_score(result)
            detailed_status = status
            
            if validation_details.get('keywords_found'):
                detailed_status += f" | Keywords: {', '.join(validation_details['keywords_found'][:3])}"
            
            if validation_details.get('issues'):
                detailed_status += f" | Issues: {', '.join(validation_details['issues'][:2])}"
            
            # Store result for this model with enhanced details
            print(f"   {model.upper()}: {result} [{score}%] - {status}")
            if validation_details.get('keywords_found'):
                print(f"      💬 Found: {', '.join(validation_details['keywords_found'][:5])}")
            
            self.results.append({
                'test': f"{description} [{model.upper()}]",
                'command': command,
                'model': model,
                'result': result,
                'status': status,
                'response': response[:500] if response else "No response",
                'score': score,
                'validation_details': validation_details,
                'description': description
            })
        
        # Show summary line
        print(f"\n{'='*60}")
        success_count = len([r for r in model_results.values() if 'TIMEOUT' not in r['response'] and 'ERROR' not in r['response']])
        print(f"🎯 Overall: {success_count}/{len(available_models)} models completed successfully")
        print(f"{'='*60}")
    
    def _get_expected_output(self, command: str, description: str) -> str:
        """Generate expected output description based on command and test type."""
        command_lower = command.lower()
        
        # Query tests
        if 'Query:' in description:
            if 'ls' in command_lower:
                return "Explanation of 'ls' command - should mention listing files/directories"
            elif 'python' in command_lower:
                return "Description of Python programming language"
            elif 'git' in command_lower:
                return "Explanation of Git version control system"
            elif 'algorithm' in command_lower:
                return "Definition of algorithm - step-by-step procedure to solve problems"
            elif 'grep' in command_lower:
                return "Explanation of grep - pattern/text search tool"
            elif 'serendipity' in command_lower:
                return "Definition of serendipity - fortunate discovery by accident"
            elif 'hello' in command_lower:
                return "Friendly greeting response"
            elif 'docker' in command_lower:
                return "Explanation of Docker container platform"
            elif 'npm' in command_lower:
                return "Description of npm - Node.js package manager"
            elif 'recursion' in command_lower:
                return "Definition of recursion - function calling itself"
            else:
                return "Relevant information answering the query"
        
        # Memory tests
        elif 'Memory:' in description:
            if 'my name is' in command_lower or 'i like' in command_lower or 'i work' in command_lower:
                return "Acknowledgment that information was stored (e.g., 'Noted', 'I'll remember that')"
            elif "what's my" in command_lower or 'what do you know' in command_lower:
                return "Recall of previously stored information or admission of no stored data"
            elif command_lower in ['memory', 'show memory']:
                return "Display of conversation memory statistics"
            else:
                return "Memory operation acknowledgment"
        
        # Horoscope tests
        elif 'Horoscope:' in description:
            return "Zodiac-related information mentioning signs, elements, or astrological data"
        
        # Multi-step tests
        elif 'Multi-step' in description:
            if 'Tier 0' in description:
                return "For TinyLlama: Suggestion to upgrade to Mistral; For higher tiers: Task completion"
            else:
                return "Evidence of multiple operations (created, listed, analyzed, etc.)"
        
        # Tier 0 limitation tests
        elif 'Limitation:' in description:
            return "For Tier 0: Upgrade suggestion to Mistral/Llama3.2; For higher tiers: Detailed response"
        
        # Edge cases
        elif 'Edge:' in description:
            if not command.strip():
                return "Graceful handling of empty input"
            elif 'joke' in command_lower or 'meaning of life' in command_lower:
                return "Creative or philosophical response"
            else:
                return "Appropriate handling of unusual input"
        
        # Basic commands
        elif 'help' in command_lower:
            return "Display of available commands and help information"
        elif 'clear' in command_lower:
            return "Acknowledgment of history clearing"
        else:
            return "Appropriate response to command"
    
    def print_summary(self):
        """Print test results summary with detailed per-LLM responses."""
        print(f"\n\n{'='*60}")
        print("📊 TEST SUMMARY")
        print(f"{'='*60}\n")
        
        # Count results
        success = len([r for r in self.results if '✅' in r['result']])
        refused = len([r for r in self.results if '⚠️' in r['result']])
        failed = len([r for r in self.results if '❌' in r['result']])
        timeout = len([r for r in self.results if '⏱️' in r['result']])
        unknown = len([r for r in self.results if '❓' in r['result']])
        total = len(self.results)
        
        print(f"Total Tests: {total}")
        print(f"✅ Success: {success}")
        print(f"⚠️  Refused: {refused} (TinyLlama limitations)")
        print(f"❌ Failed: {failed}")
        print(f"⏱️  Timeout: {timeout}")
        print(f"❓ Unknown: {unknown}")
        
        print(f"\n{'='*60}")
        print("DETAILED RESULTS")
        print(f"{'='*60}\n")
        
        # Group results by test command to show LLM comparisons
        from collections import defaultdict
        tests_by_command = defaultdict(list)
        
        for r in self.results:
            # Extract base test name without model tag
            test_name = r['test'].rsplit('[', 1)[0].strip()
            tests_by_command[r['command']].append(r)
        
        # Print results grouped by test command
        for test_num, (command, results) in enumerate(tests_by_command.items(), 1):
            print(f"\n{'─'*60}")
            print(f"🧪 TEST {test_num}/{len(tests_by_command)}: {results[0]['test'].rsplit('[', 1)[0].strip()}")
            print(f"{'─'*60}")
            print(f"📝 Input Command: {command}")
            print()
            
            # Show expected output based on test type
            test_description = results[0]['description']
            print(f"  🎯 Expected Output:")
            expected = self._get_expected_output(command, test_description)
            print(f"     {expected}")
            print()
            
            # Show each LLM's response
            for r in results:
                model_name = r['model'].upper()
                result_icon = r['result']
                status = r['status']
                response = r['response']
                score = r['score']
                validation = r['validation_details']
                
                # Determine grade letter
                if score >= 90:
                    grade = "A+"
                    grade_color = "🟢"  # Green
                elif score >= 80:
                    grade = "A"
                    grade_color = "🟢"
                elif score >= 70:
                    grade = "B"
                    grade_color = "🟡"  # Yellow
                elif score >= 60:
                    grade = "C"
                    grade_color = "🟡"
                elif score >= 50:
                    grade = "D"
                    grade_color = "🟠"  # Orange
                else:
                    grade = "F"
                    grade_color = "🔴"  # Red
                
                print(f"  🤖 {model_name}:")
                print(f"     Result: {result_icon}")
                print(f"     Grade: {grade_color} {grade} ({score}%)")
                print(f"     Status: {status}")
                
                # Show validation details
                if validation.get('keywords_found'):
                    print(f"     ✅ Found Keywords: {', '.join(validation['keywords_found'][:5])}")
                if validation.get('issues'):
                    print(f"     ⚠️  Issues: {', '.join(validation['issues'])}")
                
                print(f"     ┌─ Actual Response:")
                
                # Format response with proper indentation
                response_lines = response.split('\n') if response else ['(no response)']
                for line in response_lines[:10]:  # Show first 10 lines
                    if line.strip():
                        print(f"     │ {line[:80]}")
                
                if len(response_lines) > 10:
                    print(f"     │ ... ({len(response_lines) - 10} more lines)")
                print(f"     └─")
                print()
            
            # Show execution flow summary
            print(f"  📊 Execution Summary:")
            for r in results:
                model = r['model'].upper()
                result = r['result']
                print(f"     {model}: Input → LLM Processing → {result}")
            print()
        
        # Print compact summary at the end
        print(f"\n{'='*60}")
        print("📋 COMPACT SUMMARY")
        print(f"{'='*60}\n")
        
        for r in self.results:
            print(f"{r['result']} {r['test']}")
            print(f"   Command: {r['command']}")
            print(f"   Status: {r['status']}")
            print()


def main():
    # Check which model is being tested (from command line or environment)
    import os
    import signal
    
    model_name = os.getenv('TEST_MODEL', 'TinyLlama')  # Default to TinyLlama
    
    # Detect current tier
    tier = 0  # Default to Tier 0 (TinyLlama)
    if 'mistral' in model_name.lower():
        tier = 2
    elif 'llama3.2' in model_name.lower():
        tier = 1
    elif 'deepseek' in model_name.lower():
        tier = 3
    
    tester = CommandTester()
    tester.current_tier = tier
    tester.model_name = model_name
    
    # Handle Ctrl+C gracefully - show partial results
    def signal_handler(sig, frame):
        print("\n\n")
        print("="*60)
        print("⚠️  TEST INTERRUPTED (Ctrl+C)")
        print("="*60)
        print(f"Completed {len(tester.results)} tests before interruption")
        print()
        
        # Show partial results
        if tester.results:
            tester.print_summary()
        else:
            print("No tests completed yet.")
        
        print("\n💾 Partial results have been logged.")
        sys.exit(130)  # Standard exit code for Ctrl+C
    
    signal.signal(signal.SIGINT, signal_handler)
    
    print(f"\n🧪 LuciferAI Command Test Suite with {model_name} (Tier {tier})")
    print("Testing all commands - Simple queries first, then advanced tasks")
    print("Press Ctrl+C at any time to see partial results and exit")
    
    # Calculate and print total tests for progress bar tracking
    # Section 1: 12 (Simple AI queries), Section 2: 4 (Basic commands), Section 3: 12 (Memory)
    # Section 4: 12 (Horoscope), Section 5: 6 (Multi-step), Section 6: 3 (Tier 0 limits), Section 7: 6 (Edge cases)
    # Section 8: 9 (File operations), Section 9: 6 (Daemon/Watcher/Fix), Section 10: 6 (Model management)
    # Total = 76 unique test commands
    total_test_count = 76
    print(f"Total Tests: {total_test_count}\n")
    sys.stdout.flush()
    
    # ===== SIMPLE AI QUERIES (Run first in batches of 5) =====
    print("\n" + "="*60)
    print("SECTION 1: SIMPLE AI QUERIES (Fast keyword-based)")
    print("="*60)
    
    simple_queries = [
        # Basic variant - simple commands
        ("What is ls?", "Query: Simple terminal command"),
        ("Define the word 'algorithm'", "Query: Common technical word"),
        ("hello", "Query: Greeting (should get instant response)"),
        ("What is python?", "Query: Programming language definition"),
        ("What is git?", "Query: Version control system"),
        # Standard variant - explanations
        ("Explain grep in one sentence", "Query: Concise explanation"),
        ("What does 'serendipity' mean?", "Query: Abstract concept"),
        ("What is docker?", "Query: Container platform"),
        ("Define recursion", "Query: Programming concept"),
        # Advanced variant - complex queries
        ("How do I create a file?", "Query: Multi-step how-to"),
        ("Compare ls and dir commands", "Query: Comparison task"),
        ("What is npm?", "Query: Package manager"),
    ]
    
    # Run in batches of 5 (faster for simple queries)
    for i in range(0, len(simple_queries), 5):
        batch_num = (i // 5) + 1
        total_batches = (len(simple_queries) + 4) // 5
        print(f"\n  📦 Batch {batch_num}/{total_batches} (5 tests)")
        batch = simple_queries[i:i+5]
        for cmd, desc in batch:
            tester.run_command(cmd, desc, timeout=10)
            time.sleep(0.5)  # Shorter delay for simple queries
        # Pause between batches
        if i + 5 < len(simple_queries):
            print(f"\n  ⏸️  Pause (2s) before next batch...")
            time.sleep(2)
    
    # ===== BASIC COMMANDS =====
    print("\n" + "="*60)
    print("SECTION 2: BASIC COMMANDS")
    print("="*60)
    
    basic_commands = [
        # Basic variant
        ("memory", "Check conversation memory"),
        ("help", "Display help"),
        # Standard variant
        ("clear history", "Clear conversation history"),
        # Advanced variant
        ("memory", "Check memory after clear"),  # Test after clear
    ]
    
    # Run in batches of 3
    for i in range(0, len(basic_commands), 3):
        batch_num = (i // 3) + 1
        total_batches = (len(basic_commands) + 2) // 3
        print(f"\n  📦 Batch {batch_num}/{total_batches}")
        batch = basic_commands[i:i+3]
        for cmd, desc in batch:
            tester.run_command(cmd, desc, timeout=8)
            time.sleep(1)
        # Pause between batches
        if i + 3 < len(basic_commands):
            print(f"\n  ⏸️  Pause (2s) before next batch...")
            time.sleep(2)
    
    # ===== CONVERSATION MEMORY TESTS =====
    print("\n" + "="*60)
    print("SECTION 3: CONVERSATION MEMORY")
    print("="*60)
    
    memory_tests = [
        # Basic variant - simple facts
        ("My name is Alice", "Memory: Set simple fact (name)"),
        ("What's my name?", "Memory: Recall simple fact"),
        # Standard variant - preferences
        ("I like Python programming", "Memory: Set preference"),
        ("What do I like?", "Memory: Recall preference"),
        # Advanced variant - multiple facts
        ("I work as a developer and I'm 25 years old", "Memory: Set multiple facts"),
        ("What do you know about me?", "Memory: Recall multiple facts"),
        # Advanced variant - complex scenarios
        ("I have a cat named Whiskers and a dog named Max", "Memory: Set related facts (pets)"),
        ("Tell me about my pets", "Memory: Recall related facts"),
        ("I prefer tea over coffee and I wake up at 6am", "Memory: Set distinct preferences"),
        ("What are my morning preferences?", "Memory: Recall context-specific facts"),
        ("My birthday is August 25th and I'm a Virgo", "Memory: Set date and derived info"),
        ("When is my birthday and what's my sign?", "Memory: Recall date and inference"),
    ]
    
    # Run in batches of 3
    for i in range(0, len(memory_tests), 3):
        batch_num = (i // 3) + 1
        total_batches = (len(memory_tests) + 2) // 3
        print(f"\n  📦 Batch {batch_num}/{total_batches}")
        batch = memory_tests[i:i+3]
        for cmd, desc in batch:
            tester.run_command(cmd, desc, timeout=15)
            time.sleep(1)
        # Pause between batches
        if i + 3 < len(memory_tests):
            print(f"\n  ⏸️  Pause (2s) before next batch...")
            time.sleep(2)
    
    # ===== HOROSCOPE/ZODIAC KNOWLEDGE =====
    print("\n" + "="*60)
    print("SECTION 4: HOROSCOPE & ZODIAC")
    print("="*60)
    
    horoscope_tests = [
        # Basic variant - simple zodiac info
        ("What is a Virgo?", "Horoscope: Define zodiac sign"),
        ("When is Aries season?", "Horoscope: Date range query"),
        ("List all zodiac signs", "Horoscope: Enumerate all signs"),
        # Standard variant - birth date calculations
        ("What zodiac sign is someone born in August?", "Horoscope: Birth month to sign"),
        ("If I was born on March 25th what am I?", "Horoscope: Specific birth date"),
        ("What sign comes after Gemini?", "Horoscope: Sequential order"),
        # Advanced variant - characteristics and relationships
        ("What are the traits of a Leo?", "Horoscope: Sign characteristics"),
        ("What element is associated with Scorpio?", "Horoscope: Element association"),
        ("Which signs are fire signs?", "Horoscope: Group by element"),
        ("Are Aries and Libra compatible?", "Horoscope: Compatibility query"),
        ("What planet rules Pisces?", "Horoscope: Ruling planet"),
        ("What's the symbol for Sagittarius?", "Horoscope: Sign symbol"),
    ]
    
    # Run in batches of 3
    for i in range(0, len(horoscope_tests), 3):
        batch_num = (i // 3) + 1
        total_batches = (len(horoscope_tests) + 2) // 3
        print(f"\n  📦 Batch {batch_num}/{total_batches}")
        batch = horoscope_tests[i:i+3]
        for cmd, desc in batch:
            tester.run_command(cmd, desc, timeout=15)
            time.sleep(1)
        # Pause between batches
        if i + 3 < len(horoscope_tests):
            print(f"\n  ⏸️  Pause (2s) before next batch...")
            time.sleep(2)
    
    # ===== ADVANCED/MULTI-STEP REQUESTS =====
    print("\n" + "="*60)
    print("SECTION 5: MULTI-STEP REQUESTS")
    print("="*60)
    
    multi_step_requests = [
        # Basic variant - 2 steps
        (
            "Create a folder called testfolder",
            "Multi-step Basic: Single folder creation"
        ),
        (
            "List all python files in the current directory",
            "Multi-step Basic: File listing"
        ),
        # Standard variant - 2-3 steps
        (
            "Create a folder called testfolder and make a python script called hello.py inside it",
            "Multi-step Standard: Folder + file creation"
        ),
        (
            "Show me the system info and recommend which AI model I should install",
            "Multi-step Standard: System check + recommendation"
        ),
        # Advanced variant - 3+ steps with analysis
        (
            "List all python files in the current directory and tell me which one is largest",
            "Multi-step Advanced: File listing + analysis"
        ),
        (
            "Create a test directory, put a readme file in it, and show me its contents",
            "Multi-step Advanced: 3 sequential operations"
        ),
    ]
    
    # Run in batches of 3
    for i in range(0, len(multi_step_requests), 3):
        batch_num = (i // 3) + 1
        total_batches = (len(multi_step_requests) + 2) // 3
        print(f"\n  📦 Batch {batch_num}/{total_batches}")
        batch = multi_step_requests[i:i+3]
        for cmd, desc in batch:
            tester.run_command(cmd, desc, timeout=20)
            time.sleep(2)
        # Pause between batches
        if i + 3 < len(multi_step_requests):
            print(f"\n  ⏸️  Pause (3s) before next batch...")
            time.sleep(3)
    
    # ===== TIER 0 LIMITATIONS (Expected to fail/prompt upgrade) =====
    print("\n" + "="*60)
    print("SECTION 6: TIER 0 LIMITATIONS")
    print("="*60)
    
    tier0_limitations = [
        # Complex reasoning beyond TinyLlama
        (
            "Compare the philosophical implications of determinism versus free will, then explain how quantum mechanics might reconcile both perspectives",
            "Limitation: Multi-step reasoning (should suggest Mistral)"
        ),
        (
            "Analyze the economic impact of cryptocurrency adoption in three different countries and predict future trends based on historical data",
            "Limitation: Complex analysis (should suggest Mistral)"
        ),
        (
            "Write a detailed technical specification for a distributed microservices architecture, including security considerations and scalability patterns",
            "Limitation: Technical depth (should suggest Mistral)"
        ),
    ]
    
    # Run in batches of 3 (all 3 limitation tests in one batch)
    for i in range(0, len(tier0_limitations), 3):
        batch_num = (i // 3) + 1
        total_batches = (len(tier0_limitations) + 2) // 3
        print(f"\n  📦 Batch {batch_num}/{total_batches}")
        batch = tier0_limitations[i:i+3]
        for cmd, desc in batch:
            tester.run_command(cmd, desc, timeout=30)
            time.sleep(2)
        # Pause between batches
        if i + 3 < len(tier0_limitations):
            print(f"\n  ⏸️  Pause (3s) before next batch...")
            time.sleep(3)
    
    # ===== FILE OPERATIONS =====
    print("\n" + "="*60)
    print("SECTION 7: FILE OPERATIONS")
    print("="*60)
    
    file_operations = [
        # Basic variant - simple ops
        ("list .", "File: List current directory"),
        ("read README.md", "File: Read file contents"),
        ("find *.py", "File: Find Python files"),
        # Standard variant - manipulation
        ("copy test.txt test_backup.txt", "File: Copy file"),
        ("move old.txt new.txt", "File: Move/rename file"),
        ("create file test_script.py", "File: Create new file"),
        # Advanced variant - complex operations
        ("create folder test_project", "File: Create folder"),
        ("list all python files in the current directory", "File: Natural language list"),
        ("find all files modified today", "File: Time-based search"),
    ]
    
    # Run in batches of 3
    for i in range(0, len(file_operations), 3):
        batch_num = (i // 3) + 1
        total_batches = (len(file_operations) + 2) // 3
        print(f"\n  📦 Batch {batch_num}/{total_batches}")
        batch = file_operations[i:i+3]
        for cmd, desc in batch:
            tester.run_command(cmd, desc, timeout=15)
            time.sleep(1)
        # Pause between batches
        if i + 3 < len(file_operations):
            print(f"\n  ⏸️  Pause (2s) before next batch...")
            time.sleep(2)
    
    # ===== DAEMON/WATCHER & FIX SCRIPTS =====
    print("\n" + "="*60)
    print("SECTION 8: DAEMON/WATCHER & FIX CONSENSUS")
    print("="*60)
    
    daemon_fix_tests = [
        # Basic variant - simple run
        ("run test_script.py", "Daemon: Run script with error detection"),
        ("find script named calculator", "Daemon: Smart script finding"),
        # Standard variant - fix scripts
        ("fix broken_script.py", "Fix: Apply consensus fixes"),
        ("check fixnet for ModuleNotFoundError", "Fix: Query FixNet consensus"),
        # Advanced variant - daemon watcher
        ("daemon watch calculator.py", "Daemon: Watch script for errors"),
        ("show daemon status", "Daemon: Check watcher status"),
    ]
    
    # Run in batches of 3
    for i in range(0, len(daemon_fix_tests), 3):
        batch_num = (i // 3) + 1
        total_batches = (len(daemon_fix_tests) + 2) // 3
        print(f"\n  📦 Batch {batch_num}/{total_batches}")
        batch = daemon_fix_tests[i:i+3]
        for cmd, desc in batch:
            tester.run_command(cmd, desc, timeout=20)
            time.sleep(2)
        # Pause between batches
        if i + 3 < len(daemon_fix_tests):
            print(f"\n  ⏸️  Pause (3s) before next batch...")
            time.sleep(3)
    
    # ===== MODEL MANAGEMENT =====
    print("\n" + "="*60)
    print("SECTION 9: MODEL MANAGEMENT")
    print("="*60)
    
    model_management = [
        # Basic variant - info
        ("llm list", "Model: List installed models"),
        ("models info", "Model: Compare AI capabilities"),
        # Standard variant - enable/disable
        ("llm enable tinyllama", "Model: Enable specific model"),
        ("llm disable tinyllama", "Model: Disable specific model"),
        # Advanced variant - bulk operations
        ("show backup models", "Model: Show backup directory"),
        ("llm list all", "Model: Show all 85+ supported models"),
    ]
    
    # Run in batches of 3
    for i in range(0, len(model_management), 3):
        batch_num = (i // 3) + 1
        total_batches = (len(model_management) + 2) // 3
        print(f"\n  📦 Batch {batch_num}/{total_batches}")
        batch = model_management[i:i+3]
        for cmd, desc in batch:
            tester.run_command(cmd, desc, timeout=12)
            time.sleep(1)
        # Pause between batches
        if i + 3 < len(model_management):
            print(f"\n  ⏸️  Pause (2s) before next batch...")
            time.sleep(2)
    
    # ===== EDGE CASES =====
    print("\n" + "="*60)
    print("SECTION 10: EDGE CASES")
    print("="*60)
    
    edge_cases = [
        # Basic variant - simple edge cases
        ("", "Edge: Empty command"),
        ("asdfghjkl", "Edge: Gibberish input"),
        # Standard variant - unusual requests
        ("What is the meaning of life?", "Edge: Philosophical question"),
        ("Tell me a joke", "Edge: Creative request"),
        # Advanced variant - unreasonable/complex
        ("Write me a 500 line Python script", "Edge: Unreasonable request (Tier 0)"),
        ("Explain quantum physics in simple terms", "Edge: Complex topic simplification"),
    ]
    
    # Run in batches of 3
    for i in range(0, len(edge_cases), 3):
        batch_num = (i // 3) + 1
        total_batches = (len(edge_cases) + 2) // 3
        print(f"\n  📦 Batch {batch_num}/{total_batches}")
        batch = edge_cases[i:i+3]
        for cmd, desc in batch:
            tester.run_command(cmd, desc, timeout=15)
            time.sleep(1)
        # Pause between batches
        if i + 3 < len(edge_cases):
            print(f"\n  ⏸️  Pause (2s) before next batch...")
            time.sleep(2)
    
    # Print final summary
    tester.print_summary()
    
    # Exit code based on failures
    failed_count = len([r for r in tester.results if '❌' in r['result']])
    sys.exit(0 if failed_count == 0 else 1)


if __name__ == "__main__":
    main()
