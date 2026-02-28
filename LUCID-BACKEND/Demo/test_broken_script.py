#!/usr/bin/env python3
import json
# Test script with NameError - missing json import

data = {
    "name": "LuciferAI",
    "version": "2.0",
    "features": ["auto-fix", "fixnet", "learning"]
}

# This will fail: json is not imported
print(json.dumps(data, indent=2))
print("If you see this, the auto-fix worked!")
