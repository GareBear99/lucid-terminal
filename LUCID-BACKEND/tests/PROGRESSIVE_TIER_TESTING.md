# Progressive Tier Testing System

## Overview
The progressive tier testing system tests LLMs through escalating complexity levels, with each tier using all LuciferAI commands at appropriate difficulty.

## How It Works

### Progressive Flow
1. **All models start at Tier 0**
2. **Pass Tier 0 (≥80%)** → Advance to Tier 1
3. **Pass Tier 1 (≥80%)** → Advance to Tier 2  
4. **Pass Tier 2 (≥80%)** → Advance to Tier 3
5. **Fail any tier** → Stop progression, continue in diagnostic mode

### Diagnostic Mode
- **Lower-tier models ARE tested on higher tiers**
- Results logged to diagnostics file (not shown in output)
- Helps debug how lower models handle complex requests
- Marked with `[Diagnostic]` tag in summary

## Tier Test Composition

### Tier 0 - Basic (10 tests)
**Commands Tested:**
- File Operations: `list`, `pwd`, `read`
- Info Commands: `memory`, `help`
- Basic AI Queries: Simple math, greetings, common knowledge

**Complexity:** Single-step, direct answers
**Example:** "What is 2+2?" → "4"

### Tier 1 - General (9 tests)
**Commands Tested:**
- Build Commands: `create folder`, `create file`
- File Finding: `find *.py`, `find README`
- Moderate AI Queries: Explanations, comparisons
- Package Queries: Installation instructions

**Complexity:** Multi-sentence explanations, basic reasoning
**Example:** "Explain photosynthesis" → Paragraph explanation

### Tier 2 - Advanced (9 tests)
**Commands Tested:**
- Daemon/Fix: Understanding watch, fix concepts
- Code Generation: Functions, algorithms
- Code Debugging: Syntax fixes, error detection
- Complex Analysis: Technical comparisons
- Advanced Concepts: Recursion, patterns

**Complexity:** Code generation, debugging, detailed analysis
**Example:** "Write function to reverse string" → Complete function with def/return

### Tier 3 - Expert (10 tests)
**Commands Tested:**
- Advanced Data Structures: BST, heaps
- Algorithm Analysis: Complexity, trade-offs
- System Design: APIs, distributed systems
- Code Refactoring: SOLID principles
- Optimization: N+1, rate limiting

**Complexity:** System architecture, optimization, expert-level code
**Example:** "Design RESTful API for social platform" → Complete architecture with endpoints

## Test Criteria

### Keyword Matching
- Each test has expected keywords
- **Pass threshold:** 40% of keywords found
- **Tier advancement:** 80% of tests must pass

### Examples
```
Query: "What is Python?"
Keywords: ["python", "programming", "language"]
Response must contain at least 2/3 keywords to pass
```

## Running Tests

### Run All Models
```bash
cd tests
python3 progressive_tier_test.py
```

### Expected Output
```
╔═══════════════════════════════════════════════════════════════╗
║         🧪 PROGRESSIVE TIER TESTING SYSTEM                    ║
╚═══════════════════════════════════════════════════════════════╝

Detected models:
  • TINYLLAMA (Tier 0)
  • MISTRAL (Tier 2)

═══════════════════════════════════════════════════════════════
Testing TINYLLAMA (Native Tier 0)
═══════════════════════════════════════════════════════════════

──────────────────────────────────────────────────────────────
Testing TINYLLAMA (Tier 0) on Tier 0 tests
──────────────────────────────────────────────────────────────

  [1/10] List Directory... ✅
  [2/10] Show Current Directory... ✅
  [3/10] Read File... ✅
  ...
  [10/10] Simple Counting... ✅

  Results: 10/10 passed (100.0%)

──────────────────────────────────────────────────────────────
Testing TINYLLAMA (Tier 0) on Tier 1 tests
──────────────────────────────────────────────────────────────

  [1/9] Create Folder... ✅
  [2/9] Create File... ✅
  ...
  [9/9] Package Install Query... ❌

  Results: 6/9 passed (66.7%)

⚠️  Did not pass Tier 1 threshold (80%)
   Stopping progression at Tier 1

   Continuing higher tiers in diagnostic mode...

🔍 Tier 2 (Diagnostic Mode - Testing outside native tier)
🔍 Tier 3 (Diagnostic Mode - Testing outside native tier)

💾 Diagnostic logs saved: .luciferai/logs/progressive_tier_diagnostics_20250125_093000.json
```

## Diagnostic Logs

### Location
`.luciferai/logs/progressive_tier_diagnostics_[timestamp].json`

### Contents
```json
{
  "test_run": "20250125_093000",
  "diagnostic_logs": [
    {
      "timestamp": "2025-01-25T09:30:01",
      "model": "tinyllama",
      "model_tier": 0,
      "test_tier": 2,
      "result": {
        "question": "Write a Python function to reverse a string",
        "description": "Code Generation",
        "response": "def reverse(s): return s[::-1]",
        "keywords": ["def", "reverse", "return", "[::-1]"],
        "matches": 4,
        "success": true
      }
    }
  ],
  "results_summary": {
    "tinyllama": {
      "model_tier": 0,
      "tier_results": {
        "0": {"passed": 10, "total": 10, "pass_rate": 100.0},
        "1": {"passed": 6, "total": 9, "pass_rate": 66.7},
        "2": {"passed": 3, "total": 9, "pass_rate": 33.3},
        "3": {"passed": 1, "total": 10, "pass_rate": 10.0}
      }
    }
  }
}
```

### Analysis Use Cases
1. **Performance degradation:** See where lower-tier models fail
2. **Capability discovery:** Find unexpected successes
3. **Prompt engineering:** Identify what works across tiers
4. **Model comparison:** Compare how different models handle same queries

## Summary Output

### Format
```
═══════════════════════════════════════════════════════════════
📊 PROGRESSIVE TIER TEST SUMMARY
═══════════════════════════════════════════════════════════════

TINYLLAMA (Native Tier 0):
  Tier 0: ✅ PASS (10/10) 100.0%
  Tier 1: ⚠️  PARTIAL (6/9) 66.7%
  Tier 2: ❌ FAIL (3/9) 33.3% [Diagnostic]
  Tier 3: ❌ FAIL (1/10) 10.0% [Diagnostic]

MISTRAL (Native Tier 2):
  Tier 0: ✅ PASS (10/10) 100.0%
  Tier 1: ✅ PASS (9/9) 100.0%
  Tier 2: ✅ PASS (9/9) 100.0%
  Tier 3: ⚠️  PARTIAL (7/10) 70.0% [Diagnostic]

💡 Diagnostic logs include ALL test results, including silent tests
   Review logs to see how lower-tier models handle higher-tier requests
```

## Scoring

### Pass Criteria
- **✅ PASS:** ≥80% (8/10 or 7/9 tests)
- **⚠️  PARTIAL:** 60-79% (6-7/10 or 5-6/9 tests)
- **❌ FAIL:** <60% (<6/10 or <5/9 tests)

### Progression Rules
1. Must pass (≥80%) to advance to next tier
2. Fail = stop showing results, continue in diagnostic mode
3. Native tier and above = diagnostic mode
4. All tests always run and log for analysis

## Benefits

### For Development
- **Identify capability gaps:** See exactly where models struggle
- **Validate improvements:** Track progress across versions
- **Compare models:** Objective tier-appropriate benchmarks

### For Users  
- **Clear tier expectations:** Know what each tier can handle
- **Informed model selection:** Choose right model for task complexity
- **Progressive testing:** Confidence in tier assignments

### For Debugging
- **Silent diagnostics:** Test all tiers without clutter
- **Full logging:** Complete test history for analysis
- **Keyword tracking:** See what models understand vs miss

## Adding New Tests

### Template
```python
def _get_tierN_tests(self) -> List[Tuple[str, str, List[str]]]:
    """TierN: Description.
    Tests: Command categories
    """
    return [
        # Category
        ("query", "Description", ["keyword1", "keyword2", "keyword3"]),
    ]
```

### Guidelines
1. **Use all command types** appropriate for tier
2. **Match help page descriptions** for tier capabilities  
3. **5-10 tests per tier** for balanced coverage
4. **3-8 keywords per test** for reliable validation
5. **40% threshold** allows partial understanding

## Related Files
- `tests/progressive_tier_test.py` - Main test script
- `core/model_tiers.py` - Tier definitions
- `.luciferai/logs/progressive_tier_diagnostics_*.json` - Test logs
- `tests/test_all_commands.py` - Legacy command tests
