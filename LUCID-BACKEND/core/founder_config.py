#!/usr/bin/env python3
"""
🏆 Founder Configuration
Hardcoded founder ID and attribution system.
"""

# Founder Client ID - HARDCODED, DO NOT CHANGE
FOUNDER_ID = "B35EE32A34CE37C2"
FOUNDER_LABEL = "(Founder)"

# Founder metadata
FOUNDER_INFO = {
    "user_id": FOUNDER_ID,
    "label": FOUNDER_LABEL,
    "status": "Original Creator & Primary Contributor",
    "priority": 999,  # Highest priority for attribution
    "permanent": True  # Cannot be changed or transferred
}


def is_founder(user_id: str) -> bool:
    """
    Check if a user ID belongs to the founder.
    
    Args:
        user_id: User's client ID
    
    Returns:
        True if user is founder, False otherwise
    """
    return user_id == FOUNDER_ID


def get_author_label(user_id: str) -> str:
    """
    Get attribution label for a user.
    
    Args:
        user_id: User's client ID
    
    Returns:
        "(Founder)" for founder, "(Member)" for everyone else
    """
    if is_founder(user_id):
        return FOUNDER_LABEL
    return "(Member)"


def format_author_display(user_id: str) -> str:
    """
    Format user ID with label for display.
    
    Args:
        user_id: User's client ID
    
    Returns:
        Formatted string like "B35EE32A34CE37C2 (Founder)" or just user_id
    """
    label = get_author_label(user_id)
    if label:
        return f"{user_id} {label}"
    return user_id


def get_founder_attribution() -> dict:
    """
    Get founder attribution data for FixNet uploads.
    
    Returns:
        Dict with founder attribution metadata
    """
    return {
        "author": FOUNDER_ID,
        "author_label": FOUNDER_LABEL,
        "is_founder": True,
        "priority": FOUNDER_INFO["priority"]
    }
