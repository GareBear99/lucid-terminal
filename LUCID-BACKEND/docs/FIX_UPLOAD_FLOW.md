# 🌐 Fix Upload to Consensus - Complete Flow

## When Your Fixes Upload to Main Consensus

### ✅ Automatic Upload (Instant)
Your fixes are **automatically uploaded** to the main consensus branches when:

1. **You run a script with an error**
   - Command: `run script.py`
   - LuciferAI detects the error
   - Generates or applies a fix
   - **Immediately uploads to FixNet** (line 367 in enhanced_agent.py)
   - Adds to your local dictionary

2. **You manually fix a script**
   - Command: `fix script.py`
   - Same process as above
   - Automatic upload to consensus

### 📤 Queue System (Rate Limited)
If you hit the **rate limit (5 uploads/hour)**:

1. Fix is **queued locally**
2. Queue processes automatically **every 10 commands**
3. Also processes during daemon idle time
4. Uploads when rate limit slot becomes available

### 🔄 Background Processing
- **Every 10 commands**: Queued uploads are processed (silent)
- **Every 20 commands**: Consensus dictionary syncs (silent)
- **On startup**: Consensus syncs to get latest fixes
- **Hourly**: Daemon processes queue and syncs

---

## Upload Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ 1. You Run Script with Error                            │
│    Command: run script.py                               │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 2. LuciferAI Detects Error                             │
│    • Classifies error type                             │
│    • Searches local dictionary                         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Apply or Generate Fix                               │
│    • Known fix → Apply it                              │
│    • No fix found → Generate new one                   │
│    • Verify fix works                                  │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Upload to FixNet (AUTOMATIC)                        │
│    • Calls: uploader.full_fix_upload_flow()            │
│    • Encrypts fix data (AES-256)                       │
│    • Creates SHA256 signature                          │
│    • Checks rate limit                                 │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ├─ Rate Limit OK? ─────────┐
                      │                           │
                  ✅ YES                      ❌ NO
                      │                           │
                      ▼                           ▼
┌─────────────────────────────┐   ┌───────────────────────────┐
│ Immediate Upload to GitHub  │   │ Add to Upload Queue       │
│ • Consensus repo updated    │   │ • Process every 10 cmds   │
│ • Available to all users    │   │ • Auto-retry when ready   │
└─────────────────────────────┘   └───────────────────────────┘
                      │                           │
                      └─────────┬─────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Add to Your Local Dictionary                        │
│    • Saved in ~/.luciferai/data/fix_dictionary.json    │
│    • Available for future instant fixes                │
│    • Tracks success rate                               │
└─────────────────────────────────────────────────────────┘
```

---

## What Gets Uploaded

### Fix Data Structure:
```json
{
  "fix_hash": "abc123...",
  "user_id": "YOUR_USER_ID",
  "error_type": "NameError",
  "error_signature": "normalized error pattern",
  "solution": "YOUR FIX CODE",
  "timestamp": "2025-10-23T11:49:00",
  "context": {
    "error_type": "NameError",
    "script": "script.py",
    "fixes_applied_this_session": 3
  },
  "commit_url": "https://github.com/...",
  "success_count": 1,
  "usage_count": 1,
  "relevance_score": 1.0
}
```

### Privacy & Security:
- ✅ Fix code is **encrypted** (AES-256)
- ✅ User ID is **hashed**
- ✅ Only **validated users** can upload
- ✅ **Digital signature** prevents tampering
- ✅ File paths and variable names **stripped**

---

## Manual Control

### Force Upload Queue Processing:
```bash
# Not available as direct command - happens automatically
# But you can check queue status:
memory  # Shows session stats including uploads
```

### Manual Consensus Sync:
```bash
fixnet sync  # Pull latest fixes from all users
```

### View Your Uploads:
```bash
github uploads  # See your uploaded fixes
```

---

## Requirements for Uploading

### Must Have:
1. ✅ **GitHub account linked** (`github link`)
2. ✅ **Validated user ID** (automatic after first upload)
3. ✅ **Within rate limit** (5 uploads/hour)
4. ✅ **Valid fix** (tested and working)

### Upload is Blocked If:
- ❌ GitHub not linked
- ❌ Rate limit exceeded (queues for later)
- ❌ Invalid fix signature
- ❌ User ID banned (consensus admins only)

---

## Where Your Fixes Go

### GitHub Repository Structure:
```
luciferai/fix-consensus/
├── fixes/
│   ├── python/
│   │   ├── nameerror/
│   │   │   └── fix_abc123.json
│   │   ├── importerror/
│   │   │   └── fix_def456.json
│   │   └── syntaxerror/
│   │       └── fix_ghi789.json
│   └── javascript/
│       └── ...
└── refs.json  # Index of all fixes
```

### Your Fix Becomes Available:
1. **Immediately** - After successful upload
2. **To all users** - Next time they run `fixnet sync`
3. **In searches** - Appears in `search fixes for "error"`
4. **In program search** - Shows in `program <library>` results
5. **Auto-applied** - Used for similar errors automatically

---

## Summary

### 🚀 Your fixes upload **automatically and instantly** when:
- You run a script and it gets fixed
- You manually fix a script
- Queue processes in background (every 10 commands)

### 🔄 You don't need to do anything - it's all automatic!

### 📊 Check your contribution:
```bash
github uploads     # See your uploaded fixes
fixnet stats      # View dictionary statistics
memory            # Session stats
```

**Your fixes help the entire LuciferAI community! 🌟**
