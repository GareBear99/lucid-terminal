# LuciferAI Context System - Developer Guide

## Overview

The context system tracks user actions and enables natural, conversational interactions by maintaining state across commands.

## State Variables

### `self.last_created_file` (str | None)
Tracks the most recently created file path.

**Set by:**
- `_handle_task_with_llm_commentary()` (line 9036)
- `_handle_universal_task()` (line 9149)
- Task system execution

**Used for:**
- Contextual script modifications ("make it better")
- Script questions ("what does it do")
- Follow-up actions

**Example:**
```python
# After: "create test.py on desktop"
self.last_created_file = "/Users/username/Desktop/test.py"

# User can then say: "run it"
# System knows "it" = "/Users/username/Desktop/test.py"
```

### `self.last_execution` (dict | None)
Tracks the most recent script execution and its results.

**Structure:**
```python
{
    'filepath': str,      # Path to executed script
    'success': bool,      # Whether execution succeeded
    'stdout': str,        # Standard output
    'stderr': str         # Standard error (if any)
}
```

**Set by:**
- `_handle_run_script_with_commentary()` (lines 1870-1876)
- `_handle_run_script()` (lines 1940-1946)

**Used for:**
- Execution-aware explanations
- Debugging questions
- Result references

**Example:**
```python
# After: "run test.py" outputs "Hello world"
self.last_execution = {
    'filepath': '/Users/username/Desktop/test.py',
    'success': True,
    'stdout': 'Hello world\n',
    'stderr': ''
}

# User can then ask: "what did it do?"
# System provides explanation with actual output
```

## Pattern Matching

### Script Questions
Regex patterns that trigger `_handle_explain_script()`:

```python
script_question_patterns = [
    # Present and past tense
    r'(?:what|how)\s+(?:does|did|is|was)\s+(?:it|that|the script)\s+(?:do|doing|work)',
    
    # Explanation requests
    r'(?:explain|describe|tell me about)\s+(?:it|that|the script)',
    
    # Simpler forms
    r'(?:what|how)\s+(?:does|did)\s+(?:it|that|the script)',
    
    # Past tense with optional prefix
    r'(?:so\s+)?what\s+did\s+(?:it|that|the script)\s+do',
    
    # Very simple form
    r'what\s+(?:does|did)\s+(?:it|that)\s+do',
]
```

**Matches:**
- "what does it do"
- "what did the script do"
- "so what did it do"
- "how did it work"
- "explain it"
- "tell me about the script"

### Script Modifications
Patterns that trigger `_handle_modify_script()`:

```python
modification_patterns = [
    r'^(?:make|update|improve|enhance|modify|change|edit)\s+(?:it|that|the script)\s+(.+)',
    r'^(?:make|update|improve|enhance|modify|change|edit)\s+(.+)',
]
```

**Matches:**
- "make it better"
- "improve the script"
- "modify it to add error handling"

## Best Practices

### 1. Always Track Context

When creating or modifying files:
```python
# ✅ Good
file_path = create_file(...)
self.last_created_file = file_path

# ❌ Bad - context lost
create_file(...)
# No tracking
```

### 2. Always Track Execution

When running scripts:
```python
# ✅ Good
result = run_python_code(script_content)
if result.get('success'):
    self.last_execution = {
        'filepath': filepath,
        'success': True,
        'stdout': result.get('stdout', ''),
        'stderr': result.get('stderr', '')
    }

# ❌ Bad - execution not tracked
result = run_python_code(script_content)
# No tracking
```

### 3. Check Context Before Using

Always validate context exists:
```python
# ✅ Good
if self.last_created_file and self.last_created_file.endswith('.py'):
    return self._handle_explain_script(self.last_created_file, user_input)
else:
    return "No recent script found."

# ❌ Bad - assumes context exists
return self._handle_explain_script(self.last_created_file, user_input)
```

### 4. Leverage Execution Context in Explanations

When explaining scripts, check for execution history:
```python
# ✅ Good
has_execution = (self.last_execution and 
                self.last_execution.get('filepath') == filepath and 
                self.last_execution.get('success'))

if has_execution and self.last_execution.get('stdout'):
    # Include output in explanation
    prompt = f"Script code:\n{code}\n\nOutput:\n{self.last_execution['stdout']}"
else:
    # Code-only explanation
    prompt = f"Script code:\n{code}"

# ❌ Bad - ignores execution context
prompt = f"Script code:\n{code}"
```

## Adding New Context

To add new context variables:

### 1. Initialize in `__init__`
```python
self.last_created_file = None
self.last_execution = None
self.last_database_query = None  # NEW
```

### 2. Track in Relevant Handlers
```python
def _handle_database_query(self, query):
    result = execute_query(query)
    
    # Track context
    self.last_database_query = {
        'query': query,
        'rows_affected': result.rows,
        'timestamp': datetime.now()
    }
    
    return result
```

### 3. Use in Follow-up Handlers
```python
# Check for contextual follow-ups
if "show results" in user_input and self.last_database_query:
    return self._display_query_results(self.last_database_query)
```

### 4. Add Pattern Matching
```python
# In _route_request
database_patterns = [
    r'show\s+(?:the\s+)?(?:query\s+)?results',
    r'what\s+did\s+the\s+query\s+return',
]

for pattern in database_patterns:
    if re.search(pattern, user_lower):
        if self.last_database_query:
            return self._explain_query_results(self.last_database_query)
```

## Context Persistence

Currently, context is **session-based** (memory only). For cross-session persistence:

### Option 1: Use LuciferMemory
```python
from lucifer_memory import LuciferMemory

# In __init__
self.memory = LuciferMemory(self.user_id)

# Log events with context
self.memory.log_event(
    event_type="script_execution",
    target=filepath,
    message=f"Executed {filepath}",
    context={
        'success': True,
        'stdout': result['stdout'],
        'timestamp': datetime.now().isoformat()
    }
)

# Retrieve recent executions
recent_runs = self.memory.get_recent_events(limit=5, event_type="script_execution")
```

### Option 2: Context Files
```python
# Save context to disk
CONTEXT_FILE = Path.home() / ".luciferai" / "context.json"

def _save_context(self):
    context = {
        'last_created_file': self.last_created_file,
        'last_execution': self.last_execution,
        'timestamp': datetime.now().isoformat()
    }
    CONTEXT_FILE.write_text(json.dumps(context, indent=2))

def _load_context(self):
    if CONTEXT_FILE.exists():
        context = json.loads(CONTEXT_FILE.read_text())
        self.last_created_file = context.get('last_created_file')
        self.last_execution = context.get('last_execution')
```

## Testing Context

### Unit Test Pattern
```python
def test_context_tracking():
    agent = EnhancedLuciferAgent()
    
    # Create file
    agent.process_request("create test.py")
    assert agent.last_created_file is not None
    
    # Run file
    agent.process_request(f"run {agent.last_created_file}")
    assert agent.last_execution is not None
    assert agent.last_execution['filepath'] == agent.last_created_file
    
    # Ask about it
    response = agent.process_request("what did it do")
    assert "generic" not in response.lower()
```

### Manual Test Pattern
```python
# Simulate conversation
commands = [
    "create hello.py that prints hello",
    "run hello.py",
    "what did it do"
]

for cmd in commands:
    print(f"User: {cmd}")
    response = agent.process_request(cmd)
    print(f"Agent: {response}")
    print()
```

## Troubleshooting

### Context Not Persisting
**Problem:** `last_created_file` is None after creation

**Solution:** Ensure tracking happens in all creation paths
```python
# Check all places that create files:
grep -r "write_file\|create_file\|Path.*write_text" core/
# Add tracking after each creation
```

### Pattern Not Matching
**Problem:** User question doesn't trigger handler

**Solution:** Test pattern manually
```python
import re
user_input = "what did the script do"
pattern = r'what\s+did\s+(?:it|that|the script)\s+do'
print(re.search(pattern, user_input))  # Should match
```

### Execution Context Missing
**Problem:** `last_execution` is None after running script

**Solution:** Check run handlers include tracking
```python
# Search for all script execution points
grep -r "run_python_code" core/
# Verify each sets last_execution on success
```

## Summary

The context system enables natural conversations by:
- **Tracking** recent actions (files created, scripts run)
- **Pattern matching** contextual questions and commands
- **Referencing** tracked context in responses
- **Maintaining** state across the session

Key files:
- `core/enhanced_agent.py` - Main context tracking
- `core/lucifer_memory.py` - Optional persistence
- `tests/test_context_awareness.py` - Integration tests
