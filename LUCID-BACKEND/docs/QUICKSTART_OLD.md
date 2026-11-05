# 🚀 LuciferAI - Quick Start Guide

## \ud83d\udce6 Installation

```bash
cd ~/Desktop/Projects/LuciferAI_Local

# Install core dependencies
pip3 install cryptography rich colorama

# Make executable
chmod +x lucifer.py
```

## 🌐 Setup GitHub FixNet (One-Time)

### 1. Create Public Repository

Go to GitHub and create a new **public** repository:
- Name: `luciferai-fixnet` (or your choice)
- Description: "LuciferAI FixNet - Collaborative Fix Learning"
- **Must be Public** (for collaborative learning)

### 2. Configure Local FixNet

```bash
# Navigate to FixNet repo
cd ~/.luciferai/fixnet

# Set your GitHub remote
git remote add origin https://github.com/YOUR_USERNAME/luciferai-fixnet.git

# Rename branch to main (if needed)
git branch -M main

# Push initial commit
git push -u origin main
```

### 3. Setup GitHub Authentication

```bash
# Use credential helper to cache token
git config --global credential.helper store

# Next push will prompt for credentials:
# Username: YOUR_GITHUB_USERNAME
# Password: YOUR_PERSONAL_ACCESS_TOKEN (not your password!)
```

**Get Personal Access Token:**
1. GitHub → Settings → Developer Settings → Personal Access Tokens
2. Generate new token (classic)
3. Select scopes: `repo` (full control)
4. Copy token and use as password

## \ud83d\ude80 Launch

```bash
cd ~/Desktop/Projects/LuciferAI_Local
./lucifer.py
```

## \ud83d\udcdd Example Commands

```
You > help
👾 Shows all capabilities

You > run test_script.py
⚡ Executes script with auto-fix on error

You > fix broken_script.py
🔧 Manually trigger fix analysis

You > search fixes for 'NameError'
🔍 Search FixNet for similar fixes

You > fixnet sync
🔄 Sync with remote fixes from other users

You > fixnet stats
📊 View your fix dictionary statistics

You > list .
📂 List files in current directory

You > where am i
📍 Show environment info
```

## \ud83e\uddea Demo: Auto-Fix Flow

### Create a broken script:

```bash
echo 'print(json.dumps({"test": "data"}))' > broken.py
```

### Run with LuciferAI:

```
You > run broken.py
```

**What happens:**

1. \ud83d\udea8 Error detected: `NameError: name 'json' is not defined`
2. \ud83d\udd0d Searches dictionary for similar fixes
3. \u2699\ufe0f If found: applies known fix
4. \u2705 If not found: generates new fix (`import json`)
5. \ud83d\udcbe Applies fix to script
6. \ud83d\udd10 Encrypts fix (Fernet)
7. \u270d\ufe0f Signs fix (SHA256)
8. \ud83c\udf0d Uploads to GitHub FixNet
9. \ud83d\udccacUpdates local dictionary
10. \ud83c\udf3f Creates branch links if inspired by other fixes

**Output:**
```
✅ Script fixed and uploaded to FixNet!

Fix Applied:
import json

FixNet Commit:
https://github.com/YOUR_USERNAME/luciferai-fixnet/commit/abc123

Dictionary:
Added to dictionary key: nameerror: name 'json' is not defined...
```

## \ud83e\uddd1\u200d\ud83d\ude80 Advanced Usage

### Search for Fixes

```
You > search fixes for "ImportError: No module named requests"
```

Shows:
- \ud83d\udcc1 **Local fixes**: Your past solutions (can read)
- \ud83c\udf0d **Remote fixes**: Other users' solutions (encrypted, but metadata visible)

### View Statistics

```
You > fixnet stats
```

Shows:
- Total errors indexed
- Total fixes in your dictionary
- Branch connections
- Remote fixes available
- Top error types

### Manual Sync

```
You > fixnet sync
```

Pulls latest `refs.json` from GitHub to see new fixes from other users.

## \ud83d\udcca How Learning Works

### Local Learning (Your Fixes)

```
Error A (first time)
  ↓ fix manually
Fix A created
  ↓ reuse later
Error A (second time)
  ↓ apply known fix
Success! Score improves: 0.70 → 0.85
```

### Collaborative Learning (All Users)

```
User 1: Fixes NameError → Uploads encrypted
User 2: Sees metadata → "NameError fixed by user ABC123"
User 2: Gets similar error → Generates own fix
User 2: Uploads → Creates branch link
User 3: Searches → Finds 2 similar fixes (relevance scores)
User 3: Applies best one → Updates its score
```

### Branching

```
Your Fix
  ↓ inspired by
Remote Fix (encrypted)
  ↓ relationship: solved_similar
Your Dictionary
  ↓ tracks link
Future similar errors → Higher relevance score
```

## \ud83d\udd12 Security & Privacy

### What's Encrypted
- ❌ **Error details** (private)
- ❌ **Solution code** (private)
- ❌ **File contents** (private)
- ❌ **Context** (private)

### What's Public
- \u2705 **User ID** (anonymized hash)
- \u2705 **Error type** (NameError, etc.)
- \u2705 **Script name** (parser.py, etc.)
- \u2705 **Timestamp** (when fixed)
- \u2705 **Signatures** (integrity verification)

### How It Works
```
Your Fix
  ↓ Fernet encryption (device-bound key)
  ↓ SHA256 signature
  ↓ Upload .enc + .sig files
GitHub (public)
  ↓ Other users see metadata only
  ↓ Can't decrypt your fix
  ↓ But know "User XYZ fixed this error type"
```

## \ud83d\udee0\ufe0f Troubleshooting

### Fixes Not Uploading?

```bash
cd ~/.luciferai/fixnet
git remote -v
# Should show your GitHub repo

git push
# Test manual push
```

### Authentication Failed?

```bash
# Reset credentials
git config --global --unset credential.helper
# Next push will prompt again
```

### FixNet Not Found?

The first run creates `~/.luciferai/fixnet/`. If missing:

```bash
rm -rf ~/.luciferai/fixnet
./lucifer.py
# Will reinitialize
```

## \ud83d\udcda File Locations

```
~/.luciferai/
├── data/
│   ├── auth.key                  # Your encryption key
│   ├── fix_dictionary.json       # Your fixes
│   └── user_branches.json        # Branch links
├── logs/
│   ├── fixes/                    # All your fix patches
│   └── security.log              # Auth events
└── fixnet/                       # Local GitHub repo
    ├── fixes/                    # Encrypted fixes (all users)
    ├── signatures/               # Integrity signatures
    └── refs.json                 # Public searchable metadata
```

## \u2699\ufe0f Configuration

Edit `~/.luciferai/fixnet/README.md` after first run to add:
- Repository description
- Contributing guidelines
- Your contact info

## \ud83d\ude80 Next Steps

1. **Run Some Scripts**: Let LuciferAI fix them automatically
2. **Check FixNet**: See your fixes uploaded to GitHub
3. **View Dictionary**: `fixnet stats` to see learning progress
4. **Sync Regularly**: `fixnet sync` to get community fixes
5. **Share**: Tell others about your FixNet repo

## \ud83c\udd98 Tips

- **Let it learn**: The more you use it, the smarter it gets
- **Check branches**: See what fixes helped solve what
- **Review commits**: Your GitHub repo shows all fixes
- **Sync often**: More remote fixes = better search results
- **Trust the scores**: High relevance = proven solutions

---

**Ready? Launch with:** `./lucifer.py`

**Need help?** `help` command shows all capabilities

**Full docs:** See `FIXNET_GUIDE.md` for complete system details

---

Made with \ud83e\ude78 by TheRustySpoon
