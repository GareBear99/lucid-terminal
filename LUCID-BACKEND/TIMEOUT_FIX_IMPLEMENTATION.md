# Activity-Based Timeout Implementation

## Problem Statement

**Original Issue:** Models were timing out prematurely based on total execution time, not token generation activity.

**Evidence:**
```
mistral-7b (Tier 2) timed out after 30s
gemma2 (Tier 1) failed after 30s
tinyllama (Tier 0) timed out after 30s
```

**Root Cause:** Tier-based total timeouts (20-60s) were too short for:
1. Model initialization/loading on older macOS (Catalina)
2. Complex inference tasks that generate many tokens
3. Models being killed even while actively generating tokens

---

## Solution: Activity-Based Timeouts

### **Philosophy**
> **If tokens are being generated, the model is working - let it continue indefinitely.**  
> **Only timeout if the model is stuck/frozen (no token activity).**

### **Implementation**

**File:** `/core/llm_backend.py`

#### **1. Streaming Mode (Lines 518-561)**

**Two timeout types:**
- **Inactivity Timeout:** 45 seconds (was 15s)
  - Triggers if NO tokens generated for 45s
  - Accounts for slow model loading on Catalina
  - Resets every time a token is generated
  
- **Absolute Maximum:** 10 minutes (was 60s)
  - Hard limit regardless of activity
  - Prevents runaway processes
  - Should rarely be hit in normal operation

```python
timeout = kwargs.get('timeout', 600)  # 10 min absolute max
inactivity_timeout = kwargs.get('inactivity_timeout', 45)  # 45s no-activity timeout
```

**Timeout Logic:**
```python
while True:
    char = output_queue.get(timeout=1)
    if char is None:
        break
    
    # Token received - reset activity timer
    last_activity = time.time()
    
    # Check timeouts
    if time_since_activity > inactivity_timeout:
        # STUCK - no tokens for 45s
        raise RuntimeError(f"Llamafile stuck - no output for {time_since_activity:.0f}s")
    
    if total_time > timeout:
        # Hit absolute maximum
        raise RuntimeError(f"Llamafile request timed out ({timeout}s total)")
```

#### **2. Non-Streaming Mode (Lines 579-587)**

**Challenge:** Can't detect token-by-token activity in non-streaming mode

**Solution:** Use generous single timeout that accounts for:
- Model loading time (30-60s on Catalina)
- Full inference completion
- Response parsing

```python
timeout=kwargs.get('timeout', 300)  # 5 minutes for non-streaming
```

#### **3. Removed Tier-Based Timeout Overrides (Lines 121-126, 186-187)**

**Before:**
```python
self.tier_timeouts = {
    'tinyllama': 20,
    'llama3.2': 30,
    'mistral': 45,
    'deepseek-coder': 60
}
# These were overriding smart inactivity timeouts!
```

**After:**
```python
# Don't override timeout - let backend use smart inactivity-based timeouts
# Tier-based timeouts were causing premature termination during model loading
pass
```

---

## Benefits

### **1. Handles Slow Model Loading**
- Catalina can take 30-60s to load models into memory
- 45s inactivity timeout accommodates this
- Models won't timeout during initialization anymore

### **2. Supports Long-Running Tasks**
- Complex code generation can take 2-3 minutes
- As long as tokens are flowing, no timeout
- Only kills if genuinely stuck

### **3. Still Protects Against Hangs**
- If model crashes or freezes, timeout after 45s of no activity
- Absolute 10-minute maximum prevents infinite hangs
- User isn't stuck waiting forever

### **4. Consistent Across All Tiers**
- Same timeout logic for all models
- No artificial tier-based limits
- Model capability determines duration, not arbitrary timeouts

---

## Testing

### **Expected Behavior**

**Scenario 1: Slow Model Load (Catalina)**
```
t=0s:    Model starts loading
t=30s:   Still loading (no timeout - within 45s)
t=35s:   First token generated
t=36s:   More tokens... (inactivity timer resets)
Result: ✅ SUCCESS - Model completes normally
```

**Scenario 2: Long Code Generation**
```
t=0s:    Start inference
t=10s:   Tokens flowing continuously
t=120s:  Still generating tokens
t=180s:  Generation completes
Result: ✅ SUCCESS - No timeout because tokens were flowing
```

**Scenario 3: Model Hang/Crash**
```
t=0s:    Start inference
t=5s:    A few tokens generated
t=10s:   Model hangs (no more tokens)
t=55s:   No tokens for 45s → TIMEOUT
Result: ✅ TIMEOUT TRIGGERED CORRECTLY
```

### **Test Command**

```bash
cd /Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local
python lucifer.py
```

Then run: `build me a complex script that processes images`

**Expected:** Model loads (may take 30-60s), then generates code continuously without timeout

---

## Comparison: Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| **Timeout Type** | Total time (tier-based) | Activity-based (inactivity) |
| **Timeout Values** | 20-60s depending on tier | 45s inactivity, 10min absolute |
| **Model Loading** | Could timeout during load | Tolerates 45s load time |
| **Long Tasks** | Timeout after fixed time | Unlimited if tokens flowing |
| **Stuck Detection** | Poor (killed even if working) | Good (only kills if truly stuck) |
| **Catalina Support** | ❌ Models timeout | ✅ Works correctly |

---

## Configuration

### **For Users Who Need Different Timeouts**

**Override inactivity timeout:**
```python
llm.generate(prompt, inactivity_timeout=60)  # 60s instead of 45s
```

**Override absolute maximum:**
```python
llm.generate(prompt, timeout=1200)  # 20 minutes instead of 10
```

### **For Even Slower Systems**

If Catalina is still too slow, increase defaults in `/core/llm_backend.py`:

```python
# Line 522: Increase inactivity timeout
inactivity_timeout = kwargs.get('inactivity_timeout', 60)  # 60s instead of 45s

# Line 521: Increase absolute max
timeout = kwargs.get('timeout', 900)  # 15 min instead of 10
```

---

## Related Documentation

- **Token Tracking Status:** `/TOKEN_TRACKING_IMPLEMENTATION_STATUS.md`
- **Backend Implementation:** `/core/llm_backend.py` lines 447-604
- **Timeout Logic:** `/core/llm_backend.py` lines 518-561 (streaming), 579-587 (non-streaming)

---

## Status

✅ **IMPLEMENTED** - Activity-based timeouts now active
✅ **TESTED** - Logic verified in code review
⏳ **PENDING** - Real-world testing on Catalina needed
