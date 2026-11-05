# 🌐 LuciferAI FixNet - Complete System Guide

## 🎯 Overview

**LuciferAI FixNet** is a collaborative, self-learning code fix network where every user contributes encrypted fixes to a public GitHub repository. The system intelligently branches fixes, tracks relationships, and builds a relevance dictionary that grows smarter with each contribution.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USER FIX DETECTED                         │
│                  (error in script.py)                        │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. SEARCH RELEVANCE DICTIONARY                              │
│    • Check local fixes (your past solutions)                │
│    • Search remote FixNet (other users' fixes)              │
│    • Calculate relevance scores (similarity + success rate) │
└────────────────────┬────────────────────────────────────────┘
                     ↓
              ┌──────┴──────┐
              │ Fix Found?  │
              └──────┬──────┘
                     │
         ┌───────────┴───────────┐
         ↓                       ↓
    ┌────────┐            ┌──────────┐
    │  YES   │            │    NO    │
    └────┬───┘            └────┬─────┘
         │                     │
         ↓                     ↓
┌────────────────┐    ┌─────────────────┐
│ Apply Known Fix│    │ Create New Fix   │
│ Record Usage   │    │ (manual or AI)   │
└────┬───────────┘    └────┬────────────┘
     │                     │
     ↓                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. ENCRYPT & SIGN                                           │
│    • Fernet encryption (device-bound key)                   │
│    • SHA256 signature for integrity                         │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. UPLOAD TO GITHUB                                         │
│    • Commit to user's branch on FixNet repo                 │
│    • Tag: [LuciferAI AutoFix][user: YOUR_ID][script: X]   │
│    • Push encrypted .enc + signature .sig files            │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. UPDATE DICTIONARY                                        │
│    • Add to local fix_dictionary.json                      │
│    • Create branch link if inspired by another fix         │
│    • Sync refs.json (public metadata for searching)        │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. COLLABORATIVE LEARNING                                   │
│    • Other users can search for similar fixes               │
│    • Relevance scores improve with usage                    │
│    • Branch relationships show what helped solve what       │
└─────────────────────────────────────────────────────────────┘
```

---

## 📂 File Structure

```
~/.luciferai/
├── data/
│   ├── auth.key                      # AES encryption key (device-bound)
│   ├── fix_dictionary.json           # Your fixes + relevance scores
│   └── user_branches.json            # Branch connections
│
├── logs/
│   ├── fixes/
│   │   ├── fix_parser_20251022.json       # Original fix
│   │   ├── fix_parser_20251022.json.enc   # Encrypted
│   │   └── fix_parser_20251022.json.enc.sig  # Signature
│   └── security.log                   # Auth events
│
├── sync/
│   ├── commit_links.json             # Your GitHub commits
│   └── remote_fix_refs.json          # Cached remote fixes
│
└── fixnet/                           # Local GitHub repo
    ├── fixes/                        # Encrypted fixes from all users
    ├── signatures/                   # Signatures
    └── refs.json                     # Public searchable metadata
```

---

## 🔑 Security Model

### Encryption (Fernet)
```python
# Device-bound key generation
device_uuid + username + hostname
    ↓ SHA256
    ↓
AES Key (unique per device)
    ↓
Encrypts all fix content
```

### Signature (SHA256)
```python
encrypted_file
    ↓ SHA256
    ↓
Signature (.sig file)
    ↓
Verifies integrity
```

### What's Public vs Private

| Data | Visibility | Purpose |
|------|-----------|---------|
| Encrypted fix content | Public (GitHub) | Sharing, but can't be read |
| Signature | Public (GitHub) | Verify integrity |
| User ID (hashed) | Public (GitHub) | Attribution (anonymized) |
| Error type | Public (GitHub) | Searchable metadata |
| Script name | Public (GitHub) | Context |
| Timestamp | Public (GitHub) | Recency |
| **Error details** | **Private** (encrypted) | Privacy |
| **Solution code** | **Private** (encrypted) | Privacy |
| **Context** | **Private** (encrypted) | Privacy |

---

## 🧩 Relevance Dictionary System

### How It Works

1. **Error Normalization**
   ```python
   "NameError: name 'session' is not defined on line 42"
       ↓ normalize
   "nameerror: name 'session' is not defined"
   ```

2. **Similarity Calculation**
   ```python
   Current error: "NameError: name 'request' is not defined"
   Dictionary key: "nameerror: name 'session' is not defined"
       ↓ difflib.SequenceMatcher
   Similarity: 0.85 (85% match)
   ```

3. **Relevance Scoring**
   ```python
   Relevance = (
       Similarity × 40% +
       Success Rate × 30% +
       Recency × 20% +
       Usage Count × 10%
   )
   ```

4. **Branching**
   ```
   Fix A (NameError) ──inspired──> Fix B (ImportError)
                     └──solved_similar──> Fix C (NameError variant)
   ```

### Example Flow

```python
# You encounter an error
error = "NameError: name 'config' is not defined"

# Search dictionary
matches = dictionary.search_similar_fixes(error)

# Results:
[
    {
        "fix_hash": "abc123...",
        "solution": "Added: from core import config",
        "relevance_score": 0.92,
        "source": "local",  # Your past fix
        "success_count": 5,
        "usage_count": 5
    },
    {
        "fix_hash": "def456...",
        "error_type": "NameError",
        "relevance_score": 0.45,
        "source": "remote",  # Another user (encrypted)
        "note": "Encrypted - contributed by user XYZ"
    }
]

# Apply best fix
best_fix = matches[0]
apply_solution(best_fix["solution"])

# If it works, create branch
if success:
    dictionary.record_fix_usage(best_fix["fix_hash"], succeeded=True)
    # Score improves: 0.92 → 0.94
```

---

## 🌿 Branch System

### Types of Branches

1. **`solved_similar`** - Your fix was inspired by a similar fix
2. **`alternative_approach`** - Different solution to same problem
3. **`improved_version`** - Better implementation
4. **`prerequisite`** - Had to fix this before solving main issue

### Branch Tree Example

```
Fix A: "NameError: session"
  └─ solved_similar ──> Fix B: "NameError: request"
        └─ solved_similar ──> Fix C: "NameError: config"
              └─ improved_version ──> Fix D: "Better config import"
```

### Creating Branches

```python
# You used Fix B to help solve Fix A
dictionary.create_branch(
    original_fix_hash="abc123",      # Your new fix
    inspired_by_hash="def456",       # Fix that helped
    relationship="solved_similar"
)

# This links them in the graph
# Future users see: "abc123 was inspired by def456"
```

---

## 🚀 Usage Guide

### Setup

1. **Configure GitHub Remote** (one-time)
   ```bash
cd ~/.luciferai/fixnet
   git remote add origin https://github.com/GareBear99/LuciferAI_FixNet.git
   git branch -M main
   git push -u origin main
   ```

2. **Set GitHub Auth** (one-time)
   ```bash
   # Use personal access token
   git config --global credential.helper store
   # Next push will prompt for token, then cache it
   ```

### Automatic Fix Flow (Integrated)

When LuciferAI detects an error, it automatically:

```python
# 1. Search for known fix
best_fix = dictionary.get_best_fix_for_error(error)

if best_fix:
    # 2. Try applying it
    success = apply_fix(best_fix)
    
    # 3. Record result
    dictionary.record_fix_usage(best_fix["fix_hash"], success)
    
    if success:
        print("✅ Applied known fix successfully!")
        # Don't upload - already exists
    else:
        print("⚠️  Known fix didn't work, generating new fix...")
        new_fix = generate_new_fix(error)
        upload_to_fixnet(new_fix)
else:
    # 4. No known fix - create new one
    new_fix = generate_new_fix(error)
    commit_url = upload_to_fixnet(new_fix)
    
    # 5. Add to dictionary
    dictionary.add_fix(
        error_type=classify(error),
        error_signature=error,
        solution=new_fix,
        fix_hash=hash(new_fix),
        context=context,
        commit_url=commit_url
    )
```

### Manual Commands

```python
# Search for fixes
matches = dictionary.search_similar_fixes("NameError: undefined variable")

# Upload a fix
uploader.full_fix_upload_flow(
    script_path="parser.py",
    error="NameError: name 'x' is not defined",
    solution="Added: from module import x",
    context={"line": 42}
)

# View your statistics
dictionary.print_statistics()

# Sync with FixNet
dictionary.sync_with_remote()
```

---

## 📊 Metrics & Learning

### Local Metrics (Your Fixes)
- **Success Rate**: How often your fixes work when reused
- **Usage Count**: How many times you've applied a fix
- **Relevance Score**: Combined metric (0.0 - 1.0)
- **Branch Count**: How many fixes were inspired by yours

### Global Metrics (FixNet)
- **Total Fixes**: All encrypted fixes from all users
- **Error Distribution**: Most common error types
- **User Contributions**: Fixes per user (anonymized)
- **Branch Network**: Connection graph of related fixes

---

## 🔄 Sync Behavior

### Automatic Sync
- On startup: Pull latest refs.json from FixNet
- After fix: Push your encrypted fix + update refs.json
- Hourly: Background sync for new remote fixes

### Manual Sync
```bash
cd ~/.luciferai/fixnet
git pull
# Now search will include new fixes from other users
```

---

## 🎯 Best Practices

### 1. **Always Encrypt Sensitive Data**
   - Never commit raw fixes
   - Always use FixNet uploader
   - Check `.sig` files are generated

### 2. **Create Meaningful Branches**
   - Link related fixes
   - Document relationships
   - Help build knowledge graph

### 3. **Record Fix Outcomes**
   - Mark fixes as succeeded/failed
   - Improves relevance scores
   - Helps other users

### 4. **Sync Regularly**
   - Pull latest fixes
   - Get better search results
   - Contribute to community

### 5. **Review Branch Trees**
   - See what helped solve what
   - Learn from patterns
   - Discover alternative approaches

---

## 🔮 Advanced Features

### Custom Relevance Weights
```python
# Adjust scoring factors
dictionary._calculate_relevance = custom_scorer
```

### Filter by User
```python
# Only search specific users' fixes
matches = [m for m in matches if m['user_id'] in trusted_users]
```

### Export for Analysis
```python
# Export dictionary as graph
import networkx as nx
G = dictionary.to_networkx_graph()
nx.draw(G)
```

---

## 🩸 The LuciferAI Difference

### Traditional Approach
```
Error → Google → StackOverflow → Copy/Paste → Hope
```

### LuciferAI FixNet
```
Error → Local Dictionary → Best Fix (0.92 score)
     ↓ (if not found)
  Remote FixNet → Similar Fixes (encrypted, but metadata useful)
     ↓ (if not found)
  Generate New Fix → Encrypt → Upload → Help Future Users
```

### Why It Works
1. **Privacy**: Your actual code never leaves encrypted
2. **Learning**: System gets smarter with every fix
3. **Community**: Everyone helps everyone (anonymously)
4. **Branching**: See relationships between fixes
5. **Relevance**: Best fixes bubble to the top

---

## 🚧 Future Enhancements

- [ ] AI-powered fix generation (Ollama/Mistral)
- [ ] Visual branch tree explorer
- [ ] Fix recommendation notifications
- [ ] Cross-language fix translation
- [ ] Integration with IDE plugins
- [ ] Real-time collaboration mode

---

**Made with 🩸 by the LuciferAI Community**

---

For issues or contributions:
- GitHub: https://github.com/GareBear99/LuciferAI_FixNet
- Docs: This file
- License: MIT
