#!/usr/bin/env python3
"""
🔧 Migration Script: Add Founder Client ID to Existing Consensus Data
Adds client ID and (Founder) label to all existing templates and fixes.
"""
import json
from pathlib import Path

# Colors
GREEN = "\033[32m"
PURPLE = "\033[35m"
YELLOW = "\033[33m"
CYAN = "\033[36m"
RESET = "\033[0m"

# Your client ID
FOUNDER_ID = "B35EE32A34CE37C2"

# Paths
LUCIFER_HOME = Path.home() / ".luciferai"
TEMPLATES_FILE = LUCIFER_HOME / "consensus" / "templates" / "local_templates.json"
FIX_DICTIONARY = LUCIFER_HOME / "data" / "fix_dictionary.json"

def migrate_templates():
    """Add founder ID to all existing templates."""
    if not TEMPLATES_FILE.exists():
        print(f"{YELLOW}⚠️  No templates file found - skipping{RESET}")
        return 0
    
    with open(TEMPLATES_FILE, 'r') as f:
        templates = json.load(f)
    
    updated_count = 0
    
    for template_hash, template in templates.items():
        # Check if already has author
        if not template.get('author') or template.get('author') == 'unknown':
            template['author'] = FOUNDER_ID
            template['author_label'] = '(Founder)'
            updated_count += 1
            print(f"{CYAN}   ✓ Template: {template.get('name', 'Unknown')}{RESET}")
    
    # Save updated templates
    with open(TEMPLATES_FILE, 'w') as f:
        json.dump(templates, f, indent=2)
    
    return updated_count

def migrate_fixes():
    """Add founder ID to all existing fixes."""
    if not FIX_DICTIONARY.exists():
        print(f"{YELLOW}⚠️  No fix dictionary found - skipping{RESET}")
        return 0
    
    with open(FIX_DICTIONARY, 'r') as f:
        fix_dict = json.load(f)
    
    updated_count = 0
    
    for key, fixes in fix_dict.items():
        for fix in fixes:
            # Check if already has user_id
            if not fix.get('user_id') or fix.get('user_id') == 'unknown':
                fix['user_id'] = FOUNDER_ID
                fix['author_label'] = '(Founder)'
                updated_count += 1
                print(f"{CYAN}   ✓ Fix: {fix.get('error_type', 'Unknown')} - {fix.get('script_name', 'Unknown')}{RESET}")
    
    # Save updated fixes
    with open(FIX_DICTIONARY, 'w') as f:
        json.dump(fix_dict, f, indent=2)
    
    return updated_count

def main():
    print(f"\n{PURPLE}{'='*60}{RESET}")
    print(f"{PURPLE}🔧 Migrating Consensus Data to Founder ID{RESET}")
    print(f"{PURPLE}{'='*60}{RESET}\n")
    
    print(f"{CYAN}👤 Founder ID: {FOUNDER_ID}{RESET}")
    print(f"{CYAN}🏷️  Label: (Founder){RESET}")
    print()
    
    # Migrate templates
    print(f"{YELLOW}📚 Migrating Templates...{RESET}")
    template_count = migrate_templates()
    print(f"{GREEN}✅ Updated {template_count} template(s){RESET}")
    print()
    
    # Migrate fixes
    print(f"{YELLOW}🔧 Migrating Fixes...{RESET}")
    fix_count = migrate_fixes()
    print(f"{GREEN}✅ Updated {fix_count} fix(es){RESET}")
    print()
    
    # Summary
    total = template_count + fix_count
    print(f"{PURPLE}{'='*60}{RESET}")
    print(f"{GREEN}🎉 Migration Complete!{RESET}")
    print(f"{GREEN}   Total Updated: {total} items{RESET}")
    print(f"{GREEN}   - Templates: {template_count}{RESET}")
    print(f"{GREEN}   - Fixes: {fix_count}{RESET}")
    print(f"{PURPLE}{'='*60}{RESET}\n")
    
    print(f"{CYAN}💡 All existing consensus data now attributed to:{RESET}")
    print(f"{CYAN}   {FOUNDER_ID} (Founder){RESET}")
    print()

if __name__ == "__main__":
    main()
