# 🏆 LuciferAI Founder Registry

## Founder Information

**Client ID:** `B35EE32A34CE37C2`  
**Label:** `(Founder)`  
**Status:** Original Creator & Primary Contributor

---

## About

This client ID belongs to the **founder and original creator** of LuciferAI. All contributions from this ID are automatically tagged with the `(Founder)` label in the FixNet consensus system.

## How to Search Founder Contributions

### Via CLI:
```bash
# View founder's profile
python3 core/user_stats.py profile B35EE32A34CE37C2

# Search founder's templates
LuciferAI search templates --author B35EE32A34CE37C2

# Search founder's fixes
LuciferAI search fixes --author B35EE32A34CE37C2
```

### Via Python API:
```python
from core.user_stats import UserStatsTracker
from core.template_consensus import TemplateConsensus
from core.relevance_dictionary import RelevanceDictionary

# Get founder profile
tracker = UserStatsTracker()
profile = tracker.get_user_profile("B35EE32A34CE37C2")

# Get founder's templates
templates = TemplateConsensus("B35EE32A34CE37C2")
founder_templates = [t for t in templates.local_templates.values() 
                     if t['author'] == "B35EE32A34CE37C2"]

# Get founder's fixes
fixes = RelevanceDictionary("B35EE32A34CE37C2")
# Fixes are automatically attributed to this ID
```

---

## Recognition System

### Badges
The founder automatically receives:
- 🏆 **Founder** - Original creator
- 🌱 **First Contribution** - Started the project
- Additional badges based on contribution milestones

### Priority
- Founder contributions have special attribution in FixNet
- All uploads show `(Founder)` label
- Historical contributions are backdated with founder attribution

---

## FixNet Attribution

When uploading to FixNet consensus:

**Templates:**
```json
{
  "author": "B35EE32A34CE37C2",
  "author_label": "(Founder)",
  "template": "...",
  "keywords": [...]
}
```

**Fixes:**
```json
{
  "user_id": "B35EE32A34CE37C2",
  "author_label": "(Founder)",
  "solution": "...",
  "keywords": [...]
}
```

---

## Attribution Labels

### Founder
- **Label:** `(Founder)`
- **Client ID:** `B35EE32A34CE37C2`
- **Color:** Gold
- **Exclusive:** Only this ID receives this label

### Members
- **Label:** `(Member)`
- **Color:** Cyan
- **Applied to:** All other client IDs
- **Inclusive:** Everyone contributing to FixNet

---

## Notes

- Founder ID is **hardcoded** in the system
- Only the founder ID receives `(Founder)` label
- All other contributors receive `(Member)` label
- Founder status is permanent and cannot be transferred
- Member status is automatic for all contributors

---

**Last Updated:** 2025-11-12  
**System Version:** LuciferAI v1.0
