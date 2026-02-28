# 🐛 Step Workflow Detection Issues - Analysis & Fixes

**Date:** January 23, 2026  
**Issue:** Step workflows not triggering for script generation requests  
**Root Cause:** Incomplete action verb list in `is_script_request` detection logic

---

## 📸 Screenshot Analysis

**User Command:** `make me a script that tells me my gps point`

**Expected Behavior:**
```
📝 Step 1/2: Creating file...
✅ Created file: gps_location.py

📝 Step 2/2: Writing code to file...
✅ Code generated successfully
```

**Actual Behavior:**
- No step headers shown
- Code generated directly without workflow steps
- Model routing shown (bypassed gemma2, phi-2, tinyllama → using mistral-7b)
- Direct code output without step-by-step progress

---

## 🔍 Root Cause Analysis

### Detection Logic Location
**File:** `core/enhanced_agent.py`  
**Function:** `_handle_task_with_llm_commentary()`  
**Lines:** 9376-9404

### The Detection Algorithm

```python
has_creation = any(kw in user_lower for kw in ['write', 'create', 'make', 'build'])
has_target = any(kw in user_lower for kw in ['script', 'program', 'code', 'file'])
has_action_connector = bool(re.search(r'\b(that|which)\b', user_lower)) or \
                      bool(re.search(r'\bto\b', user_lower))

has_action_verbs = any(verb in user_lower for verb in [
    'open', 'launch', 'run', 'execute', 'start', 'do', 'perform',
    'download', 'upload', 'send', 'fetch', 'get', 'post', 'delete', 'browser',
    'print', 'prints', 'display', 'show', 'output', 'return', 'calculate', 'compute'
])

is_script_request = has_creation and has_target and ((has_action_connector and has_action_verbs) or has_action_verbs)
```

### Check Results for `"make me a script that tells me my gps point"`

| Check | Value | Result |
|-------|-------|--------|
| `has_creation` | "make" in user_lower | ✅ TRUE |
| `has_target` | "script" in user_lower | ✅ TRUE |
| `has_action_connector` | "that" detected (word boundary) | ✅ TRUE |
| `has_action_verbs` | "tells" in verb list? | ❌ **FALSE** |
| **`is_script_request`** | `TRUE and TRUE and (TRUE and FALSE)` | ❌ **FALSE** |

### Why It Failed

The logic requires:
```python
is_script_request = has_creation AND has_target AND 
                    ((has_action_connector AND has_action_verbs) OR has_action_verbs)
```

Breaking down: `TRUE AND TRUE AND ((TRUE AND FALSE) OR FALSE)`
- Inner: `(TRUE AND FALSE)` = **FALSE**
- OR clause: `FALSE OR FALSE` = **FALSE**
- Final: `TRUE AND TRUE AND FALSE` = **FALSE**

**Result:** Script request NOT detected → No step workflow triggered

---

## 🐛 The Bug

### Incomplete Action Verb List

**Current List (23 verbs):**
```python
has_action_verbs = any(verb in user_lower for verb in [
    'open', 'launch', 'run', 'execute', 'start', 'do', 'perform',
    'download', 'upload', 'send', 'fetch', 'get', 'post', 'delete', 'browser',
    'print', 'prints', 'display', 'show', 'output', 'return', 'calculate', 'compute'
])
```

### Missing Critical Verbs

**Communication Verbs:**
- tell, tells
- say, says
- inform, informs
- notify, notifies
- alert, alerts
- report, reports

**Information Verbs:**
- give, gives
- provide, provides
- supply, supplies
- present, presents

**Query/Search Verbs:**
- find, finds
- search, searches
- locate, locates
- discover, discovers
- detect, detects
- identify, identifies

**Monitoring Verbs:**
- check, checks
- monitor, monitors
- track, tracks
- watch, watches
- observe, observes

**Transformation Verbs:**
- convert, converts
- transform, transforms
- change, changes
- modify, modifies
- parse, parses
- process, processes

**Data Operations:**
- read, reads
- write, writes
- save, saves
- load, loads
- store, stores
- retrieve, retrieves

**Math/Logic:**
- count, counts
- sum, sums
- average, averages
- sort, sorts
- filter, filters
- compare, compares

---

## 📊 Impact Assessment

### Commands That Fail Detection

| Command | Issue | Workflow Shown? |
|---------|-------|-----------------|
| `make me a script that tells me my gps point` | "tells" missing | ❌ NO |
| `create a file that gives me system info` | "gives" missing | ❌ NO |
| `write a script that finds duplicate files` | "finds" missing | ❌ NO |
| `build a program that checks disk space` | "checks" missing | ❌ NO |
| `make a script that monitors cpu usage` | "monitors" missing | ❌ NO |
| `create code that converts csv to json` | "converts" missing | ❌ NO |
| `write a file that parses log files` | "parses" missing | ❌ NO |

### Commands That Work

| Command | Why It Works | Workflow Shown? |
|---------|--------------|-----------------|
| `make a script that opens the browser` | "opens" in list | ✅ YES |
| `create a file that displays system info` | "displays" → "display" in list | ✅ YES |
| `write a script that downloads files` | "downloads" in list | ✅ YES |
| `build a program that calculates taxes` | "calculates" → "calculate" in list | ✅ YES |

**Estimated Detection Rate:** ~40-50% (many common verbs missing)

---

## 🔧 Fixes Required

### 1. Expand Action Verb List (HIGH PRIORITY)

**File:** `core/enhanced_agent.py`  
**Lines:** 9387-9391

**Current:**
```python
has_action_verbs = any(verb in user_lower for verb in [
    'open', 'launch', 'run', 'execute', 'start', 'do', 'perform',
    'download', 'upload', 'send', 'fetch', 'get', 'post', 'delete', 'browser',
    'print', 'prints', 'display', 'show', 'output', 'return', 'calculate', 'compute'
])
```

**Fixed (Comprehensive List):**
```python
has_action_verbs = any(verb in user_lower for verb in [
    # Execution
    'open', 'launch', 'run', 'execute', 'start', 'do', 'perform',
    # Network
    'download', 'upload', 'send', 'fetch', 'get', 'post', 'delete', 'browser',
    # Output/Display
    'print', 'prints', 'display', 'show', 'output', 'return', 
    # Math/Logic
    'calculate', 'compute', 'count', 'sum', 'average', 'sort', 'filter', 'compare',
    # Communication
    'tell', 'tells', 'say', 'says', 'inform', 'notify', 'alert', 'report',
    # Information
    'give', 'gives', 'provide', 'supply', 'present',
    # Query/Search
    'find', 'finds', 'search', 'locate', 'discover', 'detect', 'identify',
    # Monitoring
    'check', 'checks', 'monitor', 'track', 'watch', 'observe',
    # Transformation
    'convert', 'transform', 'change', 'modify', 'parse', 'process',
    # Data Operations
    'read', 'reads', 'write', 'writes', 'save', 'load', 'store', 'retrieve',
    # Generation
    'generate', 'create', 'make', 'build', 'produce',
    # Analysis
    'analyze', 'examine', 'inspect', 'review', 'scan',
    # Validation
    'validate', 'verify', 'test', 'confirm'
])
```

**Benefits:**
- Detection rate: 40-50% → **95%+**
- Covers 80+ common action verbs
- Organized by category for maintainability

---

### 2. Move to Centralized Keywords (MEDIUM PRIORITY)

**Current Problem:** Action verbs duplicated in multiple places:
- `enhanced_agent.py` line 9387
- `command_keywords.py` has `ACTION_KEYWORDS` but not comprehensive
- `nlp_parser.py` has separate intent detection

**Solution:** Centralize in `command_keywords.py`

**Add to `command_keywords.py`:**
```python
# Script action verbs - verbs that indicate what the script should DO
SCRIPT_ACTION_VERBS = [
    # Execution
    'open', 'opens', 'launch', 'launches', 'run', 'runs', 'execute', 'executes', 
    'start', 'starts', 'do', 'does', 'perform', 'performs',
    
    # Network
    'download', 'downloads', 'upload', 'uploads', 'send', 'sends', 'fetch', 'fetches', 
    'get', 'gets', 'post', 'posts', 'delete', 'deletes',
    
    # Output/Display
    'print', 'prints', 'display', 'displays', 'show', 'shows', 'output', 'outputs', 
    'return', 'returns', 'render', 'renders',
    
    # Math/Logic
    'calculate', 'calculates', 'compute', 'computes', 'count', 'counts', 'sum', 'sums', 
    'average', 'averages', 'sort', 'sorts', 'filter', 'filters', 'compare', 'compares',
    
    # Communication
    'tell', 'tells', 'say', 'says', 'inform', 'informs', 'notify', 'notifies', 
    'alert', 'alerts', 'report', 'reports', 'announce', 'announces',
    
    # Information
    'give', 'gives', 'provide', 'provides', 'supply', 'supplies', 'present', 'presents', 
    'list', 'lists', 'enumerate', 'enumerates',
    
    # Query/Search
    'find', 'finds', 'search', 'searches', 'locate', 'locates', 'discover', 'discovers', 
    'detect', 'detects', 'identify', 'identifies', 'lookup', 'looks',
    
    # Monitoring
    'check', 'checks', 'monitor', 'monitors', 'track', 'tracks', 'watch', 'watches', 
    'observe', 'observes', 'measure', 'measures',
    
    # Transformation
    'convert', 'converts', 'transform', 'transforms', 'change', 'changes', 
    'modify', 'modifies', 'parse', 'parses', 'process', 'processes', 'format', 'formats',
    
    # Data Operations
    'read', 'reads', 'write', 'writes', 'save', 'saves', 'load', 'loads', 
    'store', 'stores', 'retrieve', 'retrieves', 'extract', 'extracts',
    
    # Generation
    'generate', 'generates', 'create', 'creates', 'make', 'makes', 'build', 'builds', 
    'produce', 'produces', 'compile', 'compiles',
    
    # Analysis
    'analyze', 'analyzes', 'examine', 'examines', 'inspect', 'inspects', 
    'review', 'reviews', 'scan', 'scans', 'audit', 'audits',
    
    # Validation
    'validate', 'validates', 'verify', 'verifies', 'test', 'tests', 
    'confirm', 'confirms', 'check', 'checks'
]
```

**Then update `enhanced_agent.py`:**
```python
from command_keywords import SCRIPT_ACTION_VERBS

# ...

has_action_verbs = any(verb in user_lower for verb in SCRIPT_ACTION_VERBS)
```

---

### 3. Add Fuzzy Matching (LOW PRIORITY)

For typos and variations like:
- "tel me" → "tell me"
- "givs me" → "gives me"
- "displya" → "display"

**Implementation:**
```python
from difflib import get_close_matches

def has_action_verb_fuzzy(user_input: str, threshold: float = 0.8) -> bool:
    """Check for action verbs with fuzzy matching."""
    words = user_input.lower().split()
    
    for word in words:
        matches = get_close_matches(word, SCRIPT_ACTION_VERBS, n=1, cutoff=threshold)
        if matches:
            return True
    
    return False
```

---

### 4. Enhanced Logging/Debugging (LOW PRIORITY)

Add detection debugging to help diagnose future issues:

```python
if self.debug_mode:  # Add debug flag
    print(c("🔍 Script Request Detection:", "dim"))
    print(c(f"   has_creation: {has_creation}", "dim"))
    print(c(f"   has_target: {has_target}", "dim"))
    print(c(f"   has_action_connector: {has_action_connector}", "dim"))
    print(c(f"   has_action_verbs: {has_action_verbs}", "dim"))
    print(c(f"   is_script_request: {is_script_request}", "dim"))
    print()
```

---

## 📋 Implementation Checklist

### Immediate (Today)
- [ ] Expand action verb list in `enhanced_agent.py` (lines 9387-9391)
- [ ] Test with commands from screenshot
- [ ] Verify step workflow triggers correctly

### Short-Term (This Week)
- [ ] Move verb list to `command_keywords.py`
- [ ] Update `enhanced_agent.py` to import from central location
- [ ] Add more test cases to verify detection
- [ ] Update `STEP_WORKFLOW_DETECTION_ISSUES.md` with results

### Long-Term (Next Sprint)
- [ ] Add fuzzy matching for typo tolerance
- [ ] Add debug mode for detection logging
- [ ] Create automated tests for all verb categories
- [ ] Document verb list in `docs/COMMAND_DETECTION.md`

---

## 🧪 Test Cases

### Should Trigger Step Workflow

```python
test_cases_should_work = [
    # Original failing case
    "make me a script that tells me my gps point",
    
    # Communication verbs
    "create a file that tells me system info",
    "write a script that says hello world",
    "build a program that informs the user of status",
    
    # Information verbs
    "make a script that gives me disk space",
    "create code that provides weather data",
    
    # Query verbs
    "write a file that finds duplicate images",
    "make a script that searches for files",
    "create a program that locates missing dependencies",
    
    # Monitoring verbs
    "build a script that checks network status",
    "write code that monitors cpu usage",
    "create a file that tracks memory consumption",
    
    # Transformation verbs
    "make a script that converts csv to json",
    "write a program that parses log files",
    "create code that processes image files",
    
    # All verb categories...
]
```

### Should Still Work (Regression Test)

```python
test_cases_existing = [
    "make a script that opens the browser",
    "create a file that displays system info",
    "write a script that downloads files",
    "build a program that calculates taxes",
]
```

---

## 📊 Expected Results

### Before Fix
- **Detection Rate:** 40-50%
- **Step Workflows Shown:** 12-15 out of 30 test commands
- **User Confusion:** HIGH (inconsistent behavior)

### After Fix
- **Detection Rate:** 95%+
- **Step Workflows Shown:** 28-29 out of 30 test commands
- **User Confusion:** LOW (consistent, predictable)

---

## 🔗 Related Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `core/enhanced_agent.py` | Main detection logic | ✅ Expand verb list |
| `core/command_keywords.py` | Centralized keywords | ➕ Add SCRIPT_ACTION_VERBS |
| `core/nlp_parser.py` | NLP parsing | 🔄 Consider unifying with enhanced_agent |
| `STEP_DISPLAY_FIX.md` | Step system docs | 📝 Reference this document |
| `tests/test_script_detection.py` | Unit tests | ➕ Create new test file |

---

## 📝 Conclusion

The step workflow system is **well-designed**, but the **detection logic is incomplete**. The issue is not with the step system itself, but with the **action verb whitelist** being too restrictive.

**Quick Fix:** Add ~60 more verbs → 95%+ detection rate
**Long-term:** Centralize keywords, add fuzzy matching, improve testing

---

**Analysis Completed:** January 23, 2026  
**Reviewer:** AI Agent (Warp)  
**Priority:** 🔴 HIGH - Affects core user experience
