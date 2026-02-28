#!/usr/bin/env python3
"""
Test the badge display system.
"""
from core.user_stats import UserStatsTracker
from core.founder_config import FOUNDER_ID

def test_badges():
    tracker = UserStatsTracker()
    
    # Test with founder (should have founder badge)
    print("=" * 60)
    print(f"Testing Founder ID: {FOUNDER_ID}")
    print("=" * 60)
    
    # Add a contribution to trigger badge awarding
    tracker.update_user_stats(
        user_id=FOUNDER_ID,
        contribution_type='template',
        item_hash='test_hash_123',
        item_name='Test Template'
    )
    
    # Get all badges with status
    badges_status = tracker.get_all_badges_status(FOUNDER_ID)
    
    print("\n🏅 All Badges Status:")
    print("\nUnlocked:")
    for badge in badges_status:
        if badge['unlocked']:
            print(f"   {badge['emoji']} {badge['name']}")
    
    print("\nIn Progress:")
    for badge in badges_status:
        if not badge['unlocked']:
            progress = badge.get('progress_display', '??? ??? ???')
            next_step = badge.get('next_milestone', badge['hint'])
            level = badge.get('progress_level', 0)
            print(f"   {progress} {badge['name']} [Level {level}/4] - {next_step}")
    
    print("\n" + "=" * 60)
    print("✅ Badge system test complete!")
    print(f"   Total badges defined: {len(badges_status)}")
    print(f"   Unlocked: {sum(1 for b in badges_status if b['unlocked'])}")
    print(f"   Locked: {sum(1 for b in badges_status if not b['unlocked'])}")

if __name__ == "__main__":
    test_badges()
