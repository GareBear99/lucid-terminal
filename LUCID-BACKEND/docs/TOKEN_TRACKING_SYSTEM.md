# Token Tracking & Execution Statistics System

## Overview
LuciferAI implements Warp AI-style comprehensive token tracking with unique hash IDs for every token, character-level tracking, and complete execution statistics.

## Features

### 1. Exact Token Counting
- **Backend Integration**: Exact token counts from llamafile stderr output
- **Parsing**: Regex patterns match "prompt eval time = ... ms / N tokens" and "eval time = ... ms / N runs"
- **Return Format**: `(text, token_stats)` tuple when `return_stats=True`

### 2. Unique Hash ID System
Every token gets a unique identifier:
```python
{
    'token_id': '2f2d147330ff5549',  # SHA256 hash (16 chars)
    'position': 0,
    'type': 'input' or 'output',
    'content_sample': 'User',
    'chars_in_token': 3.92,
    'linked_to': 'understanding_prompt',
    'request_id': 'f14a6ecf-936b-4bdb-8e41-a09b5097de96'
}
```

**ID Types**:
- `request_id`: UUID for entire user request (links all operations)
- `event_id`: UUID for each token logging event
- `prompt_id`: UUID for each prompt
- `output_id`: UUID for each output
- `token_id`: SHA256 hash for individual tokens
- `char_id`: ID for character-level tracking

### 3. Character & Word Tracking
**Character Log**:
```python
{
    'char': 'U',
    'position': 0,
    'char_id': 'char_0'
}
```

**Word Log**:
```python
{
    'word': 'User',
    'start_pos': 0,
    'end_pos': 3,
    'char_ids': ['char_0', 'char_1', 'char_2', 'char_3'],
    'word_id': 'word_0'
}
```

### 4. Token Display
Shown on all LLM responses:
```
[Input: X tokens (Y chars), Output: Z tokens (W chars), Total: T tokens]
```

### 5. Chars-per-Token Metrics
Logged in session for every response:
- `input_chars_per_token`
- `output_chars_per_token`
- `overall_chars_per_token`

## Session Logging Structure

### Model Token Event
```json
{
    "event_type": "model_tokens",
    "description": "mistral-7b token usage for understanding",
    "metadata": {
        "event_id": "abc123...",
        "request_id": "f14a6ecf-936b...",
        "model": "mistral-7b",
        "tier": 2,
        "phase": "understanding",
        "prompt_id": "def456...",
        "output_id": "ghi789...",
        "prompt_tokens": 54,
        "generated_tokens": 23,
        "total_tokens": 77,
        "prompt_chars": 267,
        "output_chars": 92,
        "input_token_hashes": [...],
        "output_token_hashes": [...],
        "char_tracking": [...],
        "word_tracking": [...],
        "tracking_summary": {
            "input_chars_per_token": 4.9,
            "output_chars_per_token": 4.0,
            "overall_chars_per_token": 4.7
        }
    }
}
```

### Fallback Token Event
```json
{
    "event_type": "fallback_tokens",
    "description": "Fallback understanding token tracking with parsing details",
    "metadata": {
        "event_id": "xyz789...",
        "request_id": "f14a6ecf-936b...",
        "source": "fallback",
        "phase": "understanding",
        "output_id": "abc123...",
        "generated_tokens": 15,
        "output_chars": 68,
        "output_token_hashes": [...],
        "parsing_analysis": {...}
    }
}
```

## Execution Statistics

### Display Order
1. **Statistics show FIRST** (immediately after execution)
2. **Then LLM streams summary** (word-by-word)
3. **Token counts appear** after summary completes

### Statistics Output
```
📊 Execution Statistics:
────────────────────────────────────────────────────────────
📁 Files affected: 1
   • Created: 1
     - make_script_prints_hello.py
   • Modified: 0
   • Overwritten: 0
   • Deleted: 0
   • Moved: 0
📂 Directories affected: 1
   • Created: 1
     - /Users/.../Desktop
   • Deleted: 0
   • Moved: 0
📋 Templates used: 0
🔧 Fixes used: 0
🧠 Models used: 1
   • mistral-7b (Tier 2) - code_generation [46 tokens]
📤 Consensus uploads: 1
   • template: hello_world_script (reused)
🏷️  Tag updates: 0
⏱️  Execution time: 1m 23.45s
────────────────────────────────────────────────────────────

💬 mistral-7b - Execution Summary:
Created a Python script that prints "Hello World" to demonstrate basic output.
   [Input: 89 tokens (445 chars), Output: 19 tokens (76 chars), Total: 108 tokens]
```

## File Tracking

### Never Overwrite Unless Explicitly Asked
- **Auto-rename**: When file exists, LLM suggests creative alternative
- **Placeholder Detection**: Replacing `# Placeholder\n` counts as "Created" not "Overwritten"
- **Explicit Confirmation**: Only asks for overwrite if user specified exact filename

### Directory Tracking
Tracks all directory creation with full path details:
```python
execution_tracker.track_directory_created(dir_path)
```

## Dynamic Filename Generation

### Intelligent Naming
Instead of `custom_script_5.py`:
```python
"make a script that prints hello" → "make_script_prints_hello.py"
```

### Fallback Logic
1. Extract meaningful words from action description
2. Filter out filler words (a, the, that, iconic, etc.)
3. Join with underscores (limit 5 words)
4. Add `.py` extension

### Conflict Resolution
When filename exists:
1. **Ask LLM** for creative alternative
2. **Show suggestion**: "🤖 mistral-7b suggests: print_hello.py"
3. **Fallback**: Use numeric suffix if LLM fails

## Processing Animation

### When Models Load
```
🔌 Starting mistral-7b...
⠋ Loading mistral-7b...
```

Spinner with rotating braille patterns shows while:
- Model is loading
- Generating response
- Validating templates

### Implementation
```python
# lucifer.py
PROCESSING_ACTIVE = False
PROCESSING_MESSAGE = "Processing..."

def processing_animation():
    spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    # ... animation loop
```

## Code Location

### Token Tracking
- **Backend**: `/core/llm_backend.py` lines 533-624
  - `_parse_token_stats()` method
  - Streaming/non-streaming with stats return

### Hash Generation
- **Enhanced Agent**: `/core/enhanced_agent.py` lines 9370-9432
  - Input token hashes with chars-per-token
  - Output token hashes with char_ids linkage
  - Session logging with complete metadata

### Execution Stats
- **Tracker**: `/core/execution_tracker.py`
  - `format_stats_display()` - lines 284-450
  - `track_file_created()`, `track_directory_created()`, etc.
  
### Directory Tracking
- **Enhanced Agent**: `/core/enhanced_agent.py` lines 9776-9791
  - Checks directories before creation
  - Tracks all parent directories created

### Filename Generation
- **Task System**: `/core/universal_task_system.py` lines 617-676
  - Dynamic name generation from action description
  - Filler word filtering
  - LLM-based alternatives

## Usage Examples

### Reading Token Logs
```python
# Session log entry
event = {
    "event_type": "model_tokens",
    "metadata": {
        "request_id": "f14a6ecf...",  # Links all related events
        "input_token_hashes": [
            {
                "token_id": "2f2d1473...",
                "position": 0,
                "chars_in_token": 3.92
            }
        ]
    }
}
```

### Tracking Directory Creation
```python
# Automatically tracked when creating files
Path(file_path).parent.mkdir(parents=True, exist_ok=True)
# → execution_tracker.track_directory_created() called for each new dir
```

### Viewing Stats
Stats automatically display after task completion:
- Files created/modified/deleted/moved
- Directories created/deleted/moved
- Templates and fixes used
- Models used with token counts
- Consensus uploads
- Execution time

## Benefits

### For Debugging
- **Complete Traceability**: Follow any token through entire lifecycle
- **Request Linking**: All operations linked via `request_id`
- **Detailed Metrics**: See exactly where tokens were used

### For Analysis
- **Token Efficiency**: Track chars-per-token ratios
- **Model Performance**: Compare token usage across models
- **Pattern Detection**: Identify common workflows

### For ML Training
- **Structured Data**: Every interaction logged with metadata
- **Parsing Analysis**: Complete keyword and pattern matching data
- **Success Metrics**: Track what works vs. fails

## Future Enhancements

- [ ] Real-time token streaming counters
- [ ] Token cost estimation (for cloud models)
- [ ] Aggregate token statistics dashboard
- [ ] Token prediction models
- [ ] Efficiency recommendations
