#!/usr/bin/env python3
"""Quick Soul Combat Tournament Demo"""
import sys
sys.path.insert(0, '/Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local')

from core.soul_system_v2 import Soul, battle_simulation, test_battles
import uuid

if __name__ == "__main__":
    # Run the full tournament
    test_battles()
