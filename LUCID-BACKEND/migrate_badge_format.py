#!/usr/bin/env python3
"""
🔄 Badge Format Migration Script
Converts badge data from old "emoji name" format to new badge ID format.
"""
import json
from pathlib import Path

# Badge mapping from old format to new IDs
BADGE_MAPPING = {
    "🏆 Founder": "founder",
    "🌱 First Contribution": "first_contribution",
    "🌿 Active Contributor": "active_contributor",
    "🌳 Veteran Contributor": "veteran_contributor",
    "⭐ Elite Contributor": "elite_contributor",
    "📚 Template Master": "template_master",
    "🔧 Fix Specialist": "fix_specialist",
    "🌟 Community Favorite": "community_favorite",
    "💎 Quality Contributor": "quality_contributor",
    "🌐 First Fix to FixNet": "first_fix_to_fixnet",
    "📦 First Template to FixNet": "first_template_to_fixnet",
    "🔴 Learning Experience": "learning_experience",
    "✅ Problem Solver": "problem_solver",
    "🚀 Template Pioneer": "template_pioneer"
}

def migrate_badges():
    """Migrate badge format in user stats file."""
    
    # Path to user stats
    stats_file = Path.home() / ".luciferai" / "data" / "user_stats.json"
    
    if not stats_file.exists():
        print("❌ No user stats file found - nothing to migrate")
        return
    
    # Load stats
    print(f"📂 Loading {stats_file}...")
    with open(stats_file, 'r') as f:
        stats = json.load(f)
    
    if not stats:
        print("❌ Stats file is empty - nothing to migrate")
        return
    
    # Process each user
    migrated_users = 0
    migrated_badges = 0
    
    for user_id, profile in stats.items():
        if 'badges' not in profile:
            continue
        
        old_badges = profile['badges']
        new_badges = []
        
        for badge in old_badges:
            if badge in BADGE_MAPPING:
                # Old format - convert to ID
                new_badges.append(BADGE_MAPPING[badge])
                migrated_badges += 1
            elif badge in BADGE_MAPPING.values():
                # Already new format
                new_badges.append(badge)
            else:
                # Unknown badge - keep as is
                print(f"⚠️  Unknown badge format: {badge}")
                new_badges.append(badge)
        
        # Update profile
        if new_badges != old_badges:
            profile['badges'] = new_badges
            migrated_users += 1
    
    # Save migrated stats
    if migrated_users > 0:
        print(f"\n💾 Saving migrated stats...")
        with open(stats_file, 'w') as f:
            json.dump(stats, f, indent=2)
        
        print(f"\n✅ Migration complete!")
        print(f"   • Users migrated: {migrated_users}")
        print(f"   • Badges converted: {migrated_badges}")
    else:
        print("\n✅ No migration needed - all badges already in new format")

if __name__ == "__main__":
    print("🔄 Badge Format Migration Tool")
    print("=" * 60)
    print()
    
    migrate_badges()
