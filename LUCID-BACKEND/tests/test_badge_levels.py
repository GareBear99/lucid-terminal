#!/usr/bin/env python3
"""
Test badge progression at different levels.
"""
from core.user_stats import UserStatsTracker
from core.founder_config import FOUNDER_ID

def test_progression():
    tracker = UserStatsTracker()
    
    print("=" * 70)
    print("Badge Progression Test - Simulating 6 contributions")
    print("=" * 70)
    
    # Add multiple contributions to see progression
    for i in range(6):
        tracker.update_user_stats(
            user_id=FOUNDER_ID,
            contribution_type='template' if i % 2 == 0 else 'fix',
            item_hash=f'test_hash_{i}',
            item_name=f'Test Item {i}'
        )
    
    # Get Badge 0 status
    badge_0 = tracker.get_badge_0_status(FOUNDER_ID)
    print(f"\n🔹 Badge 0: {badge_0['emoji']} {badge_0['name']}")
    print("   (This badge doesn't count toward the 13-badge collection)")
    
    # Get badge status
    badges_status = tracker.get_all_badges_status(FOUNDER_ID)
    
    # Show overall collection progress
    collection_progress = tracker.calculate_badge_collection_progress(FOUNDER_ID)
    progress_bar = tracker.get_progress_bar(collection_progress['percentage'], width=30)
    
    print("\n🏅 Badge Collection Progress:")
    print(f"   {progress_bar}")
    print(f"   {collection_progress['unlocked_count']}/{collection_progress['total_badges']} badges unlocked")
    print(f"   Total levels: {collection_progress['total_levels']}/{collection_progress['max_levels']}")
    
    # Show reward status
    if collection_progress['reward_13_unlocked']:
        print("   🎉 ALL BADGES COLLECTED! Easter egg unlocked!")
    elif collection_progress['reward_7_unlocked']:
        print("   🎁 7-Badge Gift Unlocked! Keep going for the Easter egg at 13!")
    else:
        next_reward = collection_progress['next_reward']
        if next_reward == 7:
            remaining = 7 - collection_progress['unlocked_count']
            print(f"   🎁 Unlock {remaining} more badge(s) for a special gift!")
        elif next_reward == 13:
            remaining = 13 - collection_progress['unlocked_count']
            print(f"   🥚 Unlock {remaining} more badge(s) for the Easter egg!")
    
    # Show Active Contributor badge progress (should be at level 2: I I ???)
    print("\n📊 Active Contributor Badge Progress:")
    active = [b for b in badges_status if b['id'] == 'active_contributor'][0]
    print(f"   Progress: {active['progress_display']}")
    print(f"   Level: {active['progress_level']}/4")
    print(f"   Next: {active['next_milestone']}")
    print(f"   Status: {'✅ UNLOCKED' if active['unlocked'] else '🔒 IN PROGRESS'}")
    
    print("\n🏅 All Badges:")
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
            
            # Color code by level
            if level == 0:
                status = "🔒"
            elif level == 1:
                status = "🔓"
            elif level == 2:
                status = "🔓🔓"
            elif level == 3:
                status = "🔓🔓🔓"
            else:
                status = "✅"
            
            print(f"   {progress} {badge['name']} {status} - {next_step}")
    
    print("\n" + "="*70)
    print("Legend:")
    print("   ❓ ??? = Level 0 (Locked)")
    print("   🌿 I?? = Level 1 (33% progress - emoji revealed!)")
    print("   🌿 II? = Level 2 (66% progress)")
    print("   🌿 III = Level 3 (99% progress - almost there!)")
    print("   🌿 Active Contributor = Level 4 (UNLOCKED!)")
    print("="*70)

if __name__ == "__main__":
    test_progression()
