#!/usr/bin/env python3
"""
🧪 Progressive Tier Testing System
Tests LLMs progressively through tiers with diagnostic logging

Flow:
1. All models start with Tier 0 tests
2. If pass all Tier 0 → advance to Tier 1 tests
3. If pass all Tier 1 → advance to Tier 2 tests
4. If pass all Tier 2 → advance to Tier 3 tests

Lower-tier models ARE tested on higher tiers but:
- Results are logged to diagnostic file only
- NOT shown in tier results (to avoid clutter)
- Helps debug how lower models handle higher-tier requests
"""
import sys
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / 'core'))

from core.llamafile_agent import LlamafileAgent
from core.model_tiers import get_model_tier, TIER_MODELS
from core.lucifer_colors import c

class ProgressiveTierTester:
    def __init__(self):
        self.project_root = Path(__file__).parent.parent
        self.models_dir = self.project_root / '.luciferai' / 'models'
        self.results = {}
        self.diagnostic_logs = []
        
        # Define tier test suites
        self.tier_tests = {
            0: self._get_tier0_tests(),
            1: self._get_tier1_tests(),
            2: self._get_tier2_tests(),
            3: self._get_tier3_tests(),
        }
    
    def _get_tier0_tests(self) -> List[Tuple[str, str, List[str]]]:
        """Tier 0: Basic tests - simple commands, basic AI queries.
        Tests: File ops, build, simple AI queries, info commands.
        """
        return [
            # File Operations (basic)
            ("list .", "List Directory", ["test", "core", "demo", "file", "directory"]),
            ("pwd", "Show Current Directory", ["desktop", "projects", "luciferai", "/"]),
            ("read README.md", "Read File", ["luciferai", "readme", "project", "#"]),
            
            # Info Commands
            ("memory", "Show History", ["command", "history", "recent"]),
            ("help", "Show Help", ["file", "command", "operations", "ai"]),
            
            # Basic AI Queries
            ("What is 2+2?", "Basic Math", ["4", "four"]),
            ("Say hello", "Simple Response", ["hello", "hi", "hey", "greetings"]),
            ("What color is the sky?", "Common Knowledge", ["blue"]),
            ("What is Python?", "Basic Tech Question", ["python", "programming", "language"]),
            ("Count to 5", "Simple Counting", ["1", "2", "3", "4", "5"]),
        ]
    
    def _get_tier1_tests(self) -> List[Tuple[str, str, List[str]]]:
        """Tier 1: General tests - moderate complexity, explanations.
        Tests: Build commands, file finding, moderate AI queries, multi-step.
        """
        return [
            # Build Commands
            ("create folder test_project", "Create Folder", ["created", "folder", "test_project", "desktop"]),
            ("create file hello.py", "Create File", ["created", "file", "hello.py", "template"]),
            
            # File Finding
            ("find *.py", "Find Python Files", ["found", ".py", "file"]),
            ("find README", "Find Specific File", ["readme", "found", "file"]),
            
            # Moderate AI Queries
            ("Explain how photosynthesis works", "Science Explanation", ["light", "energy", "plant", "carbon", "oxygen"]),
            ("What's the difference between a list and tuple in Python?", "Technical Comparison", ["immutable", "mutable", "list", "tuple"]),
            ("Describe three benefits of exercise", "Multi-point Answer", ["health", "benefit", "exercise", "fitness"]),
            ("Solve: If x + 5 = 12, what is x?", "Basic Algebra", ["7", "seven", "x = 7", "x=7"]),
            
            # Package Management Query
            ("how do I install numpy?", "Package Install Query", ["pip", "install", "numpy", "package"]),
        ]
    
    def _get_tier2_tests(self) -> List[Tuple[str, str, List[str]]]:
        """Tier 2: Advanced tests - complex reasoning, coding, analysis.
        Tests: Daemon/watcher, code generation, debugging, complex analysis.
        """
        return [
            # Daemon/Fix Commands (conceptual - testing AI understanding)
            ("explain what 'daemon watch' does", "Daemon Concept", ["watch", "monitor", "file", "changes", "autofix"]),
            ("how does the fix command work?", "Fix Command Explanation", ["fix", "error", "consensus", "fixnet", "detect"]),
            
            # Code Generation
            ("Write a Python function to reverse a string", "Code Generation", ["def", "reverse", "return", "[::-1]"]),
            ("Create a function that checks if a number is prime", "Algorithm Generation", ["def", "prime", "if", "return", "for", "range"]),
            
            # Code Debugging
            ("Debug this code: for i in range(10) print(i)", "Code Debugging", ["colon", ":", "syntax", "error"]),
            ("Fix: def add(a b): return a+b", "Function Debug", ["comma", ",", "parameter", "syntax"]),
            
            # Complex Analysis
            ("Compare democracy and autocracy", "Political Analysis", ["democracy", "autocracy", "government", "freedom", "power"]),
            ("What are pros and cons of microservices?", "Technical Analysis", ["microservices", "advantage", "disadvantage", "distributed", "scalability"]),
            
            # Advanced Concepts
            ("Explain recursion with an example", "Advanced Concept", ["recursion", "function", "call", "itself", "base"]),
        ]
    
    def _get_tier3_tests(self) -> List[Tuple[str, str, List[str]]]:
        """Tier 3: Expert tests - expert coding, system design, complex analysis.
        Tests: Advanced algorithms, system architecture, optimization, patterns.
        """
        return [
            # Advanced Data Structures
            ("Implement a binary search tree in Python with insert and search methods", "Advanced Data Structure", ["class", "node", "insert", "search", "binary", "tree", "left", "right"]),
            ("Create a min heap implementation with heapify", "Heap Implementation", ["class", "heap", "heapify", "parent", "child", "swap"]),
            
            # Algorithm Analysis
            ("Explain time and space complexity of quicksort", "Algorithm Analysis", ["quicksort", "complexity", "O(n log n)", "partition", "pivot"]),
            ("Compare merge sort vs quicksort trade-offs", "Algorithm Comparison", ["merge", "quick", "stable", "complexity", "memory", "partition"]),
            
            # System Design
            ("Design a RESTful API for a social media platform", "System Design", ["api", "endpoint", "rest", "get", "post", "user", "resource", "authentication"]),
            ("Architect a distributed caching system", "Distributed Systems", ["cache", "distributed", "consistency", "redis", "memcached", "sharding"]),
            
            # Code Refactoring & Patterns
            ("Refactor this code using SOLID principles", "Code Refactoring", ["solid", "principle", "single responsibility", "refactor", "interface", "dependency"]),
            ("Implement thread-safe singleton pattern", "Advanced Pattern", ["singleton", "thread", "safe", "lock", "instance", "synchronized"]),
            
            # Optimization
            ("Optimize database queries for N+1 problem", "Query Optimization", ["n+1", "query", "optimization", "join", "eager loading", "batch"]),
            ("Design rate limiting algorithm", "Algorithm Design", ["rate", "limit", "token bucket", "sliding window", "algorithm", "throttle"]),
        ]
    
    def detect_installed_models(self) -> List[Tuple[str, int]]:
        """Detect all installed models with their tiers."""
        models = []
        
        if not self.models_dir.exists():
            return models
        
        # Import model files mapping
        try:
            from core.model_files_map import MODEL_FILES, get_canonical_name
        except ImportError:
            print("⚠️  Warning: model_files_map not found, falling back to basic detection")
            MODEL_FILES = {}
        
        # Check all installed GGUF files against MODEL_FILES mapping
        for model_file in self.models_dir.glob('*.gguf'):
            filename = model_file.name
            model_name = None
            
            # Try to match against ALL models in MODEL_FILES
            for name, expected_filename in MODEL_FILES.items():
                if filename == expected_filename:
                    model_name = get_canonical_name(name)
                    break
            
            # If matched, add to list with tier
            if model_name:
                tier = get_model_tier(model_name)
                # Avoid duplicates (multiple aliases map to same canonical name)
                if (model_name, tier) not in models:
                    models.append((model_name, tier))
        
        return sorted(models, key=lambda x: x[1])  # Sort by tier
    
    def test_model_on_tier(self, model_name: str, model_tier: int, test_tier: int, silent: bool = False) -> Dict:
        """Test a model on a specific tier's tests.
        
        Args:
            model_name: Name of the model to test
            model_tier: The model's actual tier (0-3)
            test_tier: The tier of tests to run (0-3)
            silent: If True, only log to diagnostics (for lower-tier models on higher tests)
        """
        tests = self.tier_tests[test_tier]
        
        if not silent:
            print(f"\n{c('─'*70, 'dim')}")
            print(c(f"Testing {model_name.upper()} (Tier {model_tier}) on Tier {test_tier} tests", "cyan"))
            print(c('─'*70, 'dim'))
            print()
        
        model_path = self._get_model_path(model_name)
        if not model_path:
            return {'error': 'Model file not found'}
        
        agent = LlamafileAgent(model_path=model_path)
        
        passed = 0
        failed = 0
        results_detail = []
        
        for i, (question, description, keywords) in enumerate(tests, 1):
            if not silent:
                print(c(f"  [{i}/{len(tests)}] {description}...", "dim"), end=" ", flush=True)
            
            try:
                response = agent.query(question, temperature=0.1, max_tokens=200)
                response_lower = response.lower()
                
                # Check if response contains expected keywords
                matches = sum(1 for kw in keywords if kw.lower() in response_lower)
                success = matches >= (len(keywords) * 0.4)  # 40% keyword match threshold
                
                if success:
                    passed += 1
                    if not silent:
                        print(c("✅", "green"))
                else:
                    failed += 1
                    if not silent:
                        print(c("❌", "red"))
                
                # Store detailed result
                result_detail = {
                    'question': question,
                    'description': description,
                    'response': response[:200],  # Truncate for storage
                    'keywords': keywords,
                    'matches': matches,
                    'success': success,
                }
                results_detail.append(result_detail)
                
                # Always log to diagnostics
                self._log_diagnostic(model_name, model_tier, test_tier, result_detail)
                
            except Exception as e:
                failed += 1
                if not silent:
                    print(c(f"❌ Error: {e}", "red"))
                
                result_detail = {
                    'question': question,
                    'description': description,
                    'error': str(e),
                    'success': False,
                }
                results_detail.append(result_detail)
                self._log_diagnostic(model_name, model_tier, test_tier, result_detail)
        
        total = len(tests)
        pass_rate = (passed / total * 100) if total > 0 else 0
        
        result_summary = {
            'tier': test_tier,
            'passed': passed,
            'failed': failed,
            'total': total,
            'pass_rate': pass_rate,
            'details': results_detail,
        }
        
        if not silent:
            print()
            print(c(f"  Results: {passed}/{total} passed ({pass_rate:.1f}%)", 
                   "green" if pass_rate >= 80 else "yellow" if pass_rate >= 60 else "red"))
        
        return result_summary
    
    def _get_model_path(self, model_name: str) -> Path:
        """Get model file path using model_files_map."""
        try:
            from core.model_files_map import get_model_file
            
            filename = get_model_file(model_name)
            if filename:
                path = self.models_dir / filename
                return path if path.exists() else None
        except ImportError:
            # Fallback to basic mapping
            model_files = {
                'tinyllama': 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
                'mistral': 'mistral-7b-instruct-v0.2.Q4_K_M.gguf',
            }
            filename = model_files.get(model_name)
            if filename:
                path = self.models_dir / filename
                return path if path.exists() else None
        
        return None
    
    def _log_diagnostic(self, model_name: str, model_tier: int, test_tier: int, result: Dict):
        """Log diagnostic information for analysis."""
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'model': model_name,
            'model_tier': model_tier,
            'test_tier': test_tier,
            'result': result,
        }
        self.diagnostic_logs.append(log_entry)
    
    def run_progressive_tests(self):
        """Run progressive tier testing on all detected models."""
        print()
        print(c("╔═══════════════════════════════════════════════════════════════╗", "purple"))
        print(c("║         🧪 PROGRESSIVE TIER TESTING SYSTEM                    ║", "purple"))
        print(c("╚═══════════════════════════════════════════════════════════════╝", "purple"))
        print()
        
        # Detect all models
        models = self.detect_installed_models()
        
        if not models:
            print(c("❌ No models detected", "red"))
            print()
            print(c("Install models with: install core models", "yellow"))
            return
        
        print(c("Detected models:", "cyan"))
        for model_name, tier in models:
            print(c(f"  • {model_name.upper()} (Tier {tier})", "white"))
        print()
        
        # Test each model progressively
        for model_name, model_tier in models:
            print()
            print(c("═" * 70, "purple"))
            print(c(f"Testing {model_name.upper()} (Native Tier {model_tier})", "purple"))
            print(c("═" * 70, "purple"))
            
            self.results[model_name] = {
                'model_tier': model_tier,
                'tier_results': {},
            }
            
            # Test progressively through tiers
            for test_tier in range(4):  # 0, 1, 2, 3
                # Determine if this should be silent (diagnostic only)
                silent = test_tier > model_tier
                
                if silent:
                    print()
                    print(c(f"🔍 Tier {test_tier} (Diagnostic Mode - Testing outside native tier)", "yellow"))
                
                result = self.test_model_on_tier(model_name, model_tier, test_tier, silent=silent)
                self.results[model_name]['tier_results'][test_tier] = result
                
                # If not silent and failed too many tests, stop progression
                if not silent and result.get('pass_rate', 0) < 80:
                    print()
                    print(c(f"⚠️  Did not pass Tier {test_tier} threshold (80%)", "yellow"))
                    print(c(f"   Stopping progression at Tier {test_tier}", "dim"))
                    
                    # Continue testing higher tiers in silent mode for diagnostics
                    print()
                    print(c(f"   Continuing higher tiers in diagnostic mode...", "dim"))
                    for remaining_tier in range(test_tier + 1, 4):
                        self.test_model_on_tier(model_name, model_tier, remaining_tier, silent=True)
                    break
        
        # Save diagnostic logs
        self._save_diagnostic_logs()
        
        # Print summary
        self._print_summary()
    
    def _save_diagnostic_logs(self):
        """Save diagnostic logs to file."""
        log_dir = self.project_root / '.luciferai' / 'logs'
        log_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = log_dir / f"progressive_tier_diagnostics_{timestamp}.json"
        
        with open(log_file, 'w') as f:
            json.dump({
                'test_run': timestamp,
                'diagnostic_logs': self.diagnostic_logs,
                'results_summary': self.results,
            }, f, indent=2)
        
        print()
        print(c(f"💾 Diagnostic logs saved: {log_file}", "dim"))
    
    def _print_summary(self):
        """Print test summary."""
        print()
        print(c("═" * 70, "purple"))
        print(c("📊 PROGRESSIVE TIER TEST SUMMARY", "cyan"))
        print(c("═" * 70, "purple"))
        print()
        
        for model_name, data in self.results.items():
            model_tier = data['model_tier']
            print(c(f"{model_name.upper()} (Native Tier {model_tier}):", "cyan"))
            
            for tier, result in data['tier_results'].items():
                if 'error' in result:
                    print(c(f"  Tier {tier}: Error - {result['error']}", "red"))
                    continue
                
                pass_rate = result['pass_rate']
                passed = result['passed']
                total = result['total']
                
                # Mark if diagnostic (tested outside native tier)
                is_diagnostic = tier > model_tier
                diagnostic_tag = c(" [Diagnostic]", "yellow") if is_diagnostic else ""
                
                if pass_rate >= 80:
                    status = c(f"✅ PASS ({passed}/{total}) {pass_rate:.1f}%", "green")
                elif pass_rate >= 60:
                    status = c(f"⚠️  PARTIAL ({passed}/{total}) {pass_rate:.1f}%", "yellow")
                else:
                    status = c(f"❌ FAIL ({passed}/{total}) {pass_rate:.1f}%", "red")
                
                print(f"  Tier {tier}: {status}{diagnostic_tag}")
            
            print()
        
        print(c("💡 Diagnostic logs include ALL test results, including silent tests", "dim"))
        print(c("   Review logs to see how lower-tier models handle higher-tier requests", "dim"))
        print()

if __name__ == "__main__":
    try:
        tester = ProgressiveTierTester()
        tester.run_progressive_tests()
    except KeyboardInterrupt:
        print()
        print(c("\n⚠️  Tests interrupted by user", "yellow"))
        sys.exit(1)
    except Exception as e:
        print()
        print(c(f"\n✗ Test suite crashed: {e}", "red"))
        import traceback
        traceback.print_exc()
        sys.exit(1)
