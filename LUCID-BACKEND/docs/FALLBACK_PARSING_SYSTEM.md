# Fallback Parsing System - Complete Documentation

## Overview
When all LLM models fail or timeout, LuciferAI uses a sophisticated fallback parsing system that logs every detail of how it parsed and understood the request.

## Architecture

### Two-Layer Parsing

#### Layer 1: Simple Keyword Matching (Fallback Understanding)
Quick response generation based on detected keywords:
- `browser` → "I'll create a Python script that opens the system's default web browser using the webbrowser module."
- `file` → "I'll create a Python script to {action}."
- Generic → "I'll create a Python script that {action}."

#### Layer 2: Universal Task System (Actual Execution)
Sophisticated regex pattern matching for task execution:
- 9 different regex patterns
- Location extraction (`~/Desktop/Projects/foo`)
- Name extraction (`file called test.py`)
- Action extraction (`that opens the browser`)

## Complete Parsing Analysis Structure

### 1. Raw Input Data
```json
{
    "raw_input": {
        "original": "make a script that prints hello",
        "action_description": "prints hello",
        "lowercased": "make a script that prints hello",
        "char_count": 32,
        "word_count": 6,
        "has_question_mark": false,
        "has_exclamation": false
    }
}
```

### 2. Keyword Detection
```json
{
    "keywords": {
        "all_detected": ["make", "script", "print", "hello"],
        "unique": ["make", "script", "print", "hello"],
        "count": 4,
        "by_category": {
            "create": ["make"],
            "script": ["script"],
            "print": ["print"]
        },
        "density": 0.67
    }
}
```

**Keyword Categories**:
- `create`: create, make, generate, build
- `script`: script, file, program
- `print`: print, display, show, output
- `open`: open, launch, start
- `run`: run, execute, start
- `read`: read, load, get
- `write`: write, save, store

### 3. Sentence Structure Analysis
```json
{
    "sentence_structure": {
        "has_that": true,
        "has_which": false,
        "has_to": false,
        "word_count": 6
    }
}
```

Analyzes grammatical structure to understand intent:
- Presence of "that", "which", "to"
- Word count for complexity estimation

### 4. Decision Flow
```json
{
    "decision_flow": {
        "primary_action": "generic_script",
        "detected_module": null,
        "response_template": "generic",
        "fallback_reason": "no_llm_available",
        "branches_evaluated": [
            {"condition": "browser in text", "result": false},
            {"condition": "file in text", "result": false},
            {"condition": "generic fallback", "result": true}
        ]
    }
}
```

Shows exact path through decision tree.

### 5. Task System Integration
```json
{
    "task_system": {
        "complexity": "advanced",
        "complexity_enum": "TaskComplexity.ADVANCED",
        "tier_required": 1,
        "tier_name": "Tier 1",
        "task_description": "Create script that prints hello",
        "has_subtasks": false,
        "has_verification": false,
        "task_args": {
            "file": "/Users/.../make_script_prints_hello.py",
            "folder": "/Users/.../Desktop",
            "action_description": "prints hello",
            "original_command": "make a script that prints hello"
        }
    }
}
```

**Task Complexity Levels**:
- `SIMPLE`: Single operation (mkdir, touch, echo)
- `MODERATE`: 2-3 operations (create folder + file)
- `COMPLEX`: 4+ operations or logic required
- `ADVANCED`: Code generation, refactoring, debugging

**Model Tiers**:
- `TIER_0`: TinyLlama, Phi (1-2B)
- `TIER_1`: Llama 3.2, Gemma (3-8B)
- `TIER_2`: Mistral, Llama 3.1 (7-13B)
- `TIER_3`: DeepSeek, CodeLlama (13-34B)
- `TIER_4`: Llama3-70B, Mixtral-8x22B (70B+)

### 6. Extraction Results
```json
{
    "extractions": {
        "file_path": "/Users/.../make_script_prints_hello.py",
        "folder_path": "/Users/.../Desktop",
        "action_extracted": "prints hello",
        "original_command": "make a script that prints hello",
        "methods_succeeded": {
            "file_extraction": true,
            "folder_extraction": true,
            "action_extraction": true
        },
        "all_args": ["file", "folder", "action_description", "original_command"]
    }
}
```

**Extraction Methods**:
- `_extract_name_after_keywords()`: Extracts filenames/folder names
- `_extract_location()`: Extracts paths (~/Desktop, /full/path)
- `_extract_action()`: Extracts "that opens browser" type clauses

### 7. Pattern Matching
```json
{
    "pattern_matching": {
        "patterns_checked": [
            "write_to_file",
            "complex_script_creation",
            "move_operations",
            "find_and_move",
            "folder_with_file",
            "folder_only",
            "file_only",
            "code_generation",
            "directory_operations"
        ],
        "pattern_matched": "Create script that prints hello",
        "match_confidence": "high"
    }
}
```

**Regex Patterns** (from `universal_task_system.py`):
1. `write\s+to\s+[\w./~-]+\s+(.+)` - Write to file
2. `(?:create|write|make).+(?:file|script).+(?:that|which).+(?:open|launch)` - Complex script
3. `(?:move|mv)\s+[\w.-]+\s+from\s+.+\s+to\s+` - Move with explicit paths
4. `(?:where|find|locate).+(?:move|put|transfer)` - Find and move
5. `(?:build|create|make).+(?:folder|directory).+(\\w+).+(?:file|script).+(\\w+\\.\\w+)` - Folder with file
6. `(?:build|create|make).+(?:folder|directory).+(\\w+)` - Folder only
7. `(?:build|create|make).+(?:file|script).+(\\w+\\.\\w+)` - File only
8. `(?:write|generate|create|make).+(?:python|py).+(?:script|file)` - Code generation
9. `(?:list|show|display).+(?:files|directory|folder)` - Directory operations

### 8. Response Generation
```json
{
    "response_generation": {
        "template_type": "generic",
        "response_text": "I'll create a Python script that prints hello.",
        "response_length": 47,
        "response_word_count": 8,
        "includes_module_name": false,
        "is_generic": true
    }
}
```

**Template Types**:
- `browser_specific`: Mentions webbrowser module
- `file_operation`: Generic file operation
- `generic`: Fallback template

### 9. Context & State
```json
{
    "context": {
        "request_id": "f14a6ecf-936b-4bdb-8e41-a09b5097de96",
        "session_files_count": 3,
        "task_history_count": 12,
        "available_models": 4,
        "why_fallback": "All LLM models failed or timed out"
    }
}
```

Provides context about why fallback was used.

### 10. Debug Metadata
```json
{
    "debug_metadata": {
        "timestamp": "2025-11-15T09:00:00.123456",
        "python_version": "3.9.6",
        "parsing_version": "2.0",
        "feature_flags": {
            "keyword_detection": true,
            "sentence_analysis": true,
            "task_system_integration": true,
            "pattern_matching": true
        }
    }
}
```

## Code Locations

### Fallback Understanding Generation
**File**: `/core/enhanced_agent.py` lines 9564-9624
```python
# Detect keywords
if 'browser' in action_lower:
    detected_keywords.append('browser')
    parsing_logic['primary_action'] = 'open_browser'
    parsing_logic['detected_module'] = 'webbrowser'
    response_template = 'browser_specific'
    expanded = "I'll create a Python script that opens..."
```

### Universal Task System Parsing
**File**: `/core/universal_task_system.py` lines 129-193
```python
def parse_command(self, command: str) -> Optional[Task]:
    command_lower = command.lower()
    
    patterns = {
        r'write\s+to\s+([\w./~-]+)\s+(.+)': self._write_to_file,
        r'(?:create|write|make).+(?:file|script).+(?:that|which).+': self._generate_complex_script,
        # ... 7 more patterns
    }
    
    for pattern, handler in patterns.items():
        match = re.search(pattern, command_lower)
        if match:
            return handler(command, match)
```

### Extraction Methods
**File**: `/core/universal_task_system.py`
- `_extract_name_after_keywords()` - lines 1281-1345
- `_extract_location()` - lines 1347-1391
- `_extract_file_hint_from_query()` - lines 1393-1428
- `_extract_search_target()` - lines 1430-1446
- `_extract_destination()` - lines 1470-1490

### Session Logging
**File**: `/core/enhanced_agent.py` lines 9650-9777
```python
self.session_logger.log_event(
    event_type='fallback_tokens',
    description='Fallback understanding token tracking with parsing details',
    metadata={
        'parsing_analysis': {
            'raw_input': {...},
            'keywords': {...},
            'task_system': {...},
            # ... complete analysis
        }
    }
)
```

## Usage Examples

### Viewing Fallback Logs
```bash
# Session logs stored in:
~/.luciferai/sessions/YYYY-MM-DD/session_TIMESTAMP.json

# Search for fallback events:
jq '.events[] | select(.event_type == "fallback_tokens")' session.json

# View parsing analysis:
jq '.events[] | select(.event_type == "fallback_tokens") | .metadata.parsing_analysis' session.json
```

### Analyzing Keywords
```python
# Extract all detected keywords from session
import json
with open('session.json') as f:
    session = json.load(f)
    
for event in session['events']:
    if event['event_type'] == 'fallback_tokens':
        keywords = event['metadata']['parsing_analysis']['keywords']
        print(f"Detected: {keywords['unique']}")
        print(f"Density: {keywords['density']}")
```

### Pattern Match Analysis
```python
# See which patterns matched most frequently
from collections import Counter

patterns_matched = []
for event in session['events']:
    if event['event_type'] == 'fallback_tokens':
        pattern = event['metadata']['parsing_analysis']['pattern_matching']['pattern_matched']
        patterns_matched.append(pattern)

Counter(patterns_matched).most_common()
```

## Debugging Workflow

### 1. Check Raw Input
```python
raw_input = event['metadata']['parsing_analysis']['raw_input']
print(f"User said: {raw_input['original']}")
print(f"Extracted action: {raw_input['action_description']}")
```

### 2. Verify Keywords
```python
keywords = event['metadata']['parsing_analysis']['keywords']
print(f"Found keywords: {keywords['unique']}")
print(f"By category: {keywords['by_category']}")
```

### 3. Trace Decision Flow
```python
flow = event['metadata']['parsing_analysis']['decision_flow']
print(f"Primary action: {flow['primary_action']}")
for branch in flow['branches_evaluated']:
    print(f"  {branch['condition']}: {branch['result']}")
```

### 4. Check Task System
```python
task = event['metadata']['parsing_analysis']['task_system']
print(f"Complexity: {task['complexity']}")
print(f"Tier required: {task['tier_name']}")
print(f"Task: {task['task_description']}")
```

### 5. Verify Extractions
```python
extractions = event['metadata']['parsing_analysis']['extractions']
print(f"File: {extractions['file_path']}")
print(f"Folder: {extractions['folder_path']}")
print(f"Action: {extractions['action_extracted']}")
print(f"Methods succeeded: {extractions['methods_succeeded']}")
```

## Benefits

### For Debugging
- **Complete Transparency**: See exactly what the system understood
- **Decision Tracing**: Follow every branch in the decision tree
- **Error Analysis**: Understand why specific paths were taken

### For Improvement
- **Pattern Analysis**: Identify which patterns work best
- **Keyword Optimization**: See which keywords are most reliable
- **Template Refinement**: Know when to add new response templates

### For ML Training
- **Labeled Data**: Every fallback is a labeled training example
- **Feature Engineering**: Rich feature set for model training
- **Success Metrics**: Compare fallback vs. LLM success rates

## Future Enhancements

- [ ] ML model to predict best pattern for input
- [ ] Confidence scores for each parsing step
- [ ] Automatic pattern suggestion based on failures
- [ ] A/B testing for different extraction methods
- [ ] Real-time parsing visualization
- [ ] Fallback success rate tracking
- [ ] Pattern performance analytics dashboard
