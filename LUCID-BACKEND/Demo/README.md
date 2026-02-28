# 🧪 LuciferAI Test Suite

This directory contains all test and demo files for the LuciferAI system.

## Test Files

### `test_all.sh`
Comprehensive test suite that runs all core functionality tests.

**Usage:**
```bash
./test_all.sh
```

**Tests:**
- File operations (read, write, list)
- Command execution
- FixNet integration
- Dictionary operations
- Environment info

---

### `test_all_functions.sh`
Extended test suite that tests all major functions and edge cases.

**Usage:**
```bash
./test_all_functions.sh
```

**Tests:**
- All basic operations from `test_all.sh`
- Error handling
- Edge cases
- Performance checks
- Integration tests

---

### `demo_autofix.py`
Demonstration script showing the auto-fix functionality in action.

**Usage:**
```bash
python3 demo_autofix.py
```

**Demonstrates:**
- Error detection
- Automatic fix application
- FixNet integration
- Dictionary learning
- Fix versioning

---

### `test_broken_script.py`
Intentionally broken script used to test the auto-fix system.

**Usage:**
```bash
# Run via LuciferAI
python3 ../lucifer.py
> run tests/test_broken_script.py
```

**Contains:**
- Missing imports
- Undefined variables
- Common Python errors
- Tests auto-fix capabilities

---

### `test_heartbeat.py`
Tests the idle heartbeat animation and color cycling.

**Usage:**
```bash
python3 test_heartbeat.py
```

**Tests:**
- Heartbeat animation
- Color cycling (Red ↔ Purple)
- Emoji alternation (☠️ ↔ 💀)
- Non-blocking behavior
- Terminal state management

---

## Running All Tests

To run the complete test suite:

```bash
# From project root
cd tests
./test_all_functions.sh
```

## Quick Test

For a quick sanity check:

```bash
cd tests
./test_all.sh
```

## Interactive Testing

To test interactively:

```bash
# From project root
python3 lucifer.py

# Then try these commands:
> help
> where am i
> list tests
> run tests/test_broken_script.py
```

## Test Results

All tests should:
- ✅ Execute without errors
- ✅ Display colored output
- ✅ Show proper emoji indicators
- ✅ Return expected results
- ✅ Log activities properly

## Adding New Tests

When adding new tests:

1. **Place in this directory** - Keep all tests organized
2. **Prefix with `test_`** - Easy to identify
3. **Make executable** - `chmod +x test_*.sh`
4. **Document here** - Update this README
5. **Add to test suite** - Include in `test_all_functions.sh`

## Test Categories

### Unit Tests
- Individual function testing
- Isolated component testing
- Mock external dependencies

### Integration Tests
- Multi-component interaction
- FixNet integration
- Database operations

### Demo Scripts
- User-facing demonstrations
- Feature showcases
- Tutorial examples

---

## Troubleshooting Tests

**Test fails with "permission denied":**
```bash
chmod +x test_*.sh
```

**Colors not showing:**
```bash
export TERM=xterm-256color
```

**Can't find modules:**
```bash
# Run from project root
cd ..
python3 -m tests.test_name
```

---

*All tests maintained as part of the LuciferAI project*  
*"Forged in Neon, Born of Silence."* 👾
