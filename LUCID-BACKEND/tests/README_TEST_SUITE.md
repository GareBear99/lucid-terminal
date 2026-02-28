# LuciferAI Test Suite Documentation

## Overview
Comprehensive test suite for validating AI model capabilities across different tiers (0-3), with support for zodiac knowledge, memory management, and tier-appropriate upgrade prompts.

## Test Structure

### Total Tests: 49

#### Section 1: Basic Commands (4 tests)
- `memory` - Check conversation memory
- `help` - Display help
- `clear history` - Clear conversation history
- `memory` (after clear) - Verify memory was cleared

#### Section 2: Conversation Memory (12 tests)
**Basic (2 tests)**
- Set simple fact (name)
- Recall simple fact

**Standard (2 tests)**
- Set preference
- Recall preference

**Advanced (8 tests)**
- Set multiple facts
- Recall multiple facts
- Set related facts (pets)
- Recall related facts
- Set distinct preferences (morning routine)
- Recall context-specific facts
- Set date and derived info (birthday + zodiac)
- Recall date and inference

#### Section 3: Simple AI Queries (6 tests)
**Basic (2 tests)**
- Terminal command definition (ls)
- Technical word definition (algorithm)

**Standard (2 tests)**
- Concise explanation (grep)
- Abstract concept (serendipity)

**Advanced (2 tests)**
- Multi-step how-to
- Comparison task

#### Section 4: Horoscope & Zodiac Knowledge (12 tests)
**Basic (3 tests)**
- Define zodiac sign (What is a Virgo?)
- Date range query (When is Aries season?)
- Enumerate all signs (List all zodiac signs)

**Standard (3 tests)**
- Birth month to sign conversion (born in August)
- Specific birth date (March 25th)
- Sequential order (What comes after Gemini?)

**Advanced (6 tests)**
- Sign characteristics (traits of Leo)
- Element association (Scorpio = Water)
- Group by element (Which are fire signs?)
- Compatibility (Aries + Libra)
- Ruling planet (Pisces)
- Sign symbol (Sagittarius)

**Implementation**: Uses keyword-based `zodiac_knowledge.py` module for instant responses without LLM calls.

#### Section 5: Multi-Step Requests (6 tests)
**Basic (2 tests)**
- Single folder creation
- File listing

**Standard (2 tests)**
- Folder + file creation
- System check + recommendation

**Advanced (2 tests)**
- File listing + analysis
- 3 sequential operations

#### Section 6: Tier 0 Limitations (3 tests)
Complex queries that **should** trigger upgrade prompts for Tier 0 (TinyLlama):

1. **Multi-step philosophical reasoning**
   - Query: Compare determinism vs free will + quantum mechanics reconciliation
   - Expected: Upgrade prompt to Mistral/Llama3.2
   
2. **Complex economic analysis**
   - Query: Cryptocurrency impact analysis across 3 countries + predictions
   - Expected: Upgrade prompt

3. **Deep technical specification**
   - Query: Distributed microservices architecture spec with security
   - Expected: Upgrade prompt (may attempt response due to training data)

**Validation Logic**:
- **Tier 0**: Should show upgrade prompts for these tests ✅
- **Tier 1+**: Should handle without upgrade prompts ✅

#### Section 7: Edge Cases (6 tests)
**Basic (2 tests)**
- Empty command
- Gibberish input

**Standard (2 tests)**
- Philosophical question
- Large output request

**Advanced (2 tests)**
- Invalid syntax
- Unreasonable request

## Tier-Aware Testing

### Tier 0 (TinyLlama 1.1B)
- ✅ Basic commands, memory, simple queries
- ✅ Zodiac knowledge (keyword-based, instant)
- ⚠️  Limited: Complex reasoning, multi-step analysis
- ✅ Shows upgrade prompts appropriately

### Tier 1 (Llama 3.2)
- ✅ All Tier 0 capabilities
- ✅ Better reasoning and coherence
- ✅ Handles limitation tests without upgrade prompts

### Tier 2 (Mistral 7B)
- ✅ All lower tier capabilities
- ✅ Strong multi-step reasoning
- ✅ Technical depth

### Tier 3 (DeepSeek-Coder)
- ✅ All capabilities
- ✅ Best code generation and analysis

## Key Features

### 1. Zodiac Knowledge System
**File**: `core/zodiac_knowledge.py`

Provides instant, accurate zodiac information without LLM processing:
- All 12 signs with dates, elements, planets, symbols, traits
- Birth date to sign conversion
- Compatibility analysis
- Element grouping
- Sequential order queries

### 2. Tier-Aware Validation
Tests automatically detect current model tier and adjust expectations:
```python
if is_limitation_test and self.current_tier == 0:
    # Should show upgrade prompt
    validate_upgrade_prompt(response)
elif is_limitation_test and self.current_tier > 0:
    # Should handle without upgrade prompt
    validate_successful_response(response)
```

### 3. Real-Time Output Filtering
Test runner filters banner/setup output to show only:
- User input
- Processing status
- AI responses
- Test results

## Running Tests

### Full Suite
```bash
python3 tests/test_all_commands.py
```

### Direct LLM Tests (bypasses full stack)
```bash
python3 tests/test_tinyllama_direct.py
```

### Zodiac Knowledge Only
```bash
./tests/quick_zodiac_test.sh
```

### Tier Limitations Only
```bash
python3 tests/test_tier_limitations.py
```

### With Specific Model
```bash
TEST_MODEL=Mistral python3 tests/test_all_commands.py
```

## Expected Results

### TinyLlama (Tier 0)
- **Pass**: 46/49 tests
- **Upgrade Prompts**: 3 (limitation tests)
- **Fast**: Zodiac queries are instant

### Mistral+ (Tier 2+)
- **Pass**: 49/49 tests
- **No Upgrade Prompts**: Handles all limitation tests

## Configuration

### Context Size
- Default: 512 tokens (too small)
- Updated: 1024 tokens
- Location: `core/llamafile_agent.py`

### System Prompt
- Tier 0: Simple, concise (avoids token limit)
- Tier 2+: More detailed capabilities

### Timeouts
- TinyLlama: 24s
- Mistral: 120s

## File Structure
```
tests/
├── test_all_commands.py       # Main test suite (49 tests)
├── test_tinyllama_direct.py   # Direct LLM tests (10 tests)
├── test_tier_limitations.py   # Tier 0 limitation tests (3 tests)
├── quick_zodiac_test.sh        # Quick zodiac validation
└── README_TEST_SUITE.md        # This file

core/
├── zodiac_knowledge.py         # Keyword-based zodiac handler
├── llamafile_agent.py          # TinyLlama/Mistral interface
└── enhanced_agent.py           # Main routing and processing
```

## Success Criteria

✅ **Zodiac Knowledge**: All 12 tests pass with instant responses  
✅ **Memory Management**: 12 tests covering simple → complex scenarios  
✅ **Tier 0 Limitations**: Correctly prompts for upgrades (2-3/3 tests)  
✅ **Tier Fallback**: Higher tiers don't show unnecessary upgrade prompts  
✅ **Real-time Output**: Clean, filtered test execution display  

## Notes

- Zodiac queries don't require LLM processing (keyword-based)
- Tier 0 limitation tests validate upgrade prompt system
- Memory tests work across conversation sessions
- All tests support tier-aware validation
